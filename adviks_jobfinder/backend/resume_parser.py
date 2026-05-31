"""
Parse uploaded resume plain-text into structured profile fields.

Used on /upload so tailoring reads the user's actual file — not stale profile data.
"""

import json
from llm import chat as llm_chat, extract_json as _extract_json


def parse_resume_structure(text: str) -> dict:
    """Extract structured resume sections from raw text via LLM."""
    if not text or len(text.strip()) < 80:
        return {}

    # Keep prompt bounded — most resumes fit; truncate very long uploads.
    snippet = text.strip()[:12000]

    prompt = (
        "Parse this resume text into structured JSON. Extract ONLY facts present "
        "in the text — do not invent employers, degrees, dates, or skills.\n\n"
        "Return JSON with this exact shape:\n"
        "{\n"
        '  "personal": {"full_name":"","email":"","phone":"","location":"","linkedin":"","github":""},\n'
        '  "skills": ["skill1", "skill2"],\n'
        '  "work_experience": [{"title":"","company":"","location":"","duration":"","bullets":["..."]}],\n'
        '  "projects": [{"name":"","description":"","technologies":["..."],"url":"","highlights":["..."]}],\n'
        '  "education": [{"degree":"","school":"","year":"","gpa":"","relevant_coursework":["..."]}]\n'
        "}\n\n"
        "Rules:\n"
        "- Every work role must have 3–6 bullet strings when the source provides detail.\n"
        "- Split long paragraphs into bullet arrays.\n"
        "- technologies may be a comma-separated string or array.\n\n"
        f"RESUME TEXT:\n{snippet}\n"
    )
    try:
        raw = llm_chat(prompt, timeout=90)
        data = _extract_json(raw)
        if not isinstance(data, dict):
            return {}
        return data
    except Exception as e:
        print(f"[resume_parser] LLM parse failed: {e}")
        return {}


def profile_updates_from_parsed(parsed: dict, extracted_personal: dict | None = None) -> dict:
    """Build a profiles-table upsert payload from parsed resume JSON."""
    if not parsed:
        return {}

    personal = parsed.get("personal") or {}
    if extracted_personal:
        for k, v in extracted_personal.items():
            if v and not personal.get(k):
                personal[k] = v

    updates: dict = {}
    if personal.get("full_name"):
        updates["full_name"] = personal["full_name"]
    if personal.get("email"):
        updates["email"] = personal["email"]
    if personal.get("phone"):
        updates["phone"] = personal["phone"]
    if personal.get("location"):
        updates["location"] = personal["location"]
    if personal.get("linkedin"):
        updates["linkedin"] = personal["linkedin"]
    if personal.get("github"):
        updates["github"] = personal["github"]

    updates["personal_info"] = json.dumps(personal)

    skills = parsed.get("skills") or []
    if isinstance(skills, list) and skills:
        updates["skills"] = json.dumps([str(s).strip() for s in skills if str(s).strip()])

    for field in ("work_experience", "projects", "education"):
        items = parsed.get(field)
        if isinstance(items, list) and items:
            updates[field] = json.dumps(items)

    return updates
