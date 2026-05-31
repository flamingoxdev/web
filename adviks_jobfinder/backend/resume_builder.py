"""
AI-guided resume builder — multi-turn wizard.

Manages a stateful session that walks the user through 11 topic areas,
asking contextual follow-up questions and assembling a structured profile
JSON ready for tailor.py.

Session state shape:
  {
    "step": 0-11,
    "answers": { topic: user_answer, ... },
    "partial_profile": { ... }
  }

All LLM calls are lightweight (≤200 token prompts) so they stay snappy
even under the 700-token cap in .env.
"""

import json
from llm import chat as llm_chat, extract_json as _extract_json

# ── Wizard step definitions ────────────────────────────────────────────────

STEPS = [
    {
        "id": "personal",
        "label": "Personal Information",
        "icon": "👤",
        "question": "Let's start with your basic information. What's your full name, email address, phone number, and location (city, state)? Also include your LinkedIn and GitHub URLs if you have them.",
        "profile_key": "personal_info",
        "example": "e.g. Jane Smith, jane@email.com, (555) 123-4567, Austin TX, linkedin.com/in/janesmith",
    },
    {
        "id": "education",
        "label": "Education",
        "icon": "🎓",
        "question": "Tell me about your education. Include your degree(s), institution name(s), graduation year(s), GPA (if above 3.0), and any relevant coursework.",
        "profile_key": "education",
        "example": "e.g. B.S. Computer Science, University of Texas, May 2025, GPA 3.8, Relevant: Data Structures, ML, Databases",
    },
    {
        "id": "work_experience",
        "label": "Work Experience",
        "icon": "💼",
        "question": "Describe your work experience. For each role, include: job title, company name, dates (month/year), location, and 3–5 bullet points of what you accomplished. Use numbers when possible.",
        "profile_key": "work_experience",
        "example": "e.g. Software Intern, Google, May–Aug 2024, Mountain View CA — Built REST APIs reducing latency by 30%...",
    },
    {
        "id": "internships",
        "label": "Internships",
        "icon": "🏢",
        "question": "Do you have any internships not listed above? Include company, role, dates, and key contributions. If none, just say 'none'.",
        "profile_key": "internships",
        "example": "e.g. Research Intern, MIT Lab, Summer 2023 — Developed NLP pipeline...",
    },
    {
        "id": "projects",
        "label": "Projects",
        "icon": "🚀",
        "question": "Describe your key projects (personal, academic, or open-source). Include project name, technologies used, what it does, and your measurable impact or GitHub link.",
        "profile_key": "projects",
        "example": "e.g. ResumeAI — Python, FastAPI, React — Automated resume tailoring app, 500+ users, github.com/jane/resumeai",
    },
    {
        "id": "technical_skills",
        "label": "Technical Skills",
        "icon": "⚙️",
        "question": "List all your technical skills — programming languages, frameworks, tools, cloud platforms, databases, etc. Be comprehensive; we'll prioritize them for each job.",
        "profile_key": "technical_skills",
        "example": "e.g. Python, JavaScript, React, FastAPI, PostgreSQL, Docker, AWS, Git, TensorFlow",
    },
    {
        "id": "soft_skills",
        "label": "Soft Skills",
        "icon": "🤝",
        "question": "What are your key soft skills and professional strengths? Think about communication, leadership, teamwork, or any interpersonal qualities.",
        "profile_key": "soft_skills",
        "example": "e.g. Cross-functional collaboration, technical writing, agile project management, public speaking",
    },
    {
        "id": "certifications",
        "label": "Certifications",
        "icon": "🏆",
        "question": "List any certifications, online courses, or professional credentials you hold. Include the issuing organization and year. If none, say 'none'.",
        "profile_key": "certifications",
        "example": "e.g. AWS Certified Solutions Architect (2024), Google Data Analytics Certificate (2023)",
    },
    {
        "id": "leadership",
        "label": "Leadership Experience",
        "icon": "⭐",
        "question": "Describe any leadership roles — clubs, student organizations, team leads, hackathon winners, mentoring, etc. If none, say 'none'.",
        "profile_key": "leadership",
        "example": "e.g. President, ACM Club 2023-24 — Grew membership by 40%, organized 3 hackathons",
    },
    {
        "id": "volunteer",
        "label": "Volunteer Activities",
        "icon": "❤️",
        "question": "Any volunteer experience or community involvement? Include organization, role, and what you did. If none, say 'none'.",
        "profile_key": "volunteer",
        "example": "e.g. Code instructor, Code.org — Taught Python to 30 high school students weekly",
    },
    {
        "id": "career_goals",
        "label": "Career Goals",
        "icon": "🎯",
        "question": "What are your career goals? What type of roles are you targeting, what industries interest you, and what's your desired location or work arrangement (remote/hybrid/on-site)?",
        "profile_key": "career_goals",
        "example": "e.g. Seeking full-stack or ML engineering roles at growth-stage startups, open to remote or SF Bay Area",
    },
]

