"""
Job scraper using python-jobspy.

Defaults to Indeed only because LinkedIn / ZipRecruiter / Glassdoor frequently
return 403 / require auth. Users can opt into more sites via JOB_SITES env var.
"""

# pyrefly: ignore [missing-import]
from jobspy import scrape_jobs
import os
import logging

log = logging.getLogger("scraper")
logging.basicConfig(level=logging.INFO)

# Indeed is the most reliable scrape target. Add more via JOB_SITES env var,
# but expect failures on linkedin/glassdoor/zip_recruiter most of the time.
DEFAULT_JOB_SITES = os.getenv("JOB_SITES", "indeed")

# Role keywords inferred from top skills. Helps broaden a too-narrow query.
ROLE_KEYWORDS = {
    "python": "python developer",
    "django": "python developer",
    "flask": "python developer",
    "fastapi": "python developer",
    "react": "frontend developer",
    "next.js": "frontend developer",
    "javascript": "software engineer",
    "typescript": "software engineer",
    "node.js": "backend developer",
    "node": "backend developer",
    "java": "java developer",
    "c++": "software engineer",
    "c#": "software engineer",
    "go": "backend developer",
    "rust": "software engineer",
    "sql": "data analyst",
    "data": "data analyst",
    "ml": "machine learning engineer",
    "ai": "machine learning engineer",
    "android": "android developer",
    "ios": "ios developer",
    "swift": "ios developer",
    "kotlin": "android developer",
    "devops": "devops engineer",
    "docker": "devops engineer",
    "kubernetes": "devops engineer",
    "aws": "cloud engineer",
}


def _build_query(skills: list[str], job_type: str) -> str:
    """Pick a sensible role keyword instead of stacking every skill verbatim."""
    role = ""
    for s in skills[:5]:
        key = s.lower().strip()
        if key in ROLE_KEYWORDS:
            role = ROLE_KEYWORDS[key]
            break
    if not role and skills:
        role = f"{skills[0].lower()} developer"
    if not role:
        role = "software engineer"

    suffix = ""
    if job_type == "intern":
        suffix = " intern"
    return (role + suffix).strip()


def fetch_jobs(
    skills: list[str],
    location: str = "Remote",
    limit: int = 20,
    job_type: str = "any",
) -> tuple[list[dict], dict]:
    """Returns (jobs, meta). meta includes 'sites_tried', 'errors', 'query'."""
    query = _build_query(skills, job_type)
    site_names = [s.strip() for s in DEFAULT_JOB_SITES.split(",") if s.strip()]
    meta = {"query": query, "sites_tried": site_names, "errors": []}
    log.info("Search query='%s' location='%s' sites=%s", query, location, site_names)

    is_remote = location.strip().lower() in ("remote", "anywhere", "")

    try:
        jobs = scrape_jobs(
            site_name=site_names,
            search_term=query,
            location=location if not is_remote else "USA",
            is_remote=is_remote,
            results_wanted=max(limit, 10),
            hours_old=720,
            country_indeed="USA",
            job_type="internship" if job_type == "intern" else None,
        )
    except Exception as e:
        meta["errors"].append(f"{type(e).__name__}: {e}")
        log.exception("Scraper exception")
        return [], meta

    if jobs is None or len(jobs) == 0:
        meta["errors"].append("Scraper returned no rows — try a different location or fewer filters.")
        return [], meta

    results: list[dict] = []
    seen: set[str] = set()
    for _, row in jobs.iterrows():
        try:
            desc = str(row.get("description") or "")
            if len(desc) < 50:
                continue
            url = str(row.get("job_url") or "")
            title = str(row.get("title") or "")
            company = str(row.get("company") or "")
            key = (url or f"{title}|{company}").lower()
            if key in seen:
                continue
            seen.add(key)
            results.append({
                "title": title,
                "company": company,
                "location": str(row.get("location") or location),
                "description": desc[:2000],
                "url": url,
                "date_posted": str(row.get("date_posted") or ""),
                "source": str(row.get("site") or "indeed"),
            })
        except Exception as e:
            meta["errors"].append(f"row parse: {e}")
            continue

    meta["returned"] = len(results)
    log.info("Returned %d jobs after dedupe (from %d raw)", len(results), len(jobs))
    return results, meta
