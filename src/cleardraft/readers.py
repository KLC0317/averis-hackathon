"""Safe document readers returning traceable source blocks.

Readers are intentionally side-effect free: macros, external links, and
arbitrary paths are never executed. Optional parsers are detected at runtime
and produce a visible read failure when unavailable.
"""

from __future__ import annotations

import hashlib
import io
import mimetypes
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class EvidenceBlock:
    block_id: str
    text: str
    locator: dict[str, Any]
    kind: str = "text"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DocumentReadResult:
    sha256: str
    filename: str
    detected_format: str
    blocks: list[EvidenceBlock]
    warnings: list[str]
    error: str | None = None
    parser_version: str = "1"
    ocr_used: bool = False

    @property
    def text(self) -> str:
        return "\n".join(block.text for block in self.blocks)

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["blocks"] = [x.to_dict() for x in self.blocks]
        return out


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _result(data: bytes, filename: str, fmt: str, blocks: list[EvidenceBlock], warnings: list[str] | None = None, error: str | None = None) -> DocumentReadResult:
    return DocumentReadResult(_sha(data), Path(filename).name, fmt, blocks, warnings or [], error)


def read_txt(data: bytes, filename: str = "document.txt") -> DocumentReadResult:
    warnings: list[str] = []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
        warnings.append("invalid_utf8_replaced")
    if "\ufffd" in text:
        warnings.append("replacement_characters_present")
    blocks = [EvidenceBlock(f"line-{idx}", line, {"kind": "text_lines", "start_line": idx, "end_line": idx})
              for idx, line in enumerate(text.splitlines(), start=1)]
    return _result(data, filename, "txt", blocks, warnings)


def read_pdf(data: bytes, filename: str = "document.pdf") -> DocumentReadResult:
    try:
        try:
            import pymupdf as fitz  # PyMuPDF's current import name
        except ImportError:
            import fitz  # compatibility with older PyMuPDF releases
    except Exception:
        return _result(data, filename, "pdf", [], ["pymupdf_unavailable"], "PDF reader unavailable; install pymupdf")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        blocks: list[EvidenceBlock] = []
        warnings: list[str] = []
        ocr_used = False
        for pno, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            if text.strip():
                blocks.append(EvidenceBlock(f"page-{pno}", text, {"kind": "page", "page": pno}, "page_text"))
            else:
                warnings.append(f"page_{pno}_has_no_text")
                # PyMuPDF's OCR bridge invokes a locally installed Tesseract.
                # It is optional; failure remains a visible review condition.
                try:
                    ocr_page = page.get_textpage_ocr(dpi=150, full=True)
                    ocr_text = page.get_text("text", textpage=ocr_page) or ""
                    if ocr_text.strip():
                        blocks.append(EvidenceBlock(f"page-{pno}-ocr", ocr_text,
                                                    {"kind": "page", "page": pno, "ocr": True}, "ocr_text"))
                        ocr_used = True
                except Exception:
                    warnings.append(f"page_{pno}_ocr_unavailable")
        if not blocks:
            warnings.append("ocr_required")
        result = _result(data, filename, "pdf", blocks, warnings)
        result.ocr_used = ocr_used
        return result
    except Exception as exc:
        return _result(data, filename, "pdf", [], [], f"pdf_read_failed: {type(exc).__name__}")


