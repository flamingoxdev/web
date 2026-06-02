"""Merge and deduplicate job listings from multiple sources."""

import re


def _normalize(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]", "", text.lower()).strip()


def deduplicate_jobs(jobs: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for job in jobs:
        key = f"{_normalize(job.get('company'))}_{_normalize(job.get('title'))}"
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(job)
    return unique
