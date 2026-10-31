"""Thin wrapper around Gemma 4 on the Gemini API.

Every structured call goes through `generate_json`, which:
1. asks Gemma for JSON only,
2. parses + validates it against a Pydantic model,
3. makes one repair call if that fails,
4. falls back to a deterministic, non-LLM builder when there is no key or the
   call fails, and reports which path produced the result.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Callable, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass
class ImageInput:
    data: bytes
    mime_type: str


@dataclass
class GenMeta:
    source: str  # "gemma" | "demo" | "fallback"
    model: str | None = None
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"source": self.source, "model": self.model, "notes": self.notes}


class GemmaError(RuntimeError):
    pass


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def extract_json(text: str) -> object:
    """Pull the first JSON object/array out of a model reply."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i != -1]
    if not starts:
        raise ValueError("no JSON found in model output")
    start = min(starts)
    end = max(cleaned.rfind("}"), cleaned.rfind("]"))
    if end <= start:
        raise ValueError("unterminated JSON in model output")
    return json.loads(cleaned[start : end + 1])


def _model_rank(name: str) -> tuple[int, float]:
    is_it = 1 if "-it" in name else 0
    size = re.search(r"(\d+(?:\.\d+)?)b", name)
    return (is_it, float(size.group(1)) if size else 0.0)


class Gemma:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._client = None
        self._model: str | None = self.settings.gemma_model or None
        self.available_models: list[str] = []

    @property
    def live(self) -> bool:
        return self.settings.live

    @property
    def client(self):
        if self._client is None:
            from google import genai

            self._client = genai.Client(api_key=self.settings.gemini_api_key)
        return self._client

    def discover_models(self) -> list[str]:
        names = []
        for m in self.client.models.list():
            name = (m.name or "").removeprefix("models/")
            if "gemma-4" in name:
                names.append(name)
        self.available_models = sorted(names, key=_model_rank, reverse=True)
        return self.available_models

    @property
    def model(self) -> str:
        if self._model:
            return self._model
        models = self.discover_models()
        if not models:
            raise GemmaError("No Gemma 4 models are visible to this API key. Set GEMMA_MODEL explicitly.")
        self._model = models[0]
        log.info("Auto-selected Gemma model %s", self._model)
        return self._model

    def generate(self, prompt: str, images: list[ImageInput] | None = None, temperature: float = 0.2) -> str:
        from google.genai import types

        parts: list = [types.Part.from_bytes(data=img.data, mime_type=img.mime_type) for img in images or []]
        parts.append(prompt)
        resp = self.client.models.generate_content(
            model=self.model,
            contents=parts,
            config=types.GenerateContentConfig(temperature=temperature),
        )
        text = resp.text or ""
        if not text.strip():
            raise GemmaError("Gemma returned an empty response")
        return text

    def generate_json(
        self,
        prompt: str,
        schema: type[T],
        fallback: Callable[[], T],
        images: list[ImageInput] | None = None,
    ) -> tuple[T, GenMeta]:
        if not self.live:
            return fallback(), GenMeta(source="demo", notes=["No GEMINI_API_KEY set; deterministic demo output."])

        full_prompt = (
            f"{prompt}\n\nReturn ONLY valid JSON matching this JSON Schema. No prose, no markdown fences.\n"
            f"{json.dumps(schema.model_json_schema())}"
        )
        try:
            raw = self.generate(full_prompt, images)
        except Exception as exc:  # network, quota, safety block
            log.warning("Gemma call failed: %s", exc)
            return fallback(), GenMeta(source="fallback", notes=[f"Gemma call failed: {exc}"[:300]])

        try:
            return schema.model_validate(extract_json(raw)), GenMeta(source="gemma", model=self.model)
        except (ValueError, ValidationError) as first_err:
            repair = (
                "The JSON below does not match the schema. Fix it and return ONLY the corrected JSON.\n"
                f"Error: {str(first_err)[:800]}\n\nSchema:\n{json.dumps(schema.model_json_schema())}\n\nJSON:\n{raw[:6000]}"
            )
            try:
                fixed = self.generate(repair, temperature=0.0)
                return schema.model_validate(extract_json(fixed)), GenMeta(
                    source="gemma", model=self.model, notes=["Output repaired once."]
                )
            except Exception as exc:
                log.warning("Gemma repair failed: %s", exc)
                return fallback(), GenMeta(
                    source="fallback", model=self.model, notes=["Gemma output could not be validated; showing rule-based result."]
                )


_gemma: Gemma | None = None


def get_gemma() -> Gemma:
    global _gemma
    if _gemma is None:
        _gemma = Gemma()
    return _gemma
