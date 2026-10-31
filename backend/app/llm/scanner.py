"""Gemini file scanning: turns uploads into text before Gemma reasons over them.

Gemini reads PDFs natively (including scanned pages), images and photos, and
the text we extract locally from Word, PowerPoint, Excel, CSV and text files.
It returns a faithful transcript per file. Gemma 4 then does all the reasoning
(Founder DNA, document explanations) on that transcript.

If scanning is off (no key, demo mode or GEMINI_SCAN_MODEL empty) or every
Gemini model fails, callers fall back to sending the locally extracted text and
images straight to Gemma, so uploads keep working.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from app.config import Settings, get_settings
from app.ingest.documents import IMAGE_EXT, MAX_TEXT_CHARS, IngestResult, _normalise_image

log = logging.getLogger(__name__)

# Tried after the configured model; the alias always points at a current Flash model.
FALLBACK_SCAN_MODELS = ("gemini-flash-latest",)
MAX_PDF_BYTES = 4 * 1024 * 1024
MAX_SCAN_IMAGES = 12

SCAN_PROMPT = (
    "You are a document scanner. Transcribe the uploaded files so another model can analyse them "
    "without seeing the originals.\n"
    "For each file, start a section with a line '--- <file name> ---' and then:\n"
    "- copy all readable text in reading order (slides, headings, bullet points, captions, small print);\n"
    "- write tables as rows with cells separated by ' | ';\n"
    "- describe charts, diagrams, product screenshots, logos and photos in one or two factual sentences, "
    "including any numbers, labels, country names and certifications they show.\n"
    "Do not summarise away details, do not add opinions or advice, and do not invent anything. "
    "Write [unreadable] for parts you cannot read. Keep the original language of the text."
)


@dataclass
class ScanResult:
    text: str = ""
    model: str | None = None
    files: list[str] = field(default_factory=list)  # files Gemini was given
    notes: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.model and self.text.strip())


class GeminiScanner:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._client = None

    @property
    def enabled(self) -> bool:
        return self.settings.live and bool(self.settings.gemini_scan_model.strip())

    @property
    def client(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(
                    timeout=self.settings.gemini_scan_timeout_ms,
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )
        return self._client

    def models(self) -> list[str]:
        primary = self.settings.gemini_scan_model.strip()
        return [primary] + [m for m in FALLBACK_SCAN_MODELS if m != primary]

    def build_parts(self, files: list[tuple[str, str, bytes]], doc: IngestResult) -> tuple[list, list[str]]:
        """Gemini parts for every file it can read, plus the names of those files."""
        from google.genai import types

        local_text = dict(doc.text_blocks)
        parts: list = []
        covered: list[str] = []
        images = 0
        for name, ctype, data in files:
            ext = Path(name.lower()).suffix
            if (ctype == "application/pdf" or ext == ".pdf") and len(data) <= MAX_PDF_BYTES:
                parts += [f"--- {name} ---", types.Part.from_bytes(data=data, mime_type="application/pdf")]
            elif ctype.startswith("image/") or ext in IMAGE_EXT:
                if images >= MAX_SCAN_IMAGES:
                    continue
                try:
                    img = _normalise_image(data)
                except Exception:
                    continue
                images += 1
                parts += [f"--- {name} ---", types.Part.from_bytes(data=img.data, mime_type=img.mime_type)]
            elif local_text.get(name, "").strip():
                # Gemini can't open Office files directly, so send the text we extracted.
                parts += [f"--- {name} ---\n{local_text[name][:MAX_TEXT_CHARS]}"]
            else:
                continue
            covered.append(name)
        return parts, covered

    def scan(self, files: list[tuple[str, str, bytes]], doc: IngestResult) -> ScanResult:
        if not self.enabled or not files:
            return ScanResult()
        parts, covered = self.build_parts(files, doc)
        if not parts:
            return ScanResult()

        from google.genai import errors, types

        last_error = ""
        for model in self.models():
            no_thinking = True
            while True:
                config = types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=self.settings.gemma_max_output_tokens,
                    # Transcription needs no reasoning; skipping it keeps the scan fast.
                    thinking_config=types.ThinkingConfig(thinking_budget=0) if no_thinking else None,
                )
                try:
                    resp = self.client.models.generate_content(model=model, contents=[*parts, SCAN_PROMPT], config=config)
                except errors.ClientError as exc:
                    if no_thinking and "thinking" in str(exc).lower():
                        no_thinking = False
                        continue
                    last_error = str(exc)
                    log.warning("Gemini scan with %s rejected: %s", model, last_error[:160])
                    break
                except (errors.ServerError, httpx.TimeoutException) as exc:
                    last_error = str(exc) or exc.__class__.__name__
                    log.warning("Gemini scan with %s failed: %s", model, last_error[:160])
                    break
                text = (resp.text or "").strip()
                if not text:
                    last_error = "empty response"
                    break
                return ScanResult(text=text[:MAX_TEXT_CHARS], model=model, files=covered, notes=[f"Files scanned by {model}."])
        return ScanResult(notes=[f"Gemini scan unavailable ({last_error[:120]}); Gemma 4 read the files directly."])


_scanner: GeminiScanner | None = None


def get_scanner() -> GeminiScanner:
    global _scanner
    if _scanner is None:
        _scanner = GeminiScanner()
    return _scanner


@dataclass
class UploadContent:
    """What Gemma gets from a set of uploads: Gemini's transcript, or local text plus images as a fallback."""

    text: str
    images: list
    filenames: list[str]
    warnings: list[str]  # file warnings plus a note on how the files were read
    scan: ScanResult

    @property
    def scan_model(self) -> str | None:
        return self.scan.model if self.scan.ok else None


def read_uploads(files: list[tuple[str, str, bytes]]) -> UploadContent:
    from app.ingest.documents import ingest

    doc = ingest(files)
    scan = get_scanner().scan(files, doc)
    if scan.ok:
        # Local "couldn't read" warnings don't apply to files Gemini transcribed.
        missed = [n for n in doc.filenames if n not in scan.files]
        warnings = [w for w in doc.warnings if any(w.startswith(f"{n}:") for n in missed)]
        return UploadContent(scan.text, [], doc.filenames, warnings + scan.notes, scan)
    return UploadContent(doc.combined_text, doc.images, doc.filenames, doc.warnings + scan.notes, scan)
