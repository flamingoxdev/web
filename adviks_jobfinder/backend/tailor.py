"""
Grounded resume tailoring.

Hard rule: the tailored resume is built from the user's actual profile and
resume text — the LLM only rephrases / re-orders / writes a brief summary.
It never invents companies, titles, dates, schools, projects, or skills.

Specifically:
  * Contact info, work history, projects, education are copied VERBATIM
    from the user's profile.
  * Skills come strictly from the union of (resume_skills, profile.skills).
    The LLM is asked to pick a subset relevant to the job; any returned skill
    not in the allow-list is dropped.
  * Bullets for each role: passed through the LLM with the rule "only restate
    facts already present in the source bullets". Output bullets are filtered
    so each must share ≥3 content tokens with at least one source bullet (or
    we fall back to the original bullet).
  * Summary and cover-letter draft are written by the LLM from facts in the
    profile only.
"""

import json
import re
from llm import chat as llm_chat, extract_json as _extract_json

_STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with",
    "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
    "i", "we", "my", "our", "this", "that", "these", "those", "it", "its",
    "his", "her", "their", "co", "amp",
}


def _call_ollama(prompt: str, *, timeout: int = 60, json_mode: bool = True, system: str | None = None) -> str:
    """Backwards-compatible name kept for clarity in this module; routes through llm.chat."""
    return llm_chat(prompt, system=system, json_mode=json_mode, timeout=timeout)


# ── Helpers ────────────────────────────────────────────────────────────────

def _tokens(text: str) -> set[str]:
    return {
        t for t in re.findall(r"[A-Za-z][A-Za-z+.#-]{2,}", (text or "").lower())
        if t not in _STOPWORDS
    }