def read_docx(data: bytes, filename: str = "document.docx") -> DocumentReadResult:
    try:
        from docx import Document
    except Exception:
        return _result(data, filename, "docx", [], ["python_docx_unavailable"], "DOCX reader unavailable; install python-docx")
    try:
        doc = Document(io.BytesIO(data))
        blocks: list[EvidenceBlock] = []
        idx = 0
        for pidx, p in enumerate(doc.paragraphs):
            if p.text.strip():
                idx += 1
                blocks.append(EvidenceBlock(f"paragraph-{pidx}", p.text, {"kind": "paragraph", "paragraph": pidx}))
        for tidx, table in enumerate(doc.tables):
            for ridx, row in enumerate(table.rows):
                vals = [cell.text.strip() for cell in row.cells]
                if any(vals):
                    idx += 1
                    blocks.append(EvidenceBlock(f"table-{tidx}-row-{ridx}", " | ".join(vals),
                                                {"kind": "table_cell_row", "table": tidx, "row": ridx}, "table"))
        for sidx, section in enumerate(doc.sections):
            for area_name, area in (("header", section.header), ("footer", section.footer)):
                for pidx, paragraph in enumerate(area.paragraphs):
                    if paragraph.text.strip():
                        blocks.append(EvidenceBlock(f"{area_name}-{sidx}-{pidx}", paragraph.text,
                                                    {"kind": area_name, "section": sidx, "paragraph": pidx}))
        return _result(data, filename, "docx", blocks)
    except Exception as exc:
        return _result(data, filename, "docx", [], [], f"docx_read_failed: {type(exc).__name__}")


def read_xlsx(data: bytes, filename: str = "document.xlsx") -> DocumentReadResult:
    try:
        import openpyxl
    except Exception:
        return _result(data, filename, "xlsx", [], ["openpyxl_unavailable"], "XLSX reader unavailable; install openpyxl")
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=False, data_only=False, keep_links=False)
        # A second view exposes cached formula results without evaluating any
        # workbook code. Formula text and cached value are retained together.
        wb_values = openpyxl.load_workbook(io.BytesIO(data), read_only=False, data_only=True, keep_links=False)
        blocks: list[EvidenceBlock] = []
        warnings: list[str] = []
        for ws in wb.worksheets:
            if ws.sheet_state != "visible":
                warnings.append(f"hidden_sheet_skipped:{ws.title}")
                continue
            merged = list(ws.merged_cells.ranges)
            value_ws = wb_values[ws.title]
            for row in ws.iter_rows():
                vals: list[str] = []
                addresses: list[str] = []
                for cell in row:
                    if cell.value is None:
                        continue
                    val = str(cell.value)
                    if isinstance(cell.value, str) and cell.value.startswith("="):
                        cached = value_ws[cell.coordinate].value
                        if cached is not None:
                            val = f"{cell.value} [cached: {cached}]"
                        else:
                            warnings.append(f"formula_without_cached_value:{ws.title}!{cell.coordinate}")
                    if not val.strip():
                        continue
                    vals.append(val)
                    addresses.append(cell.coordinate)
                if vals:
                    blocks.append(EvidenceBlock(f"{ws.title}-{row[0].row}", " | ".join(vals),
                        {"kind": "worksheet_cells", "sheet": ws.title, "cells": addresses,
                         "merged_ranges": [str(x) for x in merged if any(cell.coordinate in x for cell in row)]}, "table"))
        return _result(data, filename, "xlsx", blocks, warnings)
    except Exception as exc:
        return _result(data, filename, "xlsx", [], [], f"xlsx_read_failed: {type(exc).__name__}")


def read_document(data: bytes, filename: str = "document") -> DocumentReadResult:
    """Read by content signature/extension. The source filename is metadata only."""
    suffix = Path(filename).suffix.casefold()
    if data.startswith(b"%PDF") or suffix == ".pdf":
        return read_pdf(data, filename)
    if suffix == ".docx" or data[:2] == b"PK" and b"word/" in data[:4096]:
        return read_docx(data, filename)
    if suffix == ".xlsx" or data[:2] == b"PK" and b"xl/" in data[:4096]:
        return read_xlsx(data, filename)
    return read_txt(data, filename)


def read_path(path: str | Path, root: str | Path | None = None) -> DocumentReadResult:
    p = Path(path)
    if root is not None:
        rootp = Path(root).resolve()
        try:
            p = p.resolve()
            p.relative_to(rootp)
        except ValueError:
            raise ValueError("document path escapes configured root")
    return read_document(p.read_bytes(), p.name)
