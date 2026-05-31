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
from fastapi import FastAPI, UploadFile, File, Request, HTTPException, Response
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
    save_build_session, get_build_session, delete_build_session,
    save_application_package, get_application_packages, get_application_package,
)
from auth import get_current_user, SUPABASE_URL, SUPABASE_ANON_KEY
from parser import extract_text
from skills import extract_skills
from scraper import fetch_jobs
from matcher import rank_jobs
from tailor import search_template, tailor_resume, refine_resume, resume_assistant, json_to_latex, latex_to_json
from resume_personal import extract_personal_info, merge_into_profile
from resume_parser import parse_resume_structure, profile_updates_from_parsed
from onboarding import is_profile_complete, missing_profile_fields, is_onboarding_ready, has_template_selected
from latex_compile import compile_latex_to_pdf
from profile_text import profile_to_resume_text
from template_registry import list_templates, default_template_id
from resume_builder import (
    STEPS, TOTAL_STEPS, initial_session, advance_session, assemble_profile, get_step,
)
from resume_analyzer import analyze_resume
from package_generator import generate_package

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
    has_resume = len(resumes) > 0
    return {
        "profile_complete": complete,
        "has_resume": has_resume,
        "has_template": has_template_selected(profile),
        "ready": is_onboarding_ready(profile, len(resumes)),
        "missing_fields": missing_profile_fields(profile),
        "resume_id": resumes[0]["id"] if resumes else None,
    }


