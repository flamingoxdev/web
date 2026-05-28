"""
FastAPI backend for Flamingo.ai.

Provides endpoints for:
- Resume upload & parsing
- Job search & ranking
- User profile management (editable fields)
- AI resume tailoring & chat refinement
- Roadmap generation
- Playwright auto-fill submission
"""

import sys
import uuid
import json
import os
import httpx
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import asyncio
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Windows: Playwright needs ProactorEventLoop for subprocess_exec. uvicorn's
# default policy on Windows is sometimes Selector which raises NotImplementedError
# inside async_playwright. Force Proactor early.
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

from db import (
    upsert_profile, get_profile,
    save_resume, get_resume, get_user_resumes, delete_user_resumes,
    save_resume_file, get_resume_file,
    save_roadmap, get_roadmaps, delete_roadmap,
    save_polished_data, get_polished_data,
    save_application, get_applications,
)
from auth import get_current_user, SUPABASE_URL, SUPABASE_ANON_KEY
from parser import extract_text
from skills import extract_skills
from scraper import fetch_jobs
from matcher import rank_jobs
from tailor import search_template, tailor_resume, refine_resume
from autofill import auto_fill_application, test_connection
from resume_personal import extract_personal_info, merge_into_profile
from onboarding import is_profile_complete, missing_profile_fields

app = FastAPI(title="Flamingo.ai", version="2.1")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
status_store: dict[str, str] = {}


@app.on_event("startup")
def verify_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not SUPABASE_ANON_KEY:
        missing.append("SUPABASE_ANON_KEY")
    if missing:
        print(f"WARNING: Missing env vars: {', '.join(missing)} — auth/DB will fail until .env is fixed and server restarted.")


# ── Helper to extract user from request ─────────────────────────────────────

def require_auth(request: Request) -> str:
    """Extract user_id from JWT. Raises 401 if invalid."""
    return get_current_user(request)


# ── Health check ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.1",
        "name": "Flamingo.ai",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY),
        "auth_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY),
    }


@app.get("/onboarding/status")
def onboarding_status(request: Request):
    user_id = require_auth(request)
    profile = get_profile(user_id)
    resumes = get_user_resumes(user_id)
    complete = is_profile_complete(profile)
    return {
        "profile_complete": complete,
        "has_resume": len(resumes) > 0,
        "ready": complete and len(resumes) > 0,
        "missing_fields": missing_profile_fields(profile),
        "resume_id": resumes[0]["id"] if resumes else None,
    }


# ── Profile endpoints ──────────────────────────────────────────────────────

