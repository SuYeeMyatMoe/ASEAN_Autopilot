"""Turn uploaded founder/regulatory files into text + image parts for Gemma.

Supported: PDF (text, plus embedded page images for scanned PDFs), Word (.docx),
PowerPoint (.pptx), Excel (.xlsx), CSV/TSV, plain text, Markdown, JSON, HTML,
and images (PNG, JPEG, WebP, GIF, BMP, TIFF, HEIC/HEIF).
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageOps

from app.llm.gemma import ImageInput

try:  # iPhone photos
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # pragma: no cover - optional
    pass

MAX_TEXT_CHARS = 18_000
MAX_IMAGE_EDGE = 1600
MAX_IMAGES = 8
MAX_PDF_PAGE_IMAGES = 4

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif"}
TEXT_EXT = {".txt", ".md", ".markdown", ".json", ".html", ".htm", ".xml"}
LEGACY = {".doc": ".docx", ".ppt": ".pptx", ".xls": ".xlsx", ".pages": ".pdf", ".key": ".pdf", ".numbers": ".xlsx"}


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

    def add_image(self, img: ImageInput, name: str) -> None:
        if len(self.images) >= MAX_IMAGES:
            if not any("images are analysed" in w for w in self.warnings):
                self.warnings.append(f"Only the first {MAX_IMAGES} images are analysed.")
            return
        self.images.append(img)


def _normalise_image(data: bytes) -> ImageInput:
    img = Image.open(io.BytesIO(data))
    img.seek(0)  # first frame of GIF/TIFF
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))  # flatten transparency onto white
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return ImageInput(data=buf.getvalue(), mime_type="image/jpeg")


def _pdf(data: bytes, name: str, result: IngestResult) -> None:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = reader.pages[:30]
    text = "\n".join((p.extract_text() or "") for p in pages)
    if text.strip():
        result.text_blocks.append((name, text))
        return
    # Scanned PDF: send the embedded page images to Gemma instead.
    added = 0
    for page in pages:
        for im in getattr(page, "images", []):
            try:
                result.add_image(_normalise_image(im.data), name)
                added += 1
            except Exception:
                continue
            break  # one image per page is enough
        if added >= MAX_PDF_PAGE_IMAGES:
            break
    if not added:
        result.warnings.append(f"{name}: no readable text or images. Upload screenshots of the pages instead.")


def _pptx(data: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    lines = []
    for i, slide in enumerate(prs.slides, 1):
        chunks = [sh.text_frame.text for sh in slide.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
        if chunks:
            lines.append(f"[Slide {i}] " + " | ".join(chunks))
    return "\n".join(lines)


def _docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    lines = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _xlsx(data: bytes) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    lines = []
    for ws in wb.worksheets[:3]:
        lines.append(f"[Sheet {ws.title}]")
        for row in ws.iter_rows(max_row=200, values_only=True):
            cells = [str(v) for v in row if v not in (None, "")]
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _csv(data: bytes, delimiter: str) -> str:
    text = data.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))[:300]
    return "\n".join(" | ".join(r) for r in rows if any(c.strip() for c in r))


def _plain(data: bytes, ext: str) -> str:
    text = data.decode("utf-8-sig", errors="replace")
    if ext in (".html", ".htm", ".xml"):
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text)
    elif ext == ".json":
        try:
            text = json.dumps(json.loads(text), ensure_ascii=False, indent=1)
        except ValueError:
            pass
    return text


def ingest(files: list[tuple[str, str, bytes]]) -> IngestResult:
    """files: (filename, content_type, bytes)."""
    result = IngestResult()
    for name, ctype, data in files:
        result.filenames.append(name)
        ext = Path(name.lower()).suffix
        try:
            if ctype.startswith("image/") or ext in IMAGE_EXT:
                result.add_image(_normalise_image(data), name)
            elif ctype == "application/pdf" or ext == ".pdf":
                _pdf(data, name, result)
            elif ext == ".pptx":
                result.text_blocks.append((name, _pptx(data)))
            elif ext == ".docx":
                result.text_blocks.append((name, _docx(data)))
            elif ext in (".xlsx", ".xlsm"):
                result.text_blocks.append((name, _xlsx(data)))
            elif ext in (".csv", ".tsv"):
                result.text_blocks.append((name, _csv(data, "\t" if ext == ".tsv" else ",")))
            elif ext in TEXT_EXT or ctype.startswith("text/"):
                result.text_blocks.append((name, _plain(data, ext)))
            elif ext in LEGACY:
                result.warnings.append(f"{name}: older {ext} files can't be read. Save it as {LEGACY[ext]} or PDF and upload again.")
            else:
                result.warnings.append(f"{name}: this file type isn't supported, so it was skipped.")
        except Exception as exc:
            result.warnings.append(f"{name}: could not be read ({exc.__class__.__name__}). Try saving it as PDF.")
    result.text_blocks = [(n, t) for n, t in result.text_blocks if t.strip()]
    return result
