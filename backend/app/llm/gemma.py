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
import time
import typing
from dataclasses import dataclass, field
from typing import Callable, TypeVar

import httpx
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


def coerce_to_schema(data: object, schema: type[BaseModel]) -> object:
    """Gemma sometimes returns just the main list (e.g. the passport items) without the wrapping
    object. Wrap a bare list into the schema's first list-of-objects field so it still validates."""
    if not isinstance(data, list):
        return data
    for name, f in schema.model_fields.items():
        args = typing.get_args(f.annotation)
        if typing.get_origin(f.annotation) is list and args and isinstance(args[0], type) and issubclass(args[0], BaseModel):
            return {name: data}
    return data


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
        self.last_model: str | None = None
        self._unhealthy_until: dict[str, float] = {}

    @property
    def live(self) -> bool:
        return self.settings.live

    @property
    def client(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            # No SDK-level retries (they also retry timeouts, doubling the wait): when a model
            # errors or times out, generate() moves straight to the next Gemma 4 model instead.
            self._client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(
                    timeout=self.settings.gemma_timeout_ms,
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )
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

    def _model_order(self) -> list[str]:
        """Primary model first, then one fallback; models that just failed go last for a few minutes."""
        primary = self.model
        if not self.available_models:
            try:
                self.discover_models()
            except Exception:
                pass
        order = [primary] + [m for m in self.available_models if m != primary][:1]
        now = time.monotonic()
        return sorted(order, key=lambda m: self._unhealthy_until.get(m, 0) > now)

    def generate(
        self,
        prompt: str,
        images: list[ImageInput] | None = None,
        temperature: float = 0.2,
        fast: bool = False,
        json_mode: bool = False,
    ) -> str:
        """
        Thinking is off (minimal) unless GEMMA_THINKING=true: on Founder DNA it cut a call
        from ~28 s to ~9 s with the same output. fast=True also applies the shorter timeout
        used for voice replies. json_mode asks the API for a JSON response.
        """
        from google.genai import errors, types

        parts: list = [types.Part.from_bytes(data=img.data, mime_type=img.mime_type) for img in images or []]
        parts.append(prompt)
        last_exc: Exception | None = None
        # The hosted endpoint often fails instantly with a 500/503 and then succeeds a moment
        # later, so retry the same model once for those. Timeouts (and 504s) mean the model is
        # overloaded: switch to the next model straight away and skip this one for 5 minutes.
        attempts = [(m, n) for m in self._model_order() for n in (1, 2)]
        skip: set[str] = set()
        for model, attempt in attempts:
            if model in skip:
                continue
            if attempt == 2:
                time.sleep(0.6)
            minimal = not self.settings.gemma_thinking
            want_json = json_mode
            while True:
                config = types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=self.settings.gemma_max_output_tokens,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    thinking_config=types.ThinkingConfig(thinking_level="MINIMAL") if minimal else None,
                    response_mime_type="application/json" if want_json else None,
                    # Voice replies must come back quickly; let them fail over sooner.
                    http_options=types.HttpOptions(timeout=self.settings.gemma_fast_timeout_ms) if fast else None,
                )
                try:
                    resp = self.client.models.generate_content(model=model, contents=parts, config=config)
                except errors.ClientError as exc:
                    msg = str(exc).lower()
                    # Drop an option this model doesn't support and ask again.
                    if minimal and "thinking" in msg and "not supported" in msg:
                        minimal = False
                        continue
                    if want_json and ("mime" in msg or "json" in msg):
                        want_json = False
                        continue
                    raise
                except (errors.ServerError, httpx.TimeoutException) as exc:
                    log.warning("Gemma model %s failed (attempt %d): %s", model, attempt, str(exc)[:160])
                    last_exc = exc
                    transient = isinstance(exc, errors.ServerError) and getattr(exc, "code", None) in (500, 503)
                    if attempt == 2 or not transient:
                        self._unhealthy_until[model] = time.monotonic() + 300
                        skip.add(model)
                    break
                text = resp.text or ""
                if not text.strip():
                    raise GemmaError("Gemma returned an empty response")
                self.last_model = model
                return text
        raise last_exc or GemmaError("No Gemma model responded")

    def generate_json(
        self,
        prompt: str,
        schema: type[T],
        fallback: Callable[[], T],
        images: list[ImageInput] | None = None,
        fast: bool = False,
    ) -> tuple[T, GenMeta]:
        if not self.live:
            return fallback(), GenMeta(source="demo", notes=["No GEMINI_API_KEY set; deterministic demo output."])

        full_prompt = (
            f"{prompt}\n\nReturn ONLY valid JSON matching this JSON Schema. No prose, no markdown fences.\n"
            f"{json.dumps(schema.model_json_schema())}"
        )
        try:
            raw = self.generate(full_prompt, images, fast=fast, json_mode=True)
        except Exception as exc:  # network, quota, safety block
            log.warning("Gemma call failed: %s", exc)
            return fallback(), GenMeta(source="fallback", notes=[f"Gemma call failed: {exc}"[:300]])

        try:
            return schema.model_validate(coerce_to_schema(extract_json(raw), schema)), GenMeta(source="gemma", model=self.last_model)
        except (ValueError, ValidationError) as first_err:
            repair = (
                "The JSON below does not match the schema. Fix it and return ONLY the corrected JSON.\n"
                f"Error: {str(first_err)[:800]}\n\nSchema:\n{json.dumps(schema.model_json_schema())}\n\nJSON:\n{raw[:20000]}"
            )
            try:
                fixed = self.generate(repair, temperature=0.0, fast=True, json_mode=True)
                return schema.model_validate(coerce_to_schema(extract_json(fixed), schema)), GenMeta(
                    source="gemma", model=self.last_model, notes=["Output repaired once."]
                )
            except Exception as exc:
                log.warning("Gemma repair failed: %s", exc)
                return fallback(), GenMeta(
                    source="fallback", model=self.last_model, notes=["Gemma output could not be validated; showing rule-based result."]
                )


_gemma: Gemma | None = None


def get_gemma() -> Gemma:
    global _gemma
    if _gemma is None:
        _gemma = Gemma()
    return _gemma