@app.get("/profile")
def get_user_profile(request: Request):
    user_id = require_auth(request)
    try:
        profile = get_profile(user_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Database error: {e}")
    if not profile:
        # Return empty profile structure
        return {
            "profile": {
                "user_id": user_id,
                "personal_info": {},
                "skills": [],
                "work_experience": [],
                "projects": [],
                "education": [],
            }
        }
    # Parse JSON fields if stored as strings
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return {"profile": profile}


@app.put("/profile")
def update_profile(body: dict, request: Request):
    user_id = require_auth(request)

    # Validate required fields
    required_sections = ["skills", "work_experience", "projects"]
    for section in required_sections:
        val = body.get(section)
        if val is not None and isinstance(val, list) and len(val) == 0:
            # Allow empty but warn — the frontend forces user to enter at least one
            pass

    # Serialize complex fields as JSON strings for storage
    data = {}
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if field in body:
            val = body[field]
            data[field] = json.dumps(val) if isinstance(val, (dict, list)) else val

    # Copy simple fields
    for field in ["full_name", "email", "phone", "location", "linkedin", "github"]:
        if field in body:
            data[field] = body[field]

    profile = upsert_profile(user_id, data)
    profile["profile_complete"] = is_profile_complete(profile)
    return {"profile": profile}


# ── Resume endpoints ───────────────────────────────────────────────────────

@app.post("/upload")
async def upload_resume(file: UploadFile = File(...), request: Request = None):
    # Auth is optional for upload to support the existing flow
    user_id = None
    try:
        user_id = require_auth(request)
    except HTTPException:
        pass  # Allow unauthenticated uploads for backward compat

    content = await file.read()
    text = extract_text(content)
    skills = extract_skills(text)
    resume_id = str(uuid.uuid4())[:8]

    autofilled: dict = {}
    if user_id:
        # Replace old resumes for this user to save DB space
        delete_user_resumes(user_id)

        # Pre-populate the profile from resume contents (only fills blanks).
        try:
            extracted = extract_personal_info(text)
            if extracted:
                current_profile = get_profile(user_id) or {}
                updates = merge_into_profile(current_profile, extracted)
                if updates:
                    pi = updates.get("personal_info")
                    if isinstance(pi, dict):
                        updates["personal_info"] = json.dumps(pi)
                    upsert_profile(user_id, updates)
                    autofilled = extracted
        except Exception as e:
            print(f"Personal-info autofill skipped: {e}")

    save_resume(resume_id, user_id or "anonymous", text, skills)

    # Persist the PDF bytes so the autofill step can attach them to file inputs.
    try:
        save_resume_file(resume_id, content)
    except Exception as e:
        print(f"Resume PDF storage failed (autofill file upload will be skipped): {e}")

    return {
        "resume_id": resume_id,
        "extracted_skills": skills,
        "resume_text": text[:500],
        "autofilled_profile": autofilled,
    }


@app.get("/resumes")
def list_resumes(request: Request):
    user_id = require_auth(request)
    resumes = get_user_resumes(user_id)
    return {"resumes": resumes}


# ── Status endpoint ────────────────────────────────────────────────────────

@app.get("/status/{resume_id}")
def get_status(resume_id: str):
    return {"status": status_store.get(resume_id, "idle")}


# ── Job search ─────────────────────────────────────────────────────────────

@app.post("/search")
async def search_jobs(body: dict, request: Request):
    # Auth optional for search too
    resume_id = body.get("resume_id")
    location = body.get("location", "Remote")
    limit = int(body.get("limit", 20))
    job_type = body.get("job_type", "any")  # 'any' | 'intern' | 'fulltime'

    resume = get_resume(resume_id)
    if not resume:
        return {"error": "Resume not found"}

    skills = json.loads(resume["skills"]) if isinstance(resume["skills"], str) else resume["skills"]

    async def stream():
        status_store[resume_id] = "scraping"
        yield json.dumps({"status": "scraping"}) + "\n"
        await asyncio.sleep(0.1)

        jobs, meta = fetch_jobs(skills, location, limit, job_type=job_type)
        if not jobs:
            err_msg = (
                f"No jobs found for query \"{meta.get('query', '')}\" in {location}. "
                + ("Errors: " + " | ".join(meta.get("errors", [])) if meta.get("errors") else "")
            ).strip()
            yield json.dumps({
                "status": "error",
                "message": err_msg,
                "meta": meta,
            }) + "\n"
            return

        status_store[resume_id] = "embedding"
        yield json.dumps({"status": "embedding", "count": len(jobs), "query": meta.get("query")}) + "\n"
        await asyncio.sleep(0.1)

        status_store[resume_id] = "ranking"
        ranked = rank_jobs(resume["text"], jobs)

        status_store[resume_id] = "done"
        yield json.dumps({"status": "ranking"}) + "\n"

        for job in ranked:
            yield json.dumps(job) + "\n"
            await asyncio.sleep(0.05)

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# ── Roadmap endpoints ──────────────────────────────────────────────────────

@app.post("/roadmap/generate")
async def generate_roadmap(body: dict):
    resume_id = body.get("resume_id")
    job_title = body.get("job_title")
    company = body.get("company")
    job_description = body.get("job_description", "")[:1500]
    job_url = body.get("job_url", "")

    resume = get_resume(resume_id)
    if not resume:
        return {"error": "Resume not found"}

    resume_skills = json.loads(resume["skills"]) if isinstance(resume["skills"], str) else resume["skills"]
    resume_snippet = resume["text"][:800]

    prompt = f"""You are a career advisor. Analyze the gap between this candidate's 
profile and the job, then return a JSON roadmap.

Job: {job_title} at {company}
Job description: {job_description}
Candidate's current skills: {", ".join(resume_skills)}
Candidate's resume: {resume_snippet}

Return ONLY a JSON object in this exact format, nothing else:
{{
  "missing_skills": [
    {{
      "skill": "skill name",
      "importance": "high" | "medium" | "low",
      "reason": "one sentence why this skill matters for the job",
      "resources": [
        {{"name": "resource name", "url": "https://...", "type": "course" | "docs" | "book" | "practice"}}
      ],
      "estimated_weeks": 2
    }}
  ],
  "experience_gaps": [
    {{
      "gap": "what experience is missing",
      "suggestion": "how to get it"
    }}
  ],
  "summary": "2 sentence overall assessment"
}}

Return only the JSON, no markdown, no explanation."""

    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            },
            timeout=120
        )
        raw = r.json()["message"]["content"].strip()
        clean = raw.replace("```json", "").replace("```", "").strip()
        roadmap_data = json.loads(clean)

        save_roadmap(resume_id, job_title, company,
                     job_description, job_url, roadmap_data)

        return {"roadmap": roadmap_data, "job_title": job_title, "company": company}
    except Exception as e:
        print(f"Roadmap error: {e}")
        return {"error": str(e)}


