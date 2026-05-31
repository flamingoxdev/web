"""Onboarding completeness checks for mandatory profile + resume steps."""

import json


REQUIRED_PERSONAL_KEYS = [
    "full_name",
    "email",
    "phone",
    "street_address",
    "city",
    "state",
    "zip_code",
    "country",
]


def _parse_field(profile: dict, field: str):
    val = profile.get(field)
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


def _personal_info(profile: dict) -> dict:
    pi = _parse_field(profile, "personal_info")
    if isinstance(pi, dict):
        merged = {**pi}
    else:
        merged = {}
    for key in ("full_name", "email", "phone", "location", "linkedin", "github"):
        if profile.get(key) and not merged.get(key):
            merged[key] = profile[key]
    return merged


def has_template_selected(profile: dict | None) -> bool:
    if not profile:
        return False
    pi = _parse_field(profile, "personal_info")
    if isinstance(pi, dict) and pi.get("resume_template"):
        return True
    return bool(profile.get("resume_template"))


def is_onboarding_ready(profile: dict | None, resume_count: int = 0) -> bool:
    """User is ready once profile is complete and a template is chosen."""
    return is_profile_complete(profile) and has_template_selected(profile)


def is_profile_complete(profile: dict | None) -> bool:
    if not profile:
        return False

    personal = _personal_info(profile)
    for key in REQUIRED_PERSONAL_KEYS:
        if not str(personal.get(key, "")).strip():
            return False

    skills = _parse_field(profile, "skills")
    if not isinstance(skills, list) or len(skills) == 0:
        return False

    work = _parse_field(profile, "work_experience")
    if not isinstance(work, list) or not any(
        isinstance(w, dict) and (w.get("title") or w.get("company")) for w in work
    ):
        return False

    projects = _parse_field(profile, "projects")
    if not isinstance(projects, list) or not any(
        isinstance(p, dict) and p.get("name") for p in projects
    ):
        return False

    return True


def missing_profile_fields(profile: dict | None) -> list[str]:
    if not profile:
        return REQUIRED_PERSONAL_KEYS + ["skills", "work_experience", "projects"]

    missing: list[str] = []
    personal = _personal_info(profile)
    for key in REQUIRED_PERSONAL_KEYS:
        if not str(personal.get(key, "")).strip():
            missing.append(key)

    skills = _parse_field(profile, "skills")
    if not isinstance(skills, list) or len(skills) == 0:
        missing.append("skills")

    work = _parse_field(profile, "work_experience")
    if not isinstance(work, list) or not any(
        isinstance(w, dict) and (w.get("title") or w.get("company")) for w in work
    ):
        missing.append("work_experience")

    projects = _parse_field(profile, "projects")
    if not isinstance(projects, list) or not any(
        isinstance(p, dict) and p.get("name") for p in projects
    ):
        missing.append("projects")

    return missing
