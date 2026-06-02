"""Fetch user resume PDF as base64 for application attachments."""

import base64

from db import get_user_resumes, get_resume_file


async def get_resume_pdf_base64(user_id: str, resume_id: str | None = None) -> tuple[str, str]:
    """
    Return (base64_pdf, resume_id).
    Uses stored PDF in Supabase Storage from resume upload.
    """
    rid = resume_id
    if not rid:
        resumes = get_user_resumes(user_id)
        if not resumes:
            raise RuntimeError("No resume found — upload a PDF resume first")
        rid = resumes[0]["id"]

    pdf_bytes = get_resume_file(rid)
    if not pdf_bytes:
        raise RuntimeError(
            "Resume PDF not found in storage — re-upload your resume PDF or generate one from the editor"
        )

    return base64.b64encode(pdf_bytes).decode("ascii"), rid