def _coerce_list(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _coerce_dict(value) -> dict:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _personal_from_profile(profile: dict) -> dict:
    p = _coerce_dict(profile.get("personal_info"))
    fields = ("full_name", "email", "phone", "location", "linkedin", "github",
              "street_address", "city", "state", "zip_code", "country",
              "visa_status", "expected_graduation")
    for k in fields:
        if not p.get(k) and profile.get(k):
            p[k] = profile[k]
    return p


# ── Template (kept LLM-free; deterministic mapping) ────────────────────────

def search_template(job_title: str, job_description: str) -> dict:
    """Pick a template based on title heuristics. No LLM call -> no hallucination."""
    title = (job_title or "").lower()
    desc = (job_description or "").lower()
    if any(k in title for k in ("intern", "co-op", "trainee")):
        format_ = "targeted"
        emphasis = ["coursework", "projects", "internships"]
        tone = "professional"
    elif any(k in title + desc for k in ("research", "phd", "scientist", "academic")):
        format_ = "combination"
        emphasis = ["publications", "research", "skills"]
        tone = "academic"
    elif any(k in title for k in ("manager", "lead", "principal", "director", "senior")):
        format_ = "chronological"
        emphasis = ["leadership", "impact", "experience"]
        tone = "professional"
    else:
        format_ = "chronological"
        emphasis = ["experience", "projects", "skills"]
        tone = "professional"
    return {
        "template_name": f"{format_.title()} resume",
        "format": format_,
        "sections_order": ["contact", "summary", "skills", "experience", "projects", "education"],
        "emphasis": emphasis,
        "formatting_tips": ["1 page if <5 yrs experience", "Use action verbs", "Quantify impact where present"],
        "tone": tone,
    }


# ── Main tailoring (grounded) ──────────────────────────────────────────────

def _llm_summary(personal: dict, skills: list[str], work: list[dict], job_title: str, company: str) -> str:
    facts = {
        "name": personal.get("full_name"),
        "current_role": work[0].get("title") if work else None,
        "current_company": work[0].get("company") if work else None,
        "top_skills": skills[:8],
        "target_role": job_title,
        "target_company": company,
    }
    prompt = (
        "Write a professional resume summary (max 2 sentences, ~40 words). "
        "Use ONLY facts from this JSON. Do not invent any role, employer, "
        "degree, or skill that isn't listed.\n\n"
        f"FACTS:\n{json.dumps(facts, indent=2)}\n\n"
        'Return JSON: {"summary": "..."}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=45))
        out = (data.get("summary") or "").strip()
        if 10 < len(out) < 400:
            return out
    except Exception as e:
        print(f"[tailor] summary LLM failed -> fallback: {e}")
    role_part = f"{work[0].get('title')} at {work[0].get('company')}" if work else "Candidate"
    sk = ", ".join(skills[:5]) or "general software"
    return f"{role_part} with hands-on experience in {sk}. Seeking the {job_title} role at {company}."


def _llm_rank_skills(all_skills: list[str], job_title: str, job_description: str) -> list[str]:
    if not all_skills:
        return []
    prompt = (
        "From the candidate's skills below, return the subset most relevant to "
        "the job, in priority order. Do NOT add any skill not in the input list.\n\n"
        f"CANDIDATE SKILLS:\n{json.dumps(all_skills)}\n\n"
        f"JOB TITLE: {job_title}\n"
        f"JOB DESCRIPTION (first 1200 chars): {job_description[:1200]}\n\n"
        'Return JSON: {"ranked": ["skill1", "skill2", ...]}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=45))
        ranked_raw = data.get("ranked") or []
        allow = {s.lower(): s for s in all_skills}
        ranked = []
        seen = set()
        for s in ranked_raw:
            key = str(s).strip().lower()
            if key in allow and key not in seen:
                ranked.append(allow[key])
                seen.add(key)
        # Append leftovers preserving original order so nothing is silently dropped.
        for s in all_skills:
            if s.lower() not in seen:
                ranked.append(s)
                seen.add(s.lower())
        return ranked
    except Exception as e:
        print(f"[tailor] skill ranking failed -> original order: {e}")
        return list(all_skills)


def _ground_bullets(source_bullets: list[str], rewritten: list[str]) -> list[str]:
    """Map each source bullet to the best rewritten variant (>=3 shared content
    tokens). If no rewrite matches a source bullet, fall back to the source
    bullet verbatim. Every source bullet is always represented exactly once."""
    if not source_bullets:
        return []
    source_tokens = [_tokens(b) for b in source_bullets]

    # Score (source_idx, rewrite) pairs and assign greedily by best overlap.
    scored: list[tuple[int, int, str]] = []  # (overlap, source_idx, rewrite)
    for line in rewritten or []:
        line = (line or "").strip()
        if not line:
            continue
        line_tokens = _tokens(line)
        for i, st in enumerate(source_tokens):
            overlap = len(line_tokens & st)
            if overlap >= 3:
                scored.append((overlap, i, line))
    scored.sort(reverse=True)

    chosen: dict[int, str] = {}
    used_rewrites: set[int] = set()
    for overlap, i, line in scored:
        if i in chosen:
            continue
        rid = id(line)
        if rid in used_rewrites:
            continue
        chosen[i] = line
        used_rewrites.add(rid)

    return [chosen.get(i, source_bullets[i]) for i in range(len(source_bullets))]


def _llm_rewrite_bullets(role: dict, job_title: str, job_description: str) -> list[str]:
    bullets = _coerce_list(role.get("bullets") or role.get("description"))
    if not bullets:
        return []
    prompt = (
        "Rewrite each bullet to be concise and start with an action verb. "
        "STRICT RULE: do not introduce any new fact, metric, technology, "
        "responsibility, employer, or outcome that is not already stated in "
        "the source bullets below. You may rephrase, shorten, or reorder.\n\n"
        f"ROLE: {role.get('title', '')} at {role.get('company', '')}\n"
        f"TARGET JOB TITLE: {job_title}\n"
        f"TARGET JOB CONTEXT (1st 500 chars): {job_description[:500]}\n\n"
        f"SOURCE BULLETS:\n{json.dumps(bullets, indent=2)}\n\n"
        'Return JSON: {"bullets": ["...", "...", ...]}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=60))
        rewritten = data.get("bullets") or []
        return _ground_bullets(bullets, rewritten)
    except Exception as e:
        print(f"[tailor] bullet rewrite failed for {role.get('company')!r}: {e}")
        return list(bullets)


def _llm_cover_letter(personal: dict, skills: list[str], work: list[dict],
                      job_title: str, company: str, job_description: str) -> str:
    facts = {
        "name": personal.get("full_name"),
        "current_role": work[0].get("title") if work else None,
        "current_company": work[0].get("company") if work else None,
        "skills": skills[:10],
        "target_role": job_title,
        "target_company": company,
    }
    prompt = (
        "Write a 3-paragraph cover letter (≤180 words total). Use ONLY facts "
        "in this JSON. Do not invent roles, employers, schools, projects, or "
        "metrics. End with the candidate's name.\n\n"
        f"FACTS:\n{json.dumps(facts, indent=2)}\n\n"
        f"JOB DESCRIPTION (first 800 chars): {job_description[:800]}\n\n"
        'Return JSON: {"letter": "Para 1...\\n\\nPara 2...\\n\\nPara 3..."}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=60))
        letter = (data.get("letter") or "").strip()
        if len(letter) > 80:
            return letter
    except Exception as e:
        print(f"[tailor] cover letter LLM failed -> fallback: {e}")
    name = personal.get("full_name", "")
    return (
        f"Dear {company} Hiring Team,\n\n"
        f"I'm applying for the {job_title} role. "
        f"{'My background as ' + work[0].get('title','') + ' at ' + work[0].get('company','') + ' ' if work else ''}"
        f"has given me practical experience with {', '.join(skills[:4]) or 'the relevant tooling'}.\n\n"
        f"I'd welcome the opportunity to contribute to {company}.\n\n{name}"
    )


def tailor_resume(
    resume_text: str,
    resume_skills: list[str],
    profile: dict,
    job_title: str,
    company: str,
    job_description: str,
    template: dict,
) -> dict:
    """Build a tailored resume that is strictly grounded in profile data."""
    personal = _personal_from_profile(profile)
    profile_skills = _coerce_list(profile.get("skills"))
    work = _coerce_list(profile.get("work_experience"))
    projects = _coerce_list(profile.get("projects"))
    education = _coerce_list(profile.get("education"))

    # Allow-list of skills the candidate actually has.
    skills_union: list[str] = []
    seen: set[str] = set()
    for s in (resume_skills or []) + profile_skills:
        if not isinstance(s, str):
            continue
        key = s.strip().lower()
        if key and key not in seen:
            skills_union.append(s.strip())
            seen.add(key)

    ranked_skills = _llm_rank_skills(skills_union, job_title, job_description)

    # Work experience — copy facts, rewrite bullets only.
    tailored_work: list[dict] = []
    for role in work:
        if not isinstance(role, dict):
            continue
        bullets = _llm_rewrite_bullets(role, job_title, job_description)
        tailored_work.append({
            "title": role.get("title", ""),
            "company": role.get("company", ""),
            "location": role.get("location", ""),
            "duration": role.get("duration") or f"{role.get('start','')} - {role.get('end','') or 'Present'}",
            "bullets": bullets,
        })

    # Projects / education / skills are copied verbatim.
    tailored_projects: list[dict] = []
    for p in projects:
        if not isinstance(p, dict):
            continue
        tailored_projects.append({
            "name": p.get("name", ""),
            "description": p.get("description", ""),
            "technologies": _coerce_list(p.get("technologies")) or _coerce_list(p.get("tech")),
            "url": p.get("url", ""),
            "highlights": _coerce_list(p.get("highlights") or p.get("bullets")),
        })

    tailored_education: list[dict] = []
    for ed in education:
        if not isinstance(ed, dict):
            continue
        tailored_education.append({
            "degree": ed.get("degree", ""),
            "school": ed.get("school") or ed.get("institution", ""),
            "year": ed.get("year") or ed.get("graduation_year", ""),
            "gpa": ed.get("gpa", ""),
            "relevant_coursework": _coerce_list(ed.get("relevant_coursework") or ed.get("coursework")),
        })

    summary = _llm_summary(personal, ranked_skills, tailored_work, job_title, company)
    cover_letter = _llm_cover_letter(personal, ranked_skills, tailored_work, job_title, company, job_description)

    # Split skills into "technical" / "soft" by simple heuristics — only from allow-list.
    soft_markers = {"communication", "leadership", "teamwork", "writing",
                    "problem-solving", "collaboration", "presentation", "research"}
    technical, soft = [], []
    for s in ranked_skills:
        (soft if s.lower() in soft_markers else technical).append(s)

    return {
        "contact": {
            "name": personal.get("full_name", ""),
            "email": personal.get("email", ""),
            "phone": personal.get("phone", ""),
            "location": personal.get("location", ""),
            "linkedin": personal.get("linkedin", ""),
            "github": personal.get("github", ""),
        },
        "summary": summary,
        "skills": {"technical": technical, "soft": soft},
        "work_experience": tailored_work,
        "projects": tailored_projects,
        "education": tailored_education,
        "cover_letter_draft": cover_letter,
        "_grounding": {
            "skills_allowlist": skills_union,
            "source_companies": [w.get("company", "") for w in work],
            "source_schools": [ed.get("school") or ed.get("institution", "") for ed in education],
            "note": "All factual fields are copied verbatim from profile. LLM only rephrases bullets, writes summary, and writes cover letter.",
        },
    }


# ── Refinement (user feedback) ─────────────────────────────────────────────

_REFINE_SYSTEM = (
    "You are a resume editor. The candidate sends short feedback. Apply ONLY "
    "the requested change, and ONLY if the change does not introduce any "
    "factual claim (employer, school, title, date, skill, project, metric) "
    "that is missing from the current resume JSON. If the user asks to add "
    "something that isn't supported by their resume, respond with the resume "
    "unchanged. Return the full updated resume JSON."
)


def refine_resume(current_draft: dict, user_feedback: str, job_title: str, company: str) -> dict:
    allow_skills = {
        s.lower()
        for s in (current_draft.get("_grounding", {}).get("skills_allowlist") or [])
    }
    compact_draft = {
        "contact": current_draft.get("contact", {}),
        "summary": current_draft.get("summary", ""),
        "skills": current_draft.get("skills", {}),
        "work_experience": current_draft.get("work_experience", []),
        "projects": current_draft.get("projects", []),
        "education": current_draft.get("education", []),
        "cover_letter_draft": current_draft.get("cover_letter_draft", ""),
        "_grounding": current_draft.get("_grounding", {}),
    }
    prompt = (
        f"CURRENT RESUME JSON:\n{json.dumps(compact_draft, indent=2)}\n\n"
        f"TARGET: {job_title} at {company}\n\n"
        f"USER FEEDBACK:\n{user_feedback}\n\n"
        "Return the COMPLETE updated resume JSON in the same shape. "
        "Do not invent any new fact. If you cannot safely apply the change, "
        "return the resume unchanged."
    )
    try:
        raw = _call_ollama(prompt, timeout=45, system=_REFINE_SYSTEM)
        updated = _extract_json(raw)
    except Exception as e:
        print(f"[tailor] refine LLM failed -> unchanged: {e}")
        return current_draft

    # Skill safety net: drop any skill in the refined version that wasn't allowed.
    if allow_skills and isinstance(updated.get("skills"), dict):
        for bucket in ("technical", "soft"):
            updated["skills"][bucket] = [
                s for s in (updated["skills"].get(bucket) or [])
                if isinstance(s, str) and s.lower() in allow_skills
            ]

    # Preserve grounding metadata from the original draft so future refines
    # keep applying the same allow-list.
    updated["_grounding"] = current_draft.get("_grounding", updated.get("_grounding", {}))
    return updated
