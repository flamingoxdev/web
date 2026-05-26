"""
Heuristic extractor: pulls personal-info fields out of raw resume text.

Used by /upload to pre-populate the profile so the user doesn't have to
retype name/email/phone/links. The user can still edit anything in
Profile; we only fill blanks (never overwrite existing values).
"""

import re

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}"
)
_LINKEDIN_RE = re.compile(
    r"(?:https?://)?(?:www\.)?linkedin\.com/(?:in|pub)/[A-Za-z0-9_-]+/?",
    re.IGNORECASE,
)
_GITHUB_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_-]+/?",
    re.IGNORECASE,
)


def _guess_name(text: str, email: str | None) -> str:
    """The first non-empty line that looks like a name (2+ capitalized words,
    no digits, no @). Falls back to the local part of the email."""
    for raw_line in text.splitlines()[:8]:
        line = raw_line.strip()
        if not line or "@" in line or any(ch.isdigit() for ch in line):
            continue
        words = line.split()
        if 2 <= len(words) <= 5 and all(w[0].isupper() for w in words if w):
            if len(line) <= 60:
                return line
    if email:
        local = email.split("@", 1)[0]
        parts = re.split(r"[._-]+", local)
        if len(parts) >= 2:
            return " ".join(p.capitalize() for p in parts if p)
    return ""


def extract_personal_info(text: str) -> dict:
    """Return a dict with whichever of these keys we could find:
    full_name, email, phone, linkedin, github. Missing keys are omitted."""
    if not text:
        return {}

    info: dict = {}

    m = _EMAIL_RE.search(text)
    email = m.group(0) if m else None
    if email:
        info["email"] = email

    m = _PHONE_RE.search(text)
    if m:
        info["phone"] = m.group(0).strip()

    m = _LINKEDIN_RE.search(text)
    if m:
        url = m.group(0)
        info["linkedin"] = url if url.startswith("http") else f"https://{url}"

    m = _GITHUB_RE.search(text)
    if m:
        url = m.group(0)
        info["github"] = url if url.startswith("http") else f"https://{url}"

    name = _guess_name(text, email)
    if name:
        info["full_name"] = name

    return info


def merge_into_profile(existing: dict | None, extracted: dict) -> dict:
    """Merge extracted fields into the existing profile without clobbering
    values the user has already filled in."""
    existing = existing or {}
    personal = existing.get("personal_info") or {}
    if isinstance(personal, str):
        import json
        try:
            personal = json.loads(personal)
        except (json.JSONDecodeError, TypeError):
            personal = {}

    updates: dict = {}
    new_personal = dict(personal)
    for key, value in extracted.items():
        if not value:
            continue
        if not new_personal.get(key):
            new_personal[key] = value
        # Top-level simple fields (full_name, email, phone) mirror personal_info
        # because db.upsert_profile stores them in dedicated columns too.
        if key in {"full_name", "email", "phone", "linkedin", "github"}:
            if not existing.get(key):
                updates[key] = value

    updates["personal_info"] = new_personal
    return updates