@app.get("/roadmap/{resume_id}")
def get_roadmap_list(resume_id: str):
    rows = get_roadmaps(resume_id)
    result = []
    for row in rows:
        roadmap_json = row.get("roadmap_json", "{}")
        if isinstance(roadmap_json, str):
            roadmap_json = json.loads(roadmap_json)
        result.append({
            "id": row["id"],
            "job_title": row["job_title"],
            "company": row["company"],
            "job_url": row["job_url"],
            "roadmap": roadmap_json,
            "created_at": row["created_at"],
        })
    return {"roadmaps": result}


@app.delete("/roadmap/{roadmap_id}")
def remove_roadmap(roadmap_id: int):
    delete_roadmap(roadmap_id)
    return {"deleted": roadmap_id}


# ── Tailor endpoints ───────────────────────────────────────────────────────

@app.post("/tailor/template")
def get_template(body: dict, request: Request):
    """Search for the best resume template for a job type."""
    require_auth(request)
    job_title = body.get("job_title", "")
    job_description = body.get("job_description", "")
    template = search_template(job_title, job_description)
    return {"template": template}


@app.post("/tailor/generate")
def generate_tailored_resume(body: dict, request: Request):
    """Generate a tailored resume for a specific job."""
    user_id = require_auth(request)

    resume_id = body.get("resume_id")
    job_title = body.get("job_title", "")
    company = body.get("company", "")
    job_description = body.get("job_description", "")[:2000]
    job_url = body.get("job_url", "")

    resume = get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    profile = get_profile(user_id) or {}
    # Parse JSON fields in profile
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                pass

    resume_skills = json.loads(resume["skills"]) if isinstance(resume["skills"], str) else resume["skills"]

    # Step 1: Get template recommendation
    template = search_template(job_title, job_description)

    # Step 2: Generate tailored resume
    tailored = tailor_resume(
        resume_text=resume["text"],
        resume_skills=resume_skills,
        profile=profile,
        job_title=job_title,
        company=company,
        job_description=job_description,
        template=template,
    )

    return {
        "tailored": tailored,
        "template": template,
        "job_title": job_title,
        "company": company,
        "job_url": job_url,
    }


@app.post("/tailor/refine")
def refine_tailored_resume(body: dict, request: Request):
    """Refine the tailored resume based on user feedback."""
    require_auth(request)

    current_draft = body.get("current_draft", {})
    user_feedback = body.get("feedback", "")
    job_title = body.get("job_title", "")
    company = body.get("company", "")

    if not user_feedback:
        raise HTTPException(status_code=400, detail="Feedback is required")

    refined = refine_resume(current_draft, user_feedback, job_title, company)
    return {"tailored": refined}


