"""RemoteOK job search API (no key required)."""

import re
from datetime import datetime, timezone

import httpx


def _normalize_job(job: dict) -> dict | None:
    if not isinstance(job, dict) or not job.get("id"):
        return None
    desc = job.get("description") or ""
    apply_url = job.get("apply_url") or job.get("url") or ""
    return {
        "id": f"remoteok_{job.get('id')}",
        "source": "remoteok",
        "title": job.get("position") or "",
        "company": job.get("company") or "",
        "location": "Remote",
        "description": desc,
        "description_snippet": re.sub(r"<[^>]+>", " ", desc)[:280],
        "salary_min": int(job["salary_min"]) if job.get("salary_min") else None,
        "salary_max": int(job["salary_max"]) if job.get("salary_max") else None,
        "apply_url": apply_url,
        "url": apply_url,
        "posted_at": datetime.fromtimestamp(int(job.get("epoch") or 0), tz=timezone.utc).isoformat()
        if job.get("epoch")
        else None,
        "is_remote": True,
        "tags": job.get("tags") or [],
    }


def _matches_query(job: dict, query: str) -> bool:
    q = query.lower().strip()
    if not q:
        return True
    hay = " ".join([
        job.get("title") or "",
        job.get("company") or "",
        job.get("description") or "",
        " ".join(job.get("tags") or []),
    ]).lower()
    return any(word in hay for word in q.split() if len(word) > 2)


async def fetch_remoteok_jobs(*, query: str, count: int = 30) -> list[dict]:
    headers = {"User-Agent": "Flamingo-AI Job Platform/1.0 (contact@flamingo-ai.com)"}
    tag = query.lower().strip().replace(" ", "-")

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        tagged_res = await client.get(f"https://remoteok.com/api?tag={tag}")
        all_res = await client.get("https://remoteok.com/api")

    jobs: list[dict] = []
    seen: set[str] = set()

    for res in (tagged_res, all_res):
        if not res.is_success:
            continue
        data = res.json()
        if not isinstance(data, list) or len(data) < 2:
            continue
        for raw in data[1:]:
            job = _normalize_job(raw)
            if not job or job["id"] in seen:
                continue
            if res is all_res and not _matches_query(job, query):
                continue
            seen.add(job["id"])
            jobs.append(job)
            if len(jobs) >= count:
                return jobs

    return jobs
