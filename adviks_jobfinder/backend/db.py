"""
Supabase database layer — replaces the old SQLite db.py.

Tables expected in Supabase:
  profiles, resumes, jobs, roadmaps, polished_data, applications
"""

import json, os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH, override=False)

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if not url or not key:
            # Re-read from .env in case it was created after the process started.
            load_dotenv(_ENV_PATH, override=True)
            url = os.getenv("SUPABASE_URL", "")
            key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if not url or not key:
            raise RuntimeError(
                f"Supabase DB env not configured. Ensure {_ENV_PATH} has "
                "SUPABASE_URL and SUPABASE_SERVICE_KEY, then restart uvicorn."
            )
        _client = create_client(url, key)
    return _client


# ── Profiles ────────────────────────────────────────────────────────────────

def upsert_profile(user_id: str, data: dict) -> dict:
    """Create or update a user profile. `data` can contain any editable fields."""
    payload = {"user_id": user_id, **data}
    res = get_client().table("profiles").upsert(payload, on_conflict="user_id").execute()
    return res.data[0] if res.data else {}


def get_profile(user_id: str) -> dict | None:
    try:
        res = (
            get_client()
            .table("profiles")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if res is None:
            return None
        return res.data
    except Exception:
        return None


# ── Resumes ─────────────────────────────────────────────────────────────────

RESUME_BUCKET = "resumes"


def _ensure_resume_bucket() -> None:
    """Create the private 'resumes' bucket if it doesn't exist. Idempotent."""
    try:
        get_client().storage.create_bucket(RESUME_BUCKET, options={"public": False})
    except Exception:
        # Already exists, or another non-fatal condition. The upload call below
        # will surface a real error if the bucket truly isn't usable.
        pass


def save_resume(resume_id: str, user_id: str, text: str, skills: list):
    get_client().table("resumes").upsert({
        "id": resume_id,
        "user_id": user_id,
        "text": text,
        "skills": json.dumps(skills),
    }, on_conflict="id").execute()


def save_resume_file(resume_id: str, pdf_bytes: bytes) -> str:
    """Upload the raw PDF for a resume_id. Returns the storage object path."""
    _ensure_resume_bucket()
    path = f"{resume_id}.pdf"
    storage = get_client().storage.from_(RESUME_BUCKET)
    # `upsert=true` lets the same resume_id replace its file on re-upload.
    storage.upload(
        path=path,
        file=pdf_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    return path


def get_resume_file(resume_id: str) -> bytes | None:
    """Download the PDF bytes for a resume_id. None if absent."""
    try:
        return get_client().storage.from_(RESUME_BUCKET).download(f"{resume_id}.pdf")
    except Exception:
        return None


def delete_resume_file(resume_id: str) -> None:
    try:
        get_client().storage.from_(RESUME_BUCKET).remove([f"{resume_id}.pdf"])
    except Exception:
        pass


def get_resume(resume_id: str) -> dict | None:
    res = get_client().table("resumes").select("*").eq("id", resume_id).maybe_single().execute()
    return res.data if res is not None else None


def get_user_resumes(user_id: str) -> list[dict]:
    res = get_client().table("resumes").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data or []


def delete_user_resumes(user_id: str):
    # Best-effort: also clear stored PDFs so the bucket doesn't accumulate orphans.
    try:
        rows = get_client().table("resumes").select("id").eq("user_id", user_id).execute().data or []
        for row in rows:
            delete_resume_file(row["id"])
    except Exception:
        pass
    get_client().table("resumes").delete().eq("user_id", user_id).execute()


# ── Roadmaps ────────────────────────────────────────────────────────────────

def save_roadmap(resume_id: str, job_title: str, company: str,
                 job_description: str, job_url: str, roadmap_json: dict):
    get_client().table("roadmaps").insert({
        "resume_id": resume_id,
        "job_title": job_title,
        "company": company,
        "job_description": job_description,
        "job_url": job_url,
        "roadmap_json": json.dumps(roadmap_json),
    }).execute()


def get_roadmaps(resume_id: str) -> list[dict]:
    res = (get_client().table("roadmaps")
           .select("*")
           .eq("resume_id", resume_id)
           .order("created_at", desc=True)
           .execute())
    return res.data or []


def delete_roadmap(roadmap_id: int):
    get_client().table("roadmaps").delete().eq("id", roadmap_id).execute()


# ── Polished Data (tailored resumes) ───────────────────────────────────────

def save_polished_data(user_id: str, resume_id: str, job_title: str,
                       company: str, job_url: str, tailored_data: dict):
    get_client().table("polished_data").insert({
        "user_id": user_id,
        "resume_id": resume_id,
        "job_title": job_title,
        "company": company,
        "job_url": job_url,
        "tailored_data": json.dumps(tailored_data),
    }).execute()


def get_polished_data(user_id: str) -> list[dict]:
    res = (get_client().table("polished_data")
           .select("*")
           .eq("user_id", user_id)
           .order("created_at", desc=True)
           .execute())
    return res.data or []


# ── Applications ────────────────────────────────────────────────────────────

def save_application(user_id: str, polished_id: int, status: str = "submitted"):
    get_client().table("applications").insert({
        "user_id": user_id,
        "polished_data_id": polished_id,
        "status": status,
    }).execute()


def get_applications(user_id: str) -> list[dict]:
    res = (get_client().table("applications")
           .select("*, polished_data(*)")
           .eq("user_id", user_id)
           .order("created_at", desc=True)
           .execute())
    return res.data or []