TOTAL_STEPS = len(STEPS)


# ── LLM helpers ────────────────────────────────────────────────────────────

def _ai_improve_answer(step_id: str, question: str, raw_answer: str) -> str:
    """Ask the LLM to lightly clean / structure the user's raw answer."""
    prompt = (
        f"The user is filling out a resume section: **{step_id}**.\n"
        f"Question asked: {question}\n"
        f"User's raw answer: {raw_answer}\n\n"
        "Lightly restructure this into clear, professional resume content. "
        "Do NOT add any facts not present in the user's answer. "
        "Return JSON: {\"improved\": \"...\", \"summary\": \"one-line summary\"}"
    )
    try:
        data = _extract_json(llm_chat(prompt, timeout=30))
        return data.get("improved") or raw_answer
    except Exception:
        return raw_answer


def _ai_follow_up(step_id: str, question: str, raw_answer: str) -> str | None:
    """Generate a short contextual follow-up question if the answer is thin."""
    if len(raw_answer.strip()) > 120:
        return None  # Answer is detailed enough, skip follow-up
    prompt = (
        f"Resume section: {step_id}. The user gave a very brief answer: '{raw_answer}'. "
        "Generate ONE short follow-up question to get more useful detail for their resume. "
        "Keep it under 20 words. If the answer is complete, return null.\n"
        'Return JSON: {"followup": "..." or null}'
    )
    try:
        data = _extract_json(llm_chat(prompt, timeout=20))
        return data.get("followup") or None
    except Exception:
        return None


# ── Profile assembly ───────────────────────────────────────────────────────

def _parse_personal_info(raw: str) -> dict:
    """Parse free-text personal info into structured fields."""
    prompt = (
        "Extract contact info from this text into JSON fields. "
        "Return only fields that are clearly present.\n"
        f"TEXT: {raw}\n\n"
        'Return JSON: {"full_name":"","email":"","phone":"","location":"",'
        '"linkedin":"","github":"","website":""}'
    )
    try:
        return _extract_json(llm_chat(prompt, timeout=25))
    except Exception:
        return {"raw": raw}


def _parse_education(raw: str) -> list:
    """Parse education text into structured list."""
    prompt = (
        "Parse this education description into a JSON list of degrees.\n"
        f"TEXT: {raw}\n\n"
        'Return JSON: {"education": [{"degree":"","school":"","year":"","gpa":"","relevant_coursework":[]}]}'
    )
    try:
        data = _extract_json(llm_chat(prompt, timeout=25))
        return data.get("education") or []
    except Exception:
        return [{"raw": raw}]


def _parse_experience(raw: str) -> list:
    """Parse work experience / internship text into structured list."""
    prompt = (
        "Parse this work experience into a JSON list of roles. "
        "Bullets should be an array of strings.\n"
        f"TEXT: {raw}\n\n"
        'Return JSON: {"roles": [{"title":"","company":"","location":"","duration":"","bullets":[]}]}'
    )
    try:
        data = _extract_json(llm_chat(prompt, timeout=35))
        return data.get("roles") or []
    except Exception:
        return [{"raw": raw}]


