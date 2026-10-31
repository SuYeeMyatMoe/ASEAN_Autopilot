"""Turn uploaded founder/regulatory files into text + image parts for Gemma."""

from __future__ import annotations

import io
from dataclasses import dataclass, field

from PIL import Image

from app.llm.gemma import ImageInput

MAX_TEXT_CHARS = 18_000
MAX_IMAGE_EDGE = 1600
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@dataclass
class IngestResult:
    text_blocks: list[tuple[str, str]] = field(default_factory=list)  # (filename, text)
    images: list[ImageInput] = field(default_factory=list)
    filenames: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def combined_text(self) -> str:
        out = "\n\n".join(f"--- {name} ---\n{text}" for name, text in self.text_blocks)
        return out[:MAX_TEXT_CHARS]


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:30])


def _pptx_text(data: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    lines = []
    for i, slide in enumerate(prs.slides, 1):
        chunks = [sh.text_frame.text for sh in slide.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
        if chunks:
            lines.append(f"[Slide {i}] " + " | ".join(chunks))
    return "\n".join(lines)


def _normalise_image(data: bytes) -> ImageInput:
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return ImageInput(data=buf.getvalue(), mime_type="image/jpeg")


def ingest(files: list[tuple[str, str, bytes]]) -> IngestResult:
    """files: (filename, content_type, bytes)."""
    result = IngestResult()
    for name, ctype, data in files:
        result.filenames.append(name)
        lower = name.lower()
        try:
            if ctype in IMAGE_TYPES or lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                result.images.append(_normalise_image(data))
            elif ctype == "application/pdf" or lower.endswith(".pdf"):
                text = _pdf_text(data)
                if text.strip():
                    result.text_blocks.append((name, text))
                else:
                    result.warnings.append(f"{name}: no extractable text (scanned PDF?). Upload page screenshots instead.")
            elif lower.endswith(".pptx"):
                result.text_blocks.append((name, _pptx_text(data)))
            elif lower.endswith((".txt", ".md")):
                result.text_blocks.append((name, data.decode("utf-8", errors="replace")))
            else:
                result.warnings.append(f"{name}: unsupported file type, skipped.")
        except Exception as exc:
            result.warnings.append(f"{name}: could not be read ({exc.__class__.__name__}).")
    return result
