"""
AI Resume Tailoring module.

Uses Ollama to:
1. Search for the best resume template based on job type
2. Tailor the user's resume to a specific job description
3. Refine the tailored resume based on user chat input
"""

import os, json, re
import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


def _call_ollama(prompt: str, timeout: int = 120, json_mode: bool = True) -> str:
    """Send a prompt to Ollama and return the response text.

    `json_mode=True` passes Ollama's `format: "json"` flag which constrains
    the model output to valid JSON (supported on llama3.1 and newer)."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    if json_mode:
        payload["format"] = "json"

    r = httpx.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=timeout)
    return r.json()["message"]["content"].strip()


_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*|\s*```", re.MULTILINE)


def _extract_json(raw: str) -> dict:
    """Best-effort JSON extraction from an LLM response.

    Order of attempts:
      1. parse `raw` directly (works when `format: json` is honored)
      2. strip markdown fences and try again
      3. slice from the first `{` to the last `}` and try that
    """
    if not raw or not raw.strip():
        raise ValueError("LLM returned empty response")

    candidates = []
    candidates.append(raw.strip())
    candidates.append(_FENCE_RE.sub("", raw).strip())

    first = raw.find("{")
    last = raw.rfind("}")
    if first != -1 and last > first:
        candidates.append(raw[first : last + 1].strip())

    last_err: Exception | None = None
    for c in candidates:
        if not c:
            continue
        try:
            return json.loads(c)
        except json.JSONDecodeError as e:
            last_err = e
            continue

    snippet = raw[:200].replace("\n", " ")
    raise ValueError(f"Could not parse JSON from LLM output. First 200 chars: {snippet!r} ({last_err})")


def search_template(job_title: str, job_description: str) -> dict:
    """
    Ask the AI to recommend the best resume template/format for this job type.
    Returns a dict with template name, sections to emphasize, and formatting tips.
    """
    prompt = f"""You are a professional resume consultant. Based on this job, recommend
the best resume template format.

Job Title: {job_title}
Job Description (excerpt): {job_description[:1000]}

Return ONLY a JSON object in this exact format:
{{
  "template_name": "name of the recommended template style",
  "format": "chronological" | "functional" | "combination" | "targeted",
  "sections_order": ["section1", "section2", ...],
  "emphasis": ["what to highlight 1", "what to highlight 2"],
  "formatting_tips": ["tip1", "tip2"],
  "tone": "professional" | "creative" | "technical" | "academic"
}}

Return only the JSON, no markdown, no explanation."""

    try:
        raw = _call_ollama(prompt)
        return _extract_json(raw)
    except Exception as e:
        print(f"Template search error: {e}")
        return {
            "template_name": "Standard Professional",
            "format": "chronological",
            "sections_order": ["contact", "summary", "experience", "education", "skills", "projects"],
            "emphasis": ["relevant experience", "matching skills"],
            "formatting_tips": ["Keep to 1 page", "Use action verbs"],
            "tone": "professional",
        }


def tailor_resume(
    resume_text: str,
    resume_skills: list[str],
    profile: dict,
    job_title: str,
    company: str,
    job_description: str,
    template: dict,
) -> dict:
    """
    Generate a tailored resume for a specific job.
    Uses the user's profile data + resume + AI template recommendation.
    Returns structured JSON with all resume sections.
    """
    # Build profile context
    work_exp = json.dumps(profile.get("work_experience", []), indent=2) if profile.get("work_experience") else "None provided"
    projects = json.dumps(profile.get("projects", []), indent=2) if profile.get("projects") else "None provided"
    education = json.dumps(profile.get("education", []), indent=2) if profile.get("education") else "None provided"
    personal = profile.get("personal_info", {})

    prompt = f"""You are an expert resume writer. Create a tailored resume for this job application.

TARGET JOB:
- Title: {job_title}
- Company: {company}
- Description: {job_description[:1500]}

CANDIDATE PROFILE:
- Name: {personal.get('full_name', 'N/A')}
- Email: {personal.get('email', 'N/A')}
- Phone: {personal.get('phone', 'N/A')}
- Location: {personal.get('location', 'N/A')}
- LinkedIn: {personal.get('linkedin', 'N/A')}
- GitHub: {personal.get('github', 'N/A')}
- Current Skills: {', '.join(resume_skills)}
- Work Experience: {work_exp}
- Projects: {projects}
- Education: {education}

RESUME TEMPLATE FORMAT:
- Style: {template.get('template_name', 'Standard')}
- Format: {template.get('format', 'chronological')}
- Section Order: {json.dumps(template.get('sections_order', []))}
- Emphasis: {json.dumps(template.get('emphasis', []))}
- Tone: {template.get('tone', 'professional')}

ORIGINAL RESUME EXCERPT: {resume_text[:800]}

Generate a complete tailored resume. Return ONLY a JSON object:
{{
  "summary": "2-3 sentence professional summary tailored to this job",
  "skills": {{
    "technical": ["skill1", "skill2"],
    "soft": ["skill1", "skill2"]
  }},
  "work_experience": [
    {{
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Start - End",
      "bullets": ["achievement 1", "achievement 2"]
    }}
  ],
  "projects": [
    {{
      "name": "Project Name",
      "description": "Brief description tailored to show relevant skills",
      "technologies": ["tech1", "tech2"],
      "highlights": ["highlight 1"]
    }}
  ],
  "education": [
    {{
      "degree": "Degree Name",
      "school": "School Name",
      "year": "Year",
      "relevant_coursework": ["course1", "course2"]
    }}
  ],
  "cover_letter_draft": "A brief 3-paragraph cover letter draft"
}}

Return only JSON, no markdown."""

    try:
        raw = _call_ollama(prompt, timeout=180)
        return _extract_json(raw)
    except Exception as e:
        print(f"Tailor error: {e}")
        return {"error": str(e)}


def refine_resume(current_draft: dict, user_feedback: str, job_title: str, company: str) -> dict:
    """
    Refine the tailored resume based on user feedback in chat format.
    """
    prompt = f"""You are an expert resume writer. The user has reviewed their tailored resume
for the position of {job_title} at {company} and wants changes.

CURRENT DRAFT:
{json.dumps(current_draft, indent=2)}

USER FEEDBACK:
{user_feedback}

Apply the user's requested changes to the resume draft. Keep all sections intact
and only modify what the user asked for. Return the COMPLETE updated resume as JSON
in the exact same format as the current draft.

Return only JSON, no markdown, no explanation."""

    try:
        raw = _call_ollama(prompt, timeout=120)
        return _extract_json(raw)
    except Exception as e:
        print(f"Refine error: {e}")
        return current_draft
