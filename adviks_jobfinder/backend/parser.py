import pdfplumber
import io

def extract_text(file_bytes: bytes, filename: str = "") -> str:
    """Extract text from PDF (preferred) or fall back to UTF-8 plain text.
    Supports the documented TXT upload flow and prevents crashes on non-PDFs.
    """
    # Fast path: if clearly not a PDF (magic bytes or extension), treat as text
    is_probably_pdf = file_bytes[:4] == b"%PDF" or (filename.lower().endswith((".pdf", ".PDF")))
    if not is_probably_pdf:
        try:
            return file_bytes.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            return "\n".join(
                page.extract_text() or "" for page in pdf.pages
            ).strip()
    except Exception:
        # Fallback: maybe it was a mislabeled text file or corrupt PDF — return what we can
        try:
            return file_bytes.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""