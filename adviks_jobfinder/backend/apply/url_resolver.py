"""Resolve apply URLs and detect Greenhouse / email from redirects + page content."""

import re
import asyncio
from urllib.parse import urljoin, urlparse

import httpx

from apply.router import detect_apply_method, extract_greenhouse_token_and_job_id

GREENHOUSE_IN_TEXT = re.compile(
    r"(?:https?://)?(?:boards\.)?greenhouse\.io/([a-zA-Z0-9_-]+)/jobs/(\d+)",
    re.I,
)
LEVER_IN_TEXT = re.compile(r"(?:https?://)?(?:jobs\.)?lever\.co/([a-zA-Z0-9_-]+)", re.I)
MAILTO_IN_TEXT = re.compile(r"mailto:([^\s\"'<>]+)", re.I)


def detect_from_text(text: str) -> tuple[str | None, str]:
    """Scan job description / HTML for embedded apply links."""
    if not text:
        return None, "unsupported"
    m = GREENHOUSE_IN_TEXT.search(text)
    if m:
        url = f"https://boards.greenhouse.io/{m.group(1)}/jobs/{m.group(2)}"
        return url, "greenhouse"
    m = LEVER_IN_TEXT.search(text)
    if m:
        return f"https://jobs.lever.co/{m.group(1)}", "lever"
    m = MAILTO_IN_TEXT.search(text)
    if m:
        return f"mailto:{m.group(1)}", "email"
    return None, "unsupported"


async def resolve_apply_url(apply_url: str, description: str = "") -> dict:
    """
    Follow redirects and inspect content to find real apply method.
    Returns { apply_url, apply_method, greenhouse_tokens? }
    """
    if not apply_url and description:
        found, method = detect_from_text(description)
        if found:
            tokens = extract_greenhouse_token_and_job_id(found) if method == "greenhouse" else None
            return {"apply_url": found, "apply_method": method, "greenhouse": tokens}

    if not apply_url:
        return {"apply_url": "", "apply_method": "unsupported", "greenhouse": None}

    # Direct detection on raw URL
    method = detect_apply_method(apply_url)
    if method != "unsupported":
        tokens = extract_greenhouse_token_and_job_id(apply_url) if method == "greenhouse" else None
        return {"apply_url": apply_url, "apply_method": method, "greenhouse": tokens}

    # Description may embed greenhouse while Adzuna link is a wrapper
    found, desc_method = detect_from_text(description)
    if found and desc_method != "unsupported":
        tokens = extract_greenhouse_token_and_job_id(found) if desc_method == "greenhouse" else None
        return {"apply_url": found, "apply_method": desc_method, "greenhouse": tokens}

    # Follow redirect chain (Adzuna land pages → employer ATS)
    final_url = apply_url
    html_snippet = ""
    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "Flamingo-AI/1.0 JobBot"},
        ) as client:
            res = await client.get(apply_url)
            final_url = str(res.url)
            if res.headers.get("content-type", "").startswith("text"):
                html_snippet = res.text[:12000]
    except Exception as e:
        print(f"[url_resolver] redirect failed for {apply_url[:80]}: {e}")

    method = detect_apply_method(final_url)
    if method == "unsupported":
        found, text_method = detect_from_text(html_snippet)
        if found and text_method != "unsupported":
            final_url = found
            method = text_method

    if method == "unsupported":
        found, desc_method = detect_from_text(html_snippet or description)
        if found:
            final_url = found
            method = desc_method

    tokens = extract_greenhouse_token_and_job_id(final_url) if method == "greenhouse" else None
    return {"apply_url": final_url, "apply_method": method, "greenhouse": tokens}


async def enrich_jobs_apply_info(jobs: list[dict], *, max_concurrent: int = 8) -> list[dict]:
    """Enrich a list of jobs with resolved apply_method (parallel, capped)."""
    sem = asyncio.Semaphore(max_concurrent)

    async def _one(job: dict) -> dict:
        async with sem:
            raw = job.get("apply_url") or job.get("url") or ""
            info = await resolve_apply_url(raw, job.get("description") or "")
            out = {**job}
            if info["apply_url"]:
                out["apply_url"] = info["apply_url"]
                out["url"] = info["apply_url"]
            out["apply_method"] = info["apply_method"]
            if info.get("greenhouse"):
                out["greenhouse"] = info["greenhouse"]
            return out

    return list(await asyncio.gather(*[_one(j) for j in jobs]))