@app.get("/templates")
def get_resume_templates():
    """List available resume templates from ALLtemplates/."""
    return {"templates": list_templates()}


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
    filename = file.filename or ""
    text = extract_text(content, filename)
    skills = extract_skills(text)
    resume_id = str(uuid.uuid4())[:8]
    is_tex = filename.lower().endswith(".tex")

    autofilled: dict = {}
    if user_id:
        # Replace old resumes for this user to save DB space
        delete_user_resumes(user_id)

        # Sync profile FROM the uploaded file so tailoring uses this resume — not
        # stale data from the profile form.
        try:
            extracted = extract_personal_info(text)
            parsed = parse_resume_structure(text)
            updates = profile_updates_from_parsed(parsed, extracted)
            if not updates and extracted:
                current_profile = get_profile(user_id) or {}
                updates = merge_into_profile(current_profile, extracted)
                pi = updates.get("personal_info")
                if isinstance(pi, dict):
                    updates["personal_info"] = json.dumps(pi)
            if is_tex and text.strip():
                updates = updates or {}
                pi = updates.get("personal_info")
                if isinstance(pi, str):
                    try:
                        pi = json.loads(pi)
                    except (json.JSONDecodeError, TypeError):
                        pi = {}
                elif not isinstance(pi, dict):
                    pi = {}
                pi["latex_template"] = text.strip()
                updates["personal_info"] = json.dumps(pi)
            if updates:
                upsert_profile(user_id, updates)
                autofilled = {**extracted, "sections_synced": bool(parsed)}
        except Exception as e:
            print(f"Profile sync from resume skipped: {e}")

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
    user_id = None
    try:
        user_id = require_auth(request)
    except HTTPException:
        pass

    resume_id = body.get("resume_id")
    location = body.get("location", "Remote")
    limit = int(body.get("limit", 20))
    job_type = body.get("job_type", "any")

    skills: list = []
    resume_text = ""

    if resume_id:
        resume = get_resume(resume_id)
        if not resume:
            return {"error": "Resume not found"}
        skills = json.loads(resume["skills"]) if isinstance(resume["skills"], str) else resume["skills"]
        resume_text = resume["text"] or ""
        search_key = resume_id
    elif user_id:
        profile = get_profile(user_id)
        if not profile or not is_profile_complete(profile):
            return {"error": "Complete your profile before searching for jobs"}
        for field in ["skills", "work_experience", "projects", "education", "personal_info"]:
            if isinstance(profile.get(field), str):
                try:
                    profile[field] = json.loads(profile[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        skills = profile.get("skills") or []
        if not isinstance(skills, list):
            skills = []
        resume_text = profile_to_resume_text(profile)
        search_key = user_id
    else:
        return {"error": "Sign in and complete your profile to search jobs"}

    async def stream():
        status_store[search_key] = "scraping"
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

        status_store[search_key] = "embedding"
        yield json.dumps({"status": "embedding", "count": len(jobs), "query": meta.get("query")}) + "\n"
        await asyncio.sleep(0.1)

        status_store[search_key] = "ranking"
        ranked = rank_jobs(resume_text, jobs)

        status_store[search_key] = "done"
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
    """Generate a tailored resume for a specific job from the user's profile."""
    user_id = require_auth(request)

    resume_id = body.get("resume_id")
    job_title = body.get("job_title", "")
    company = body.get("company", "")
    job_description = body.get("job_description", "")[:2000]
    job_url = body.get("job_url", "")

    profile = get_profile(user_id) or {}
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                pass

    if not is_profile_complete(profile):
        raise HTTPException(status_code=400, detail="Complete your profile before tailoring a resume")

    resume_text = profile_to_resume_text(profile)
    resume_skills = profile.get("skills") or []
    if not isinstance(resume_skills, list):
        resume_skills = []

    if resume_id:
        resume = get_resume(resume_id)
        if resume:
            resume_text = resume.get("text") or resume_text
            parsed_skills = json.loads(resume["skills"]) if isinstance(resume["skills"], str) else resume["skills"]
            if parsed_skills:
                resume_skills = parsed_skills

    template = search_template(job_title, job_description)

    tailored = tailor_resume(
        resume_text=resume_text,
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


@app.post("/tailor/latex")
def generate_latex_resume(body: dict, request: Request):
    """Convert tailored resume JSON into a LaTeX string."""
    user_id = require_auth(request)
    tailored_json = body.get("tailored_json", {})
    job_title = body.get("job_title", "")

    if not tailored_json:
        raise HTTPException(status_code=400, detail="tailored_json is required")

    profile = get_profile(user_id) or {}
    template_id = body.get("template_id") or default_template_id()
    pi = profile.get("personal_info")
    if isinstance(pi, str):
        try:
            pi = json.loads(pi)
        except (json.JSONDecodeError, TypeError):
            pi = {}
    if isinstance(pi, dict) and pi.get("resume_template"):
        template_id = body.get("template_id") or pi.get("resume_template")

    latex_code = json_to_latex(tailored_json, job_title, template_id=template_id)
    return {"latex": latex_code, "template_id": template_id}


@app.post("/tailor/latex_to_json")
def latex_to_json_endpoint(body: dict, request: Request):
    """Parse edited LaTeX back into structured resume JSON."""
    require_auth(request)
    latex_code = body.get("latex", "")
    if not latex_code.strip():
        raise HTTPException(status_code=400, detail="latex is required")
    parsed = latex_to_json(latex_code)
    if not parsed:
        raise HTTPException(status_code=422, detail="Could not parse LaTeX into resume structure")
    return {"tailored": parsed}


@app.post("/tailor/compile_latex")
def compile_latex_pdf(body: dict, request: Request):
    """Compile LaTeX to PDF via remote TeX services."""
    require_auth(request)
    latex_code = body.get("latex", "")
    if not latex_code:
        raise HTTPException(status_code=400, detail="latex is required")

    pdf, err = compile_latex_to_pdf(latex_code)
    if pdf:
        return Response(content=pdf, media_type="application/pdf")
    raise HTTPException(status_code=422, detail=err or "Compilation failed")


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


@app.post("/tailor/assistant")
def resume_editor_assistant(body: dict, request: Request):
    """Smart resume editor assistant: apply edits OR answer questions (NVIDIA/Ollama)."""
    require_auth(request)

    current_draft = body.get("current_draft", {})
    user_message = (body.get("message") or body.get("feedback") or "").strip()
    job_title = body.get("job_title", "")
    company = body.get("company", "")
    history = body.get("history") or []

    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    result = resume_assistant(current_draft, user_message, job_title, company, history)
    out = {
        "action": result.get("action", "answer"),
        "reply": result.get("reply", ""),
    }
    if result.get("tailored"):
        out["tailored"] = result["tailored"]
    return out


@app.get("/tailor/assistant/status")
def resume_assistant_status():
    """LLM provider info for the resume editor assistant."""
    from llm import provider_info
    return provider_info()


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


# ── Resume Builder (wizard) ───────────────────────────────────────────────

@app.get("/resume/steps")
def list_resume_steps():
    """Return all wizard steps (question, label, icon) — public endpoint."""
    return {"steps": STEPS, "total": TOTAL_STEPS}


@app.post("/resume/build/start")
def start_build_session(request: Request):
    """Create a fresh wizard session and return the first step."""
    user_id = require_auth(request)
    session_id = str(uuid.uuid4())[:12]
    session = initial_session()
    save_build_session(session_id, user_id, session["step"], session["answers"])
    first_step = get_step(0)
    return {
        "session_id": session_id,
        "step": 0,
        "total_steps": TOTAL_STEPS,
        "current_step": first_step,
        "completed": False,
    }


@app.post("/resume/build/answer")
def answer_build_step(body: dict, request: Request):
    """Submit an answer for the current step and advance."""
    user_id = require_auth(request)
    session_id = body.get("session_id")
    user_answer = (body.get("answer") or "").strip()
    improve = body.get("improve", True)

    if not session_id or not user_answer:
        raise HTTPException(status_code=400, detail="session_id and answer are required")

    row = get_build_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found — start a new session")

    session = {
        "step": row["step"],
        "answers": row.get("answers") or {},
        "follow_up": None,
        "completed": False,
    }

    session = advance_session(session, user_answer, improve=improve)
    save_build_session(session_id, user_id, session["step"], session["answers"])

    next_step = get_step(session["step"]) if not session["completed"] else None
    return {
        "session_id": session_id,
        "step": session["step"],
        "total_steps": TOTAL_STEPS,
        "completed": session["completed"],
        "follow_up": session.get("follow_up"),
        "next_step": next_step,
    }


@app.post("/resume/build/finalize")
def finalize_build_session(body: dict, request: Request):
    """Assemble profile from wizard answers and save it as a resume + update profile."""
    user_id = require_auth(request)
    session_id = body.get("session_id")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    row = get_build_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    answers = row.get("answers") or {}
    profile_data = assemble_profile(answers)

    # Save structured profile to Supabase profiles table
    serialized = {}
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        val = profile_data.get(field)
        if val is not None:
            serialized[field] = json.dumps(val) if isinstance(val, (dict, list)) else val
    for field in ["full_name", "email", "phone", "location", "linkedin", "github"]:
        if profile_data.get(field):
            serialized[field] = profile_data[field]

    upsert_profile(user_id, serialized)

    # Build a resume text stub for matching / skill extraction
    resume_text_parts = [
        profile_data.get("full_name", ""),
        profile_data.get("career_goals", ""),
    ]
    for work in (profile_data.get("work_experience") or []):
        if isinstance(work, dict):
            resume_text_parts.append(f"{work.get('title','')} at {work.get('company','')}")
            for b in (work.get("bullets") or []):
                resume_text_parts.append(b)
    resume_text = "\n".join(str(p) for p in resume_text_parts if p)

    skills = profile_data.get("skills") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except Exception:
            skills = []

    resume_id = str(uuid.uuid4())[:8]
    delete_user_resumes(user_id)  # replace old resume
    save_resume(resume_id, user_id, resume_text, skills)

    # Clean up session
    try:
        delete_build_session(session_id)
    except Exception:
        pass

    return {
        "resume_id": resume_id,
        "profile": profile_data,
        "extracted_skills": skills,
        "message": "Resume built successfully from wizard answers",
    }


# ── Resume Analyzer ───────────────────────────────────────────────────────────

@app.post("/resume/analyze")
def analyze_resume_endpoint(body: dict, request: Request):
    """ATS-score a resume and return structured improvement report."""
    # Auth optional — works for uploaded resumes even without login
    resume_id = body.get("resume_id")
    if not resume_id:
        raise HTTPException(status_code=400, detail="resume_id is required")

    resume = get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    skills = resume.get("skills", [])
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except Exception:
            skills = []

    report = analyze_resume(resume["text"], extracted_skills=skills)
    return {"resume_id": resume_id, "report": report}


# ── Application Package ─────────────────────────────────────────────────────────

@app.post("/package/generate")
def generate_application_package(body: dict, request: Request):
    """Generate cover letter, bio, LinkedIn summary, recruiter message for a job."""
    user_id = require_auth(request)

    resume_id = body.get("resume_id", "")
    job_title = body.get("job_title", "")
    company = body.get("company", "")
    job_description = body.get("job_description", "")[:2000]
    job_url = body.get("job_url", "")

    if not job_title:
        raise HTTPException(status_code=400, detail="job_title is required")

    profile = get_profile(user_id) or {}
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                pass

    package = generate_package(profile, job_title, company, job_description)

    # Persist to DB
    try:
        saved = save_application_package(user_id, resume_id, job_title, company, job_url, package)
        package["id"] = saved.get("id")
    except Exception as e:
        print(f"Package save error: {e}")

    return {"package": package}


@app.get("/package/list")
def list_application_packages(request: Request):
    user_id = require_auth(request)
    packages = get_application_packages(user_id)
    return {"packages": packages}


@app.get("/package/{package_id}")
def get_package(package_id: int, request: Request):
    require_auth(request)
    pkg = get_application_package(package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return {"package": pkg}


# ── Career Copilot (streaming chat) ────────────────────────────────────────

_COPILOT_SYSTEM = """You are Flamingo, an expert AI career assistant. You help users with:
- Resume reviews and improvement suggestions
- Interview preparation and mock questions
- Skill gap analysis and learning roadmaps
- Career path recommendations
- LinkedIn profile optimization
- Salary insights and negotiation tips
- Job search strategy

You have access to the user's profile data provided in the context.
Always be encouraging, specific, and actionable. Refer to the user's actual skills
and experience when giving advice. Never make up credentials or experience the user
doesn't have."""


@app.post("/jobs/recommend")
def recommend_jobs(body: dict, request: Request):
    """Fetch and rank job recommendations based on user's skills."""
    user_id = require_auth(request)
    location = body.get("location", "Remote")
    job_type = body.get("job_type", "any")
    limit = body.get("limit", 20)
    
    profile = get_profile(user_id) or {}
    skills = profile.get("skills", [])
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except:
            skills = []
            
    if not skills:
        return {"jobs": [], "meta": {"errors": ["No skills found in profile. Please add skills to get recommendations."]}}
        
    jobs, meta = fetch_jobs(skills, location=location, limit=limit, job_type=job_type)
    
    # We need a string to rank against. Let's serialize the profile skills.
    resume_text = ", ".join(skills)
    
    ranked = rank_jobs(resume_text, jobs)
    return {"jobs": ranked, "meta": meta}


@app.post("/copilot/chat")
async def copilot_chat(body: dict, request: Request):
    """Streaming career copilot chat endpoint."""
    user_id = require_auth(request)

    user_message = (body.get("message") or "").strip()
    conversation_history = body.get("history") or []  # [{role, content}]

    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    # Load user context
    profile = get_profile(user_id) or {}
    for field in ["personal_info", "skills", "work_experience", "projects", "education"]:
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                pass

    resumes = get_user_resumes(user_id)
    resume_skills: list = []
    if resumes:
        latest_skills = resumes[0].get("skills", [])
        resume_skills = json.loads(latest_skills) if isinstance(latest_skills, str) else latest_skills

    # Build concise context string (keep tokens low)
    skills_all = resume_skills or (profile.get("skills") or [])
    if isinstance(skills_all, list):
        skills_str = ", ".join(str(s) for s in skills_all[:15])
    else:
        skills_str = ""

    work = profile.get("work_experience") or []
    work_str = "; ".join(
        f"{r.get('title','?')} at {r.get('company','?')}"
        for r in (work[:2] if isinstance(work, list) else [])
    )

    context_block = (
        f"USER PROFILE CONTEXT:\n"
        f"Name: {profile.get('full_name', 'Unknown')}\n"
        f"Skills: {skills_str or 'not specified'}\n"
        f"Recent experience: {work_str or 'not specified'}\n"
    )

    # Build messages list (keep last 6 exchanges to stay under token budget)
    messages = [{"role": "system", "content": _COPILOT_SYSTEM + "\n\n" + context_block}]
    for h in conversation_history[-6:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": str(h["content"])[:600]})
    messages.append({"role": "user", "content": user_message})

    # Stream via NVIDIA or fall back to Ollama
    import os as _os
    provider = (_os.getenv("LLM_PROVIDER") or "nvidia").lower()

    async def _stream_nvidia():
        from openai import OpenAI
        client = OpenAI(
            api_key=_os.getenv("NVIDIA_API_KEY", ""),
            base_url=_os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        )
        try:
            stream = client.chat.completions.create(
                model=_os.getenv("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct"),
                messages=messages,
                temperature=0.4,
                max_tokens=int(_os.getenv("LLM_MAX_TOKENS", "700")),
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield delta.encode()
        except Exception as e:
            yield f"\n[Copilot error: {e}]".encode()

    async def _stream_ollama():
        import httpx
        payload = {
            "model": _os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
            "messages": messages,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token.encode()
                    except Exception:
                        pass

    generator = _stream_nvidia() if provider == "nvidia" else _stream_ollama()
    return StreamingResponse(generator, media_type="text/plain; charset=utf-8")