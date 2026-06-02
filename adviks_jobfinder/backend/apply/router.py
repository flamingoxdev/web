"""Detect apply method from job URL."""

import re


def detect_apply_method(apply_url: str | None) -> str:
    if not apply_url:
        return "unsupported"
    url = apply_url.lower()
    if re.search(r"boards\.greenhouse\.io|grnh\.se|greenhouse\.io/[^/]+/jobs|gh_jid=", url):
        return "greenhouse"
    if re.search(r"jobs\.lever\.co|lever\.co/(?!api)", url):
        return "lever"
    if url.startswith("mailto:"):
        return "email"
    return "unsupported"


def extract_greenhouse_token_and_job_id(apply_url: str) -> dict | None:
    """Parse Greenhouse board token + job id from apply URL."""
    if not apply_url:
        return None

    m = re.search(r"boards\.greenhouse\.io/([^/?#]+)/jobs/(\d+)", apply_url, re.I)
    if m:
        return {"board_token": m.group(1), "job_id": m.group(2)}

    m = re.search(r"greenhouse\.io/([^/?#]+)/jobs/(\d+)", apply_url, re.I)
    if m:
        return {"board_token": m.group(1), "job_id": m.group(2)}

    m = re.search(r"grnh\.se/([^/?#]+)", apply_url, re.I)
    if m:
        return {"board_token": m.group(1), "job_id": None, "needs_redirect": True}

    return None
