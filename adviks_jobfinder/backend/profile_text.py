"""Build plain-text resume content from a user profile (no upload required)."""

import json


def _parse_field(profile: dict, field: str):
    val = profile.get(field)
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


def profile_to_resume_text(profile: dict) -> str:
    """Serialize profile into text used for job matching and tailoring context."""
    if not profile:
        return ""

    personal = _parse_field(profile, "personal_info") or {}
    if not isinstance(personal, dict):
        personal = {}

    name = profile.get("full_name") or personal.get("full_name") or ""
    lines: list[str] = [name, ""]

    skills = _parse_field(profile, "skills") or []
    if isinstance(skills, list) and skills:
        lines.append("SKILLS: " + ", ".join(str(s) for s in skills))
        lines.append("")

    work = _parse_field(profile, "work_experience") or []
    if isinstance(work, list):
        lines.append("EXPERIENCE")
        for w in work:
            if not isinstance(w, dict):
                continue
            title = w.get("title") or ""
            company = w.get("company") or ""
            start = w.get("start_date") or ""
            end = w.get("end_date") or w.get("duration") or ""
            loc = w.get("location") or ""
            lines.append(f"{title} at {company} ({start} – {end}) {loc}".strip())
            desc = w.get("description") or ""
            if desc:
                lines.append(str(desc))
            lines.append("")

    projects = _parse_field(profile, "projects") or []
    if isinstance(projects, list):
        lines.append("PROJECTS")
        for p in projects:
            if not isinstance(p, dict):
                continue
            lines.append(p.get("name") or "")
            if p.get("description"):
                lines.append(str(p.get("description")))
            tech = p.get("technologies") or ""
            if tech:
                lines.append(f"Tech: {tech}")
            lines.append("")

    education = _parse_field(profile, "education") or []
    if isinstance(education, list):
        lines.append("EDUCATION")
        for ed in education:
            if not isinstance(ed, dict):
                continue
            lines.append(
                f"{ed.get('degree', '')} — {ed.get('school', '')} ({ed.get('year', '')})"
            )

    return "\n".join(lines).strip()
