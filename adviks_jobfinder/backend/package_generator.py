"""
Application Package Generator.

Produces all 4 artifacts for a given job application:
  1. Cover Letter (3 paragraphs, ≤180 words)
  2. Professional Bio (2–3 sentences, ≤80 words)
  3. LinkedIn Summary (first-person, ≤300 chars)
  4. Recruiter Outreach Message (cold DM, ≤120 words)

All content is strictly grounded in the user's profile — no hallucination.
Reuses the LLM infrastructure from tailor.py.
"""

import json
from llm import chat as llm_chat, extract_json as _extract_json


def _safe_chat(prompt: str, fallback: str, timeout: int = 45) -> str:
    try:
        raw = llm_chat(prompt, json_mode=False, timeout=timeout)
        return raw.strip() if raw and len(raw.strip()) > 20 else fallback
    except Exception as e:
        print(f"[package_generator] LLM error → fallback: {e}")
        return fallback


def _compact_profile(profile: dict) -> dict:
    """Return a minimal profile dict for LLM prompts."""
    pi = profile.get("personal_info") or {}
    if isinstance(pi, str):
        try:
            import json as _json
            pi = _json.loads(pi)
        except Exception:
            pi = {}

    work = profile.get("work_experience") or []
    if isinstance(work, str):
        try:
            import json as _json
            work = _json.loads(work)
        except Exception:
            work = []

    skills = profile.get("skills") or []
    if isinstance(skills, str):
        try:
            import json as _json
            skills = _json.loads(skills)
        except Exception:
            skills = []

    name = profile.get("full_name") or pi.get("full_name", "")
    current_role = work[0].get("title", "") if work else ""
    current_co = work[0].get("company", "") if work else ""

    return {
        "name": name,
        "current_role": current_role,
        "current_company": current_co,
        "top_skills": skills[:8] if isinstance(skills, list) else [],
    }


# ── 1. Cover Letter ────────────────────────────────────────────────────────

def generate_cover_letter(
    profile: dict,
    job_title: str,
    company: str,
    job_description: str,
) -> str:
    cp = _compact_profile(profile)
    facts_json = json.dumps(cp)
    prompt = (
        f"Write a 3-paragraph cover letter (≤180 words). "
        f"Use ONLY facts in this JSON — do NOT invent roles, schools, or metrics.\n\n"
        f"FACTS: {facts_json}\n\n"
        f"JOB: {job_title} at {company}\n"
        f"JOB DESCRIPTION (first 600 chars): {job_description[:600]}\n\n"
        "Format:\nDear Hiring Team,\n\n[Paragraph 1: Who you are and why this role]\n\n"
        "[Paragraph 2: Specific relevant skills/accomplishments]\n\n"
        f"[Paragraph 3: Enthusiasm + call to action]\n\nSincerely,\n{cp['name']}"
    )
    fallback = (
        f"Dear {company} Hiring Team,\n\n"
        f"I am excited to apply for the {job_title} position. "
        f"{'My experience as ' + cp['current_role'] + ' at ' + cp['current_company'] + ' ' if cp['current_role'] else ''}"
        f"has equipped me with skills in {', '.join(cp['top_skills'][:3]) or 'the relevant domain'}.\n\n"
        f"I am confident I can make a meaningful contribution to {company}.\n\n"
        f"Sincerely,\n{cp['name']}"
    )
    return _safe_chat(prompt, fallback)


# ── 2. Professional Bio ────────────────────────────────────────────────────

def generate_professional_bio(profile: dict) -> str:
    cp = _compact_profile(profile)
    facts_json = json.dumps(cp)
    prompt = (
        "Write a 2–3 sentence third-person professional bio (≤80 words). "
        "Use ONLY facts in this JSON — do not invent anything.\n\n"
        f"FACTS: {facts_json}"
    )
    fallback = (
        f"{cp['name']} is a {cp['current_role'] or 'technology professional'}"
        f"{' at ' + cp['current_company'] if cp['current_company'] else ''}. "
        f"They specialize in {', '.join(cp['top_skills'][:3]) or 'software development'}."
    )
    return _safe_chat(prompt, fallback)


# ── 3. LinkedIn Summary ────────────────────────────────────────────────────

def generate_linkedin_summary(profile: dict) -> str:
    cp = _compact_profile(profile)
    facts_json = json.dumps(cp)
    prompt = (
        "Write a first-person LinkedIn About section (≤300 characters). "
        "Punchy, professional, and keyword-rich. "
        "Use ONLY facts in this JSON — do not invent anything.\n\n"
        f"FACTS: {facts_json}"
    )
    fallback = (
        f"{cp['current_role'] or 'Engineer'} specializing in "
        f"{', '.join(cp['top_skills'][:3]) or 'technology'}. "
        f"Passionate about building impactful products."
    )
    raw = _safe_chat(prompt, fallback)
    return raw[:300]  # hard cap


# ── 4. Recruiter Outreach Message ─────────────────────────────────────────

def generate_recruiter_message(
    profile: dict,
    job_title: str,
    company: str,
) -> str:
    cp = _compact_profile(profile)
    facts_json = json.dumps(cp)
    prompt = (
        "Write a short cold recruiter outreach message (LinkedIn DM style, ≤120 words). "
        "Professional but warm. Reference the specific role and company. "
        "Use ONLY facts in this JSON — do not invent anything.\n\n"
        f"FACTS: {facts_json}\n"
        f"TARGET ROLE: {job_title} at {company}"
    )
    fallback = (
        f"Hi, I'm {cp['name']} — a {cp['current_role'] or 'software professional'} "
        f"with experience in {', '.join(cp['top_skills'][:3]) or 'engineering'}. "
        f"I came across the {job_title} opening at {company} and I'm very interested. "
        "Would love to connect and learn more about the team. Thanks!"
    )
    return _safe_chat(prompt, fallback)


# ── Batch generator ────────────────────────────────────────────────────────

def generate_package(
    profile: dict,
    job_title: str,
    company: str,
    job_description: str,
) -> dict:
    """Generate all 4 application artifacts in sequence."""
    return {
        "cover_letter": generate_cover_letter(profile, job_title, company, job_description),
        "professional_bio": generate_professional_bio(profile),
        "linkedin_summary": generate_linkedin_summary(profile),
        "recruiter_message": generate_recruiter_message(profile, job_title, company),
        "job_title": job_title,
        "company": company,
    }