def _parse_projects(raw: str) -> list:
    prompt = (
        "Parse these projects into a JSON list.\n"
        f"TEXT: {raw}\n\n"
        'Return JSON: {"projects": [{"name":"","description":"","technologies":[],"url":"","highlights":[]}]}'
    )
    try:
        data = _extract_json(llm_chat(prompt, timeout=30))
        return data.get("projects") or []
    except Exception:
        return [{"raw": raw}]


def _parse_skills(technical: str, soft: str) -> list:
    """Combine technical + soft skills into a flat list."""
    all_skills = []
    for part in (technical, soft):
        for item in part.replace(";", ",").split(","):
            s = item.strip().strip("•-–")
            if s and len(s) < 60:
                all_skills.append(s)
    return list(dict.fromkeys(all_skills))  # dedupe, preserve order


# ── Public API ─────────────────────────────────────────────────────────────

def get_step(step_index: int) -> dict:
    """Return metadata for the given step (0-indexed)."""
    if 0 <= step_index < TOTAL_STEPS:
        return STEPS[step_index]
    return {}


def advance_session(session: dict, user_answer: str, improve: bool = True) -> dict:
    """
    Record the user's answer for the current step and advance.

    Returns the updated session dict with:
      - answers[step_id] = user_answer (raw)
      - step incremented
      - follow_up question if answer is thin (caller can prompt again)
    """
    step_index = session.get("step", 0)
    if step_index >= TOTAL_STEPS:
        return session

    step = STEPS[step_index]
    step_id = step["id"]
    answers = session.get("answers", {})

    # Optionally improve
    stored_answer = _ai_improve_answer(step_id, step["question"], user_answer) if improve else user_answer
    answers[step_id] = stored_answer

    # Check follow-up (only if short)
    follow_up = _ai_follow_up(step_id, step["question"], user_answer)

    session = {
        **session,
        "step": step_index + 1,
        "answers": answers,
        "follow_up": follow_up,
        "completed": (step_index + 1) >= TOTAL_STEPS,
    }
    return session


def assemble_profile(answers: dict) -> dict:
    """
    Convert the collected wizard answers into a structured profile dict
    matching the shape expected by tailor.py and the profiles table.
    """
    personal_raw = answers.get("personal", "")
    edu_raw = answers.get("education", "")
    work_raw = answers.get("work_experience", "")
    intern_raw = answers.get("internships", "none")
    proj_raw = answers.get("projects", "")
    tech_raw = answers.get("technical_skills", "")
    soft_raw = answers.get("soft_skills", "")
    cert_raw = answers.get("certifications", "none")
    lead_raw = answers.get("leadership", "none")
    vol_raw = answers.get("volunteer", "none")
    goal_raw = answers.get("career_goals", "")

    personal_info = _parse_personal_info(personal_raw)
    education = _parse_education(edu_raw)

    work_roles = _parse_experience(work_raw)
    if intern_raw.lower().strip() not in ("none", "n/a", ""):
        intern_roles = _parse_experience(intern_raw)
        # Tag internships so they can be rendered differently
        for r in intern_roles:
            r["type"] = "internship"
        work_roles = work_roles + intern_roles

    projects = _parse_projects(proj_raw)
    skills = _parse_skills(tech_raw, soft_raw)

    # Certifications / leadership / volunteer appended as extra education/experience bullets
    extras: list[dict] = []
    for label, raw in (("Certifications", cert_raw), ("Leadership", lead_raw), ("Volunteer", vol_raw)):
        if raw.lower().strip() not in ("none", "n/a", ""):
            extras.append({"category": label, "raw": raw})

    return {
        "personal_info": personal_info,
        "full_name": personal_info.get("full_name", ""),
        "email": personal_info.get("email", ""),
        "phone": personal_info.get("phone", ""),
        "location": personal_info.get("location", ""),
        "linkedin": personal_info.get("linkedin", ""),
        "github": personal_info.get("github", ""),
        "education": education,
        "work_experience": work_roles,
        "projects": projects,
        "skills": skills,
        "career_goals": goal_raw,
        "extras": extras,
    }


def initial_session() -> dict:
    """Return a fresh wizard session."""
    return {
        "step": 0,
        "answers": {},
        "follow_up": None,
        "completed": False,
    }
