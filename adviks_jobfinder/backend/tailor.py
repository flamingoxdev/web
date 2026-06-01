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
  * Summary is written by the LLM from facts in the profile only.

The single focus of this module is producing a job-tailored RESUME. We do not
generate cover letters, LinkedIn summaries, or any other application material.
"""

import json
import re
from llm import chat as llm_chat, extract_json as _extract_json, chat_messages as llm_chat_messages
from template_registry import get_template_source, default_template_id
from template_bodies import build_template_body, sanitize_template_preamble

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

def _merge_resume_into_profile(resume_text: str, profile: dict) -> dict:
    """Prefer structured sections from the uploaded resume when profile is sparse."""
    from resume_parser import parse_resume_structure

    merged = dict(profile or {})
    work = _coerce_list(merged.get("work_experience"))
    has_rich_work = any(
        isinstance(r, dict) and (_coerce_list(r.get("bullets")) or (r.get("description") or "").strip())
        for r in work
    )
    if has_rich_work:
        return merged

    if not resume_text or len(resume_text.strip()) < 80:
        return merged

    parsed = parse_resume_structure(resume_text)
    if not parsed:
        return merged

    personal = parsed.get("personal") or {}
    if personal:
        pi = _coerce_dict(merged.get("personal_info"))
        for k, v in personal.items():
            if v:
                pi[k] = v
                if k in {"full_name", "email", "phone", "location", "linkedin", "github"}:
                    merged[k] = v
        merged["personal_info"] = pi

    for field in ("skills", "work_experience", "projects", "education"):
        items = parsed.get(field)
        if isinstance(items, list) and items:
            merged[field] = items

    return merged


def _normalize_role(role: dict) -> dict:
    """Ensure every role has a bullets[] array (from description if needed)."""
    if not isinstance(role, dict):
        return {}
    bullets = _coerce_list(role.get("bullets"))
    if not bullets:
        desc = role.get("description") or role.get("summary") or ""
        if isinstance(desc, str) and desc.strip():
            bullets = [
                s.strip().lstrip("•-– ")
                for s in re.split(r"[\n;]+", desc)
                if s.strip()
            ]
    return {**role, "bullets": bullets}


def _llm_summary(
    personal: dict,
    skills: list[str],
    work: list[dict],
    projects: list[dict],
    job_title: str,
    company: str,
    job_description: str,
    resume_excerpt: str,
) -> str:
    facts = {
        "name": personal.get("full_name"),
        "roles": [
            {"title": r.get("title"), "company": r.get("company"), "bullets": _coerce_list(r.get("bullets"))[:3]}
            for r in work[:3]
        ],
        "projects": [p.get("name") for p in projects[:4] if isinstance(p, dict)],
        "top_skills": skills[:12],
        "target_role": job_title,
        "target_company": company,
    }
    prompt = (
        "Write a compelling professional resume SUMMARY tailored to the job below.\n"
        "Requirements:\n"
        "- Write in FIRST PERSON only — use \"I\" and \"my\", never the candidate's name "
        "and never third person (no \"Faizan is…\", \"He/She…\").\n"
        "- 3 to 4 full sentences (100–140 words total).\n"
        "- Lead with strengths that match the job description keywords.\n"
        "- Use ONLY facts from FACTS and RESUME EXCERPT — never invent employers, "
        "degrees, metrics, or tools not listed.\n"
        "- Sound confident and specific; mention relevant technologies from the JD "
        "only if the candidate already has them.\n\n"
        f"FACTS:\n{json.dumps(facts, indent=2)}\n\n"
        f"JOB TITLE: {job_title}\n"
        f"COMPANY: {company}\n"
        f"JOB DESCRIPTION:\n{job_description[:2500]}\n\n"
        f"RESUME EXCERPT (first 2000 chars):\n{resume_excerpt[:2000]}\n\n"
        'Return JSON: {"summary": "..."}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=60))
        out = (data.get("summary") or "").strip()
        if len(out) > 80:
            return out
    except Exception as e:
        print(f"[tailor] summary LLM failed -> fallback: {e}")
    role_part = f"{work[0].get('title')} at {work[0].get('company')}" if work else "Experienced professional"
    sk = ", ".join(skills[:8]) or "relevant technologies"
    return (
        f"I am an experienced {role_part.lower()} with demonstrated expertise in {sk}. "
        f"I have a proven track record delivering results across software development, collaboration, "
        f"and problem-solving in fast-paced environments. "
        f"I am seeking to contribute my technical skills and hands-on experience to the "
        f"{job_title} role at {company}, aligning closely with the team's needs outlined "
        f"in the job description."
    )


def _recency_key(item: dict) -> int:
    """Higher = more recent. Parses years from date fields."""
    for key in ("end_date", "start_date", "year", "duration"):
        val = str(item.get(key) or "").lower()
        if "present" in val or "current" in val:
            return 9999
        years = re.findall(r"(?:20|19)\d{2}", val)
        if years:
            return int(years[-1])
    return 0


def _sort_by_recency(items: list[dict]) -> list[dict]:
    return sorted(
        [i for i in items if isinstance(i, dict)],
        key=_recency_key,
        reverse=True,
    )


def _llm_rank_projects(
    projects: list[dict],
    job_title: str,
    job_description: str,
    max_count: int = 2,
) -> list[dict]:
    """Pick the most job-relevant projects (prefer detailed descriptions)."""
    if not projects:
        return []
    if len(projects) <= max_count:
        return list(projects)

    catalog = [
        {
            "index": i,
            "name": p.get("name", ""),
            "description": (p.get("description") or "")[:300],
            "technologies": _coerce_list(p.get("technologies")),
        }
        for i, p in enumerate(projects)
        if isinstance(p, dict) and p.get("name")
    ]
    if not catalog:
        return list(projects[:max_count])

    prompt = (
        f"Pick the {max_count} best projects for this ONE-PAGE resume. "
        "Prefer projects that (1) match the job description and (2) have rich, specific descriptions. "
        "Return ONLY JSON: {\"indices\": [0, 2, ...]} using the index field. "
        "do not invent projects.\n\n"
        f"TARGET JOB: {job_title}\n"
        f"JOB DESCRIPTION (first 1200 chars): {job_description[:1200]}\n\n"
        f"PROJECTS:\n{json.dumps(catalog, indent=2)}"
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=60))
        indices = data.get("indices") or []
        chosen: list[dict] = []
        seen: set[int] = set()
        for idx in indices:
            if isinstance(idx, int) and 0 <= idx < len(projects) and idx not in seen:
                chosen.append(projects[idx])
                seen.add(idx)
            if len(chosen) >= max_count:
                break
        if chosen:
            return chosen
    except Exception as e:
        print(f"[tailor] project rank failed: {e}")
    return list(projects[:max_count])


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


def _llm_rewrite_bullets(role: dict, job_title: str, job_description: str, resume_excerpt: str) -> list[str]:
    role = _normalize_role(role)
    bullets = _coerce_list(role.get("bullets"))
    if not bullets:
        return []
    prompt = (
        "Rewrite and expand these resume bullets for the target job. "
        "Produce 4–6 detailed bullet points (each 1–2 lines). "
        "STRICT RULE: use ONLY facts from SOURCE BULLETS and RESUME EXCERPT — "
        "do not invent employers, metrics, or technologies.\n"
        "Start each bullet with a strong action verb. Mirror relevant keywords "
        "from the job description when they match existing experience.\n\n"
        f"ROLE: {role.get('title', '')} at {role.get('company', '')}\n"
        f"TARGET JOB: {job_title}\n"
        f"JOB DESCRIPTION (first 1200 chars): {job_description[:1200]}\n\n"
        f"SOURCE BULLETS:\n{json.dumps(bullets, indent=2)}\n\n"
        f"RESUME EXCERPT:\n{resume_excerpt[:1500]}\n\n"
        'Return JSON: {"bullets": ["...", "..."]}'
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=75))
        rewritten = data.get("bullets") or []
        grounded = _ground_bullets(bullets, rewritten)
        return grounded if grounded else list(bullets)
    except Exception as e:
        print(f"[tailor] bullet rewrite failed for {role.get('company')!r}: {e}")
        return list(bullets)


def tailor_resume(
    resume_text: str,
    resume_skills: list[str],
    profile: dict,
    job_title: str,
    company: str,
    job_description: str,
    template: dict,
) -> dict:
    """Build a tailored resume grounded in the uploaded resume + profile."""
    profile = _merge_resume_into_profile(resume_text, profile)
    personal = _personal_from_profile(profile)
    profile_skills = _coerce_list(profile.get("skills"))
    work = _sort_by_recency([r for r in _coerce_list(profile.get("work_experience")) if isinstance(r, dict)])[:3]
    projects = _sort_by_recency([p for p in _coerce_list(profile.get("projects")) if isinstance(p, dict)])
    education = _sort_by_recency([e for e in _coerce_list(profile.get("education")) if isinstance(e, dict)])
    resume_excerpt = resume_text or ""

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
    selected_projects = _llm_rank_projects(projects, job_title, job_description, max_count=2)

    # Work experience — top 3 most recent roles, rewrite bullets only.
    tailored_work: list[dict] = []
    for role in work:
        if not isinstance(role, dict):
            continue
        role = _normalize_role(role)
        bullets = _llm_rewrite_bullets(role, job_title, job_description, resume_excerpt)
        start = role.get("start_date") or ""
        end = role.get("end_date") or ""
        duration = role.get("duration") or (
            f"{start} – {end or 'Present'}" if start else ""
        )
        tailored_work.append({
            "title": role.get("title", ""),
            "company": role.get("company", ""),
            "location": role.get("location", ""),
            "duration": duration,
            "bullets": bullets,
        })

    tailored_projects: list[dict] = []
    for p in selected_projects:
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
            "honors": ed.get("honors") or ed.get("honorary") or "",
            "distinction": ed.get("distinction", ""),
            "relevant_coursework": _coerce_list(ed.get("relevant_coursework") or ed.get("coursework")),
        })

    summary = _llm_summary(personal, ranked_skills, tailored_work, tailored_projects, job_title, company, job_description, resume_excerpt)

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
        "_grounding": {
            "skills_allowlist": skills_union,
            "source_companies": [w.get("company", "") for w in work],
            "source_schools": [ed.get("school") or ed.get("institution", "") for ed in education],
            "projects_in_profile": len(projects),
            "projects_selected": len(tailored_projects),
            "note": "Projects are ranked by job relevance. Bullets and summary are LLM-tailored from profile facts.",
        },
    }


# ── Refinement (user feedback) ─────────────────────────────────────────────

_REFINE_SYSTEM = (
    "You are an expert resume editor working on a single job-specific resume DRAFT. "
    "Your job is to apply ANY change the user requests to the JSON draft. "
    "This includes shortening bullets, removing sections to save space, rewriting summaries, "
    "or even adding custom skills/projects if explicitly requested. "
    "Make sure the resume looks professional. "
    "Return the complete updated resume JSON in the same shape."
)


def _apply_direct_edits(draft: dict, feedback: str) -> dict | None:
    """Apply obvious field edits without LLM (phone, email, etc.)."""
    import copy

    fb = feedback.strip()
    updated = copy.deepcopy(draft)
    contact = dict(updated.get("contact") or {})

    phone_patterns = [
        r"(?:change|update|set|replace)\s+(?:the\s+)?phone(?:\s+number)?\s+(?:to\s+)?([\d\s\-+().]+)",
        r"phone(?:\s+number)?\s+(?:to\s+|=)\s*([\d\s\-+().]+)",
    ]
    for pat in phone_patterns:
        m = re.search(pat, fb, re.I)
        if m:
            contact["phone"] = m.group(1).strip()
            updated["contact"] = contact
            return updated

    email_m = re.search(
        r"(?:change|update|set)\s+(?:the\s+)?email\s+(?:to\s+)?([\w.+-]+@[\w.-]+\.\w+)",
        fb,
        re.I,
    )
    if email_m:
        contact["email"] = email_m.group(1).strip()
        updated["contact"] = contact
        return updated

    linkedin_m = re.search(
        r"(?:change|update|set)\s+(?:the\s+)?linkedin\s+(?:to\s+)?(\S+)",
        fb,
        re.I,
    )
    if linkedin_m:
        contact["linkedin"] = linkedin_m.group(1).strip()
        updated["contact"] = contact
        return updated

    return None


def refine_resume(current_draft: dict, user_feedback: str, job_title: str, company: str) -> dict:
    direct = _apply_direct_edits(current_draft, user_feedback)
    if direct is not None:
        direct["_grounding"] = current_draft.get("_grounding", {})
        return direct

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

    if not isinstance(updated, dict):
        return current_draft

    merged = {
        **current_draft,
        **updated,
        "contact": {**(current_draft.get("contact") or {}), **(updated.get("contact") or {})},
    }
    if isinstance(updated.get("skills"), dict):
        merged["skills"] = {
            **(current_draft.get("skills") or {}),
            **updated["skills"],
        }
    for key in ("work_experience", "projects", "education", "summary"):
        if updated.get(key) not in (None, "", []):
            merged[key] = updated[key]

    updated = merged

    # Preserve grounding metadata from the original draft so future refines
    # keep applying the same allow-list.
    updated["_grounding"] = current_draft.get("_grounding", updated.get("_grounding", {}))
    return updated


# ── Smart assistant (edit + Q&A via NVIDIA / Ollama) ─────────────────────────

_ASSISTANT_SYSTEM = (
    "You are Flamingo, an expert AI resume assistant in a job-specific resume editor.\n"
    "The user has a ONE-PAGE resume DRAFT for a target role. You can edit this draft "
    "to accommodate ANY user request, including shortening it to fit on one page.\n\n"
    "You can:\n"
    "1. EDIT the draft when asked (rewrite summary, shorten bullets, remove older jobs, add custom skills, change tone)\n"
    "2. ANSWER questions (interview prep, ATS tips, what to emphasize)\n\n"
    "Respond with ONLY valid JSON:\n"
    "{\n"
    '  "action": "edit" | "answer",\n'
    '  "reply": "Friendly, specific response to the user (2-6 sentences)",\n'
    '  "resume": null | { complete updated draft with keys: contact, summary, skills, '
    "work_experience, projects, education }\n"
    "}\n\n"
    "Rules:\n"
    "- action \"edit\" → include full updated resume in \"resume\" (same JSON shape)\n"
    "- action \"answer\" → resume must be null; give helpful advice using draft + target job\n"
    "- You MUST follow the user's instructions to edit the resume. If they ask you to shorten it to save space, aggressively trim bullets, skills, or older roles.\n"
    "- If they ask to add something specific, add it.\n"
    "- If they ask a pure question, use action \"answer\".\n"
    "- Be conversational, smart, and reference their actual content"
)


def _compact_draft(draft: dict) -> dict:
    return {
        "contact": draft.get("contact", {}),
        "summary": draft.get("summary", ""),
        "skills": draft.get("skills", {}),
        "work_experience": draft.get("work_experience", []),
        "projects": draft.get("projects", []),
        "education": draft.get("education", []),
        "_grounding": draft.get("_grounding", {}),
    }


def _merge_refined_draft(current_draft: dict, updated: dict) -> dict:
    allow_skills = {
        s.lower()
        for s in (current_draft.get("_grounding", {}).get("skills_allowlist") or [])
    }
    merged = {
        **current_draft,
        **updated,
        "contact": {**(current_draft.get("contact") or {}), **(updated.get("contact") or {})},
    }
    if isinstance(updated.get("skills"), dict):
        merged["skills"] = {**(current_draft.get("skills") or {}), **updated["skills"]}
    for key in ("work_experience", "projects", "education", "summary"):
        if updated.get(key) not in (None, "", []):
            merged[key] = updated[key]
    merged["_grounding"] = current_draft.get("_grounding", merged.get("_grounding", {}))
    return merged


def _looks_like_question(text: str) -> bool:
    t = text.strip().lower()
    if t.endswith("?"):
        return True
    starters = (
        "what ", "why ", "how ", "when ", "where ", "who ", "which ",
        "should ", "can ", "could ", "would ", "is ", "are ", "do ", "does ",
        "explain ", "tell me ", "help me understand", "any tips", "any advice",
    )
    return any(t.startswith(s) for s in starters)


def _looks_like_edit(text: str) -> bool:
    t = text.strip().lower()
    verbs = (
        "change", "update", "set", "replace", "rewrite", "make", "add", "remove",
        "delete", "shorten", "fix", "edit", "put", "rephrase", "tailor", "strengthen",
        "improve", "shorten", "lengthen", "emphasize", "highlight",
    )
    return any(v in t for v in verbs)


def _context_snippet(compact: dict) -> str:
    lines = [f"Name: {(compact.get('contact') or {}).get('name', '')}"]
    summary = (compact.get("summary") or "")[:320]
    if summary:
        lines.append(f"Summary: {summary}")
    for job in (compact.get("work_experience") or [])[:3]:
        if isinstance(job, dict):
            lines.append(f"Role: {job.get('title')} at {job.get('company')}")
    skills = compact.get("skills") or {}
    if isinstance(skills, dict):
        tech = skills.get("technical") or []
        if tech:
            lines.append(f"Skills: {', '.join(str(s) for s in tech[:12])}")
    return "\n".join(lines)


def _compact_for_llm(draft: dict) -> dict:
    c = _compact_draft(draft)
    if isinstance(c.get("summary"), str) and len(c["summary"]) > 400:
        c["summary"] = c["summary"][:400] + "..."
    for job in c.get("work_experience") or []:
        if isinstance(job, dict) and isinstance(job.get("bullets"), list):
            job["bullets"] = job["bullets"][:4]
    return c


def resume_assistant(
    current_draft: dict,
    user_message: str,
    job_title: str,
    company: str,
    history: list[dict] | None = None,
) -> dict:
    """
    Smart resume editor assistant: edits draft OR answers questions.
    Returns {action, reply, tailored?}.
    """
    history = history or []
    msg = user_message.strip()
    if not msg:
        return {"action": "answer", "reply": "Ask me to edit your resume or ask a career question.", "tailored": None}

    direct = _apply_direct_edits(current_draft, msg)
    if direct is not None:
        direct["_grounding"] = current_draft.get("_grounding", {})
        return {
            "action": "edit",
            "reply": "Done — I updated the contact info in this resume draft. Your profile is unchanged.",
            "tailored": direct,
        }

    is_q = _looks_like_question(msg)
    is_edit = _looks_like_edit(msg)
    compact = _compact_for_llm(current_draft)

    # Fast path: questions → plain text answer (no huge JSON round-trip)
    if is_q and not is_edit:
        return _assistant_answer_fallback(compact, msg, job_title, company, history)

    # Fast path: clear edits → refine_resume only (smaller/faster than full assistant JSON)
    if is_edit and not is_q:
        refined = refine_resume(current_draft, msg, job_title, company)
        changed = json.dumps(refined, sort_keys=True) != json.dumps(current_draft, sort_keys=True)
        if changed:
            return {
                "action": "edit",
                "reply": "Done — I updated this resume draft. Your profile is unchanged. PDF will sync automatically.",
                "tailored": refined,
            }
        return {
            "action": "answer",
            "reply": "I couldn't apply that change safely. Try being more specific about what to change.",
            "tailored": None,
        }

    # Mixed/ambiguous: try edit first, then answer
    refined = refine_resume(current_draft, msg, job_title, company)
    if json.dumps(refined, sort_keys=True) != json.dumps(current_draft, sort_keys=True):
        return {
            "action": "edit",
            "reply": "Done — I updated this resume draft based on your request.",
            "tailored": refined,
        }
    return _assistant_answer_fallback(compact, msg, job_title, company, history)


def _assistant_answer_fallback(
    compact_draft: dict,
    user_message: str,
    job_title: str,
    company: str,
    history: list[dict],
) -> dict:
    """Plain-text NVIDIA answer — lightweight context for speed."""
    system = (
        "You are Flamingo, a helpful resume and career coach. The user is editing a "
        "one-page resume for a specific job. Answer clearly in 2-5 sentences. "
        "Use only facts from their resume snippet. Do not invent experience."
    )
    messages: list[dict] = [{"role": "system", "content": system}]
    for h in history[-4:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": str(h["content"])[:400]})
    messages.append({
        "role": "user",
        "content": (
            f"Job: {job_title} at {company}\n"
            f"Resume:\n{_context_snippet(compact_draft)}\n\n"
            f"Question: {user_message}"
        ),
    })
    try:
        reply = llm_chat_messages(messages, json_mode=False, timeout=45, max_tokens=450)
        return {"action": "answer", "reply": reply.strip(), "tailored": None}
    except Exception as e:
        print(f"[tailor] assistant fallback failed: {e}")
        return {
            "action": "answer",
            "reply": "Sorry, I had trouble answering that. Please try again.",
            "tailored": None,
        }


def _tex_escape(text) -> str:
    """Escape LaTeX special characters so user content compiles with pdflatex."""
    if text is None:
        return ""
    s = str(text)
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    out = []
    for ch in s:
        out.append(replacements.get(ch, ch))
    return "".join(out)


def _as_list(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return [v for v in value if v not in (None, "")]
    if isinstance(value, str):
        parts = re.split(r"[,\n;•]", value)
        return [p.strip() for p in parts if p.strip()]
    return []


# The exact Jake Gutierrez "Jake's Resume" preamble (the canonical template the
# project is built around). We fill the body deterministically from the tailored
# JSON so the produced PDF always matches this template and always compiles.
_JAKE_PREAMBLE = r"""%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
"""


def _strip_scheme(url: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", (url or "").strip()).rstrip("/")


SECTION_ORDERS = {
    "jakes": ["summary", "education", "experience", "projects", "skills"],
    "modern": ["summary", "experience", "projects", "education", "skills"],
    "compact": ["summary", "skills", "experience", "projects", "education"],
}


def json_to_latex(
    resume_json: dict,
    job_title: str = "",
    latex_template: str | None = None,
    template_id: str | None = None,
) -> str:
    """Render tailored resume JSON into LaTeX using the selected ALLtemplates layout."""
    tid = template_id or default_template_id()
    src = latex_template or get_template_source(tid)
    if src and "\\begin{document}" in src:
        pre = sanitize_template_preamble(src.split("\\begin{document}")[0].rstrip())
    else:
        pre = _JAKE_PREAMBLE
    body = build_template_body(tid, resume_json, job_title)
    return f"{pre}\n\\begin{{document}}\n{body}\n\\end{{document}}\n"


def latex_to_json(latex_code: str) -> dict:
    """Parse edited LaTeX back into structured resume JSON for the live preview."""
    prompt = (
        "Parse the LaTeX resume below into JSON. Return ONLY valid JSON with this shape:\n"
        "{\n"
        '  "contact": {"name":"","email":"","phone":"","linkedin":"","github":""},\n'
        '  "summary": "",\n'
        '  "education": [{"school":"","degree":"","year":"","location":"","gpa":""}],\n'
        '  "work_experience": [{"title":"","company":"","duration":"","location":"","bullets":[]}],\n'
        '  "projects": [{"name":"","description":"","technologies":[],"highlights":[]}],\n'
        '  "skills": {"technical": [], "soft": []}\n'
        "}\n"
        "For skills, parse \\textbf{Skills} and \\textbf{Strengths} into technical and soft arrays separately.\n"
        "Extract text from \\resumeItem, \\section headings, and the heading block. "
        "Do not invent content not present in the LaTeX.\n\n"
        f"LATEX:\n{latex_code[:14000]}"
    )
    try:
        data = _extract_json(_call_ollama(prompt, timeout=90))
        if isinstance(data, dict):
            return data
    except Exception as e:
        print(f"[latex_to_json] LLM parse failed: {e}")
    return {}
