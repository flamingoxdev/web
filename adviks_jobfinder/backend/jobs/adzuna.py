"""Adzuna job search API."""

import os
import httpx

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "")
ADZUNA_API_KEY = os.getenv("ADZUNA_API_KEY", "")


async def fetch_adzuna_jobs(
    *,
    query: str,
    location: str = "USA",
    country: str = "us",
    remote: bool = False,
    count: int = 50,
) -> list[dict]:
    if not ADZUNA_APP_ID or not ADZUNA_API_KEY:
        return []

    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_API_KEY,
        "results_per_page": min(count, 50),
        "what": query,
        "where": location,
        "content-type": "application/json",
    }
    if remote:
        params["what_and"] = "remote"

    url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(url, params=params)
        if not res.is_success:
            print(f"[adzuna] HTTP {res.status_code}: {res.text[:200]}")
            return []
        data = res.json()

    jobs = []
    for job in data.get("results") or []:
        desc = job.get("description") or ""
        jobs.append({
            "id": f"adzuna_{job.get('id')}",
            "source": "adzuna",
            "title": job.get("title") or "",
            "company": (job.get("company") or {}).get("display_name") or "Unknown",
            "location": (job.get("location") or {}).get("display_name") or "",
            "description": desc,
            "description_snippet": desc[:280],
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "apply_url": job.get("redirect_url") or "",
            "url": job.get("redirect_url") or "",
            "posted_at": job.get("created"),
            "is_remote": remote or "remote" in desc.lower(),
        })
    return jobs