# ── Apply endpoints ────────────────────────────────────────────────────────

@app.post("/apply/save")
def save_approved_resume(body: dict, request: Request):
    """Save the user-approved tailored resume to polished_data."""
    user_id = require_auth(request)

    resume_id = body.get("resume_id")
    job_title = body.get("job_title", "")
    company = body.get("company", "")
    job_url = body.get("job_url", "")
    tailored_data = body.get("tailored_data", {})

    if not tailored_data:
        raise HTTPException(status_code=400, detail="No tailored data to save")

    save_polished_data(user_id, resume_id, job_title, company, job_url, tailored_data)
    return {"status": "saved", "message": "Resume approved and saved"}


@app.post("/apply/autofill")
async def autofill_job(body: dict, request: Request):
    """Launch Playwright to auto-fill a job application."""
    user_id = require_auth(request)

    job_url = body.get("job_url", "")
    if not job_url:
        raise HTTPException(status_code=400, detail="job_url is required")

    # Get user profile for personal info
    profile = get_profile(user_id) or {}
    personal_info = profile.get("personal_info", {})
    if isinstance(personal_info, str):
        try:
            personal_info = json.loads(personal_info)
        except (json.JSONDecodeError, TypeError):
            personal_info = {}

    # Merge top-level profile fields onto personal_info so autofill always sees
    # them even when the user filled only the dedicated columns.
    for key in ("full_name", "email", "phone", "location", "linkedin", "github"):
        if not personal_info.get(key) and profile.get(key):
            personal_info[key] = profile[key]

    # Also expose education / skills / extended fields to the autofill matcher
    # so it can answer "school", "degree", "graduation", etc.
    for key in ("education", "work_experience", "projects", "skills"):
        raw = profile.get(key)
        if isinstance(raw, str):
            try:
                personal_info[key] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                personal_info[key] = []
        elif raw is not None:
            personal_info[key] = raw

    tailored_data = body.get("tailored_data", {})

    # Pull the original resume PDF from Storage so we can attach it to file inputs.
    resume_id = body.get("resume_id") or ""
    resume_pdf: bytes | None = None
    if resume_id:
        try:
            resume_pdf = get_resume_file(resume_id)
        except Exception as e:
            print(f"Resume PDF fetch failed: {e}")

    # Test connectivity & launch Playwright on a worker thread with a fresh
    # ProactorEventLoop. Doing this in the FastAPI request loop on Windows
    # raises NotImplementedError because uvicorn's loop is Selector-based.
    def _run_in_proactor(coro_factory):
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(coro_factory())
        finally:
            loop.close()

    connectivity = await asyncio.to_thread(_run_in_proactor, lambda: test_connection(job_url))
    if not connectivity.get("reachable"):
        return {"status": "error", "message": f"Cannot reach {job_url}: {connectivity.get('error', 'unknown')}"}

    result = await asyncio.to_thread(
        _run_in_proactor,
        lambda: auto_fill_application(job_url, personal_info, tailored_data, resume_pdf=resume_pdf),
    )

    if result["status"] == "filled":
        polished_id = body.get("polished_data_id")
        try:
            if isinstance(polished_id, int) and polished_id > 0:
                save_application(user_id, polished_id, "submitted")
            else:
                print("Skipping applications insert: no valid polished_data_id provided.")
        except Exception as e:
            print(f"applications insert failed: {e}")

    return result


@app.get("/apply/history")
def application_history(request: Request):
    user_id = require_auth(request)
    apps = get_applications(user_id)
    return {"applications": apps}


@app.get("/polished")
def get_user_polished(request: Request):
    user_id = require_auth(request)
    data = get_polished_data(user_id)
    result = []
    for row in data:
        td = row.get("tailored_data", "{}")
        if isinstance(td, str):
            td = json.loads(td)
        result.append({**row, "tailored_data": td})
    return {"polished_data": result}