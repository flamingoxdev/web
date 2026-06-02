"""Auto-apply pipeline — discover, rank, and submit applications."""

import json
from typing import Any

from jobs.adzuna import fetch_adzuna_jobs
from jobs.remoteok import fetch_remoteok_jobs
from jobs.deduplicator import deduplicate_jobs
from ai.job_matcher import rank_jobs
from apply.router import detect_apply_method, extract_greenhouse_token_and_job_id
from apply.email import email_apply_available, get_apply_capabilities, is_auto_apply_eligible
from apply.greenhouse import apply_via_greenhouse
from apply.email import apply_via_email
from resume.get_pdf import get_resume_pdf_base64
from package_generator import generate_cover_letter
from db import get_profile, save_application_record


def _parse_json_field(val: Any, default: Any):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return default
    return val if val is not None else default


def build_apply_profile(profile: dict, target_role: str = "") -> dict:
    """Normalize Supabase profile into apply-ready dict."""
    pi = _parse_json_field(profile.get("personal_info"), {})
    if not isinstance(pi, dict):
        pi = {}

    name = profile.get("full_name") or pi.get("full_name") or "Candidate"
    parts = name.strip().split()
    first = parts[0] if parts else "Candidate"
    last = " ".join(parts[1:]) if len(parts) > 1 else ""

    skills = _parse_json_field(profile.get("skills"), [])
    if not isinstance(skills, list):
        skills = []

    work = _parse_json_field(profile.get("work_experience"), [])
    years_exp = 0
    if isinstance(work, list) and work:
        years_exp = max(1, len(work))

    return {
        "name": name,
        "first_name": first,
        "last_name": last,
        "email": profile.get("email") or pi.get("email") or "",
        "phone": profile.get("phone") or pi.get("phone") or "",
        "linkedin": profile.get("linkedin") or pi.get("linkedin") or "",
        "github": profile.get("github") or pi.get("github") or "",
        "website": pi.get("website") or pi.get("portfolio") or "",
        "location": profile.get("location") or pi.get("location") or "",
        "skills": [str(s) for s in skills[:20]],
        "years_exp": years_exp,
        "target_role": target_role,
        "summary": pi.get("summary") or "",
        "salary_expectation": pi.get("salary_expectation") or "",
    }


async def discover_jobs(
    *,
    query: str,
    location: str = "USA",
    remote: bool = False,
    country: str = "us",
    count: int = 50,
) -> list[dict]:
    fetches = [
        fetch_adzuna_jobs(query=query, location=location, country=country, remote=remote, count=count),
        fetch_remoteok_jobs(query=query, count=min(count, 40)),
    ]

    import asyncio
    from apply.url_resolver import enrich_jobs_apply_info

    settled = await asyncio.gather(*fetches, return_exceptions=True)
    all_jobs: list[dict] = []
    for r in settled:
        if isinstance(r, list):
            all_jobs.extend(r)
        elif isinstance(r, Exception):
            print(f"[discover_jobs] source error: {r}")

    unique = deduplicate_jobs(all_jobs)
    # Resolve Adzuna wrapper URLs → detect Greenhouse/email (top batch only for speed)
    enriched = await enrich_jobs_apply_info(unique[:40])
    tail = unique[40:]
    for j in tail:
        j["apply_method"] = detect_apply_method(j.get("apply_url") or j.get("url") or "")
    return enriched + tail


async def apply_to_job(
    *,
    user_id: str,
    job: dict,
    user_profile: dict,
    resume_base64: str,
    profile_row: dict | None = None,
    min_score: int = 0,
) -> dict:
    """Apply to a single job. Returns result dict."""
    apply_url = job.get("apply_url") or job.get("url") or ""
    method = job.get("apply_method") or detect_apply_method(apply_url)
    if method == "unsupported" and (apply_url or job.get("description")):
        from apply.url_resolver import resolve_apply_url
        resolved = await resolve_apply_url(apply_url, job.get("description") or "")
        if resolved["apply_method"] != "unsupported":
            method = resolved["apply_method"]
            apply_url = resolved["apply_url"] or apply_url
    ai_score = job.get("ai_score") or job.get("aiScore") or 0

    if ai_score and ai_score < min_score:
        return {"status": "skipped", "reason": "below_min_score", "method": method}

    cover_letter = generate_cover_letter(
        profile_row or {"personal_info": user_profile, "skills": user_profile.get("skills"), "work_experience": []},
        job.get("title") or "",
        job.get("company") or "",
        job.get("description") or job.get("description_snippet") or "",
    )

    record_base = {
        "job_title": job.get("title"),
        "company": job.get("company"),
        "apply_url": apply_url,
        "ai_match_score": ai_score,
        "ai_reason": job.get("ai_reason") or job.get("aiReason"),
        "cover_letter": cover_letter,
        "job_source": job.get("source"),
    }

    try:
        if method == "greenhouse":
            tokens = extract_greenhouse_token_and_job_id(apply_url)
            if not tokens or not tokens.get("job_id"):
                raise RuntimeError("Could not parse Greenhouse URL — add to manual queue")
            result = await apply_via_greenhouse(
                board_token=tokens["board_token"],
                job_id=tokens["job_id"],
                user_profile=user_profile,
                resume_base64=resume_base64,
                cover_letter=cover_letter,
                job_meta=job,
            )
        elif method == "email":
            if not email_apply_available():
                save_application_record(user_id, {
                    **record_base,
                    "apply_method": "email",
                    "status": "skipped",
                    "fail_reason": "Email apply not configured — add SMTP_USER and SMTP_PASSWORD to .env",
                })
                return {
                    "status": "skipped",
                    "title": job.get("title"),
                    "company": job.get("company"),
                    "method": "email",
                    "reason": "email_not_configured",
                }
            to_email = apply_url.replace("mailto:", "").split("?")[0].strip()
            if not to_email:
                raise RuntimeError("Invalid mailto apply URL")
            result = await apply_via_email(
                to_email=to_email,
                job=job,
                user_profile=user_profile,
                resume_base64=resume_base64,
                cover_letter=cover_letter,
            )
        else:
            save_application_record(user_id, {
                **record_base,
                "apply_method": "unsupported",
                "status": "skipped",
            })
            return {
                "status": "skipped",
                "title": job.get("title"),
                "company": job.get("company"),
                "apply_url": apply_url,
                "score": ai_score,
                "method": "unsupported",
            }

        save_application_record(user_id, {
            **record_base,
            "apply_method": method,
            "status": "applied",
        })
        return {
            "status": "applied",
            "title": job.get("title"),
            "company": job.get("company"),
            "method": method,
            "score": ai_score,
            "reason": job.get("ai_reason"),
            **result,
        }

    except Exception as e:
        save_application_record(user_id, {
            **record_base,
            "apply_method": method,
            "status": "failed",
            "fail_reason": str(e)[:500],
        })
        return {
            "status": "failed",
            "title": job.get("title"),
            "company": job.get("company"),
            "error": str(e),
            "score": ai_score,
        }


async def run_auto_apply(
    *,
    user_id: str,
    query: str,
    location: str = "USA",
    remote: bool = False,
    target_count: int = 20,
    min_score: int = 6,
    resume_id: str | None = None,
) -> dict:
    """Discover jobs, AI-rank, and auto-apply to top matches."""
    profile_row = get_profile(user_id)
    if not profile_row:
        raise RuntimeError("Complete your profile before auto-applying")

    user_profile = build_apply_profile(profile_row, target_role=query)
    if not user_profile.get("email"):
        raise RuntimeError("Add your email to your profile before applying")

    resume_base64, _ = await get_resume_pdf_base64(user_id, resume_id)

    all_jobs = await discover_jobs(query=query, location=location, remote=remote)
    if not all_jobs:
        return {
            "summary": {"applied": 0, "failed": 0, "skipped": 0, "total_found": 0},
            "applied": [],
            "failed": [],
            "skipped": [],
        }

    for job in all_jobs:
        job["apply_method"] = job.get("apply_method") or detect_apply_method(job.get("apply_url") or job.get("url"))

    rankings = await rank_jobs(user_profile, all_jobs[:50])
    score_map = {r.get("id"): r for r in rankings if r.get("id")}

    top_jobs: list[dict] = []
    for job in all_jobs[:50]:
        rank = score_map.get(job.get("id"), {})
        score = rank.get("score", 5)
        method = job.get("apply_method") or detect_apply_method(job.get("apply_url") or job.get("url") or "")
        if score >= min_score and is_auto_apply_eligible(method):
            top_jobs.append({
                **job,
                "apply_method": method,
                "ai_score": score,
                "ai_reason": rank.get("reason", ""),
            })

    top_jobs.sort(key=lambda j: j.get("ai_score", 0), reverse=True)
    if target_count > 0:
        top_jobs = top_jobs[:target_count]

    results = {"applied": [], "failed": [], "skipped": []}

    for job in top_jobs:
        outcome = await apply_to_job(
            user_id=user_id,
            job=job,
            user_profile=user_profile,
            resume_base64=resume_base64,
            profile_row=profile_row,
            min_score=min_score,
        )
        bucket = outcome.get("status", "failed")
        if bucket in results:
            results[bucket].append(outcome)
        else:
            results["failed"].append(outcome)

    return {
        "summary": {
            "applied": len(results["applied"]),
            "failed": len(results["failed"]),
            "skipped": len(results["skipped"]),
            "total_found": len(all_jobs),
            "ranked_eligible": len(top_jobs),
            "auto_apply_pool": len([j for j in all_jobs if is_auto_apply_eligible(j.get("apply_method"))]),
        },
        **results,
    }


async def search_and_rank_jobs(
    *,
    user_id: str,
    query: str,
    location: str = "USA",
    remote: bool = False,
    country: str = "us",
) -> list[dict]:
    """Discover jobs and attach AI scores for the UI."""
    profile_row = get_profile(user_id) or {}
    user_profile = build_apply_profile(profile_row, target_role=query)

    jobs = await discover_jobs(query=query, location=location, remote=remote, country=country)
    if not jobs:
        return []

    rankings = await rank_jobs(user_profile, jobs[:50])
    score_map = {r.get("id"): r for r in rankings if r.get("id")}

    enriched = []
    for job in jobs:
        rank = score_map.get(job.get("id"), {})
        score = rank.get("score", 5)
        apply_url = job.get("apply_url") or job.get("url") or ""
        method = job.get("apply_method") or detect_apply_method(apply_url)
        enriched.append({
            **job,
            "match_score": score / 10.0,
            "ai_score": score,
            "ai_reason": rank.get("reason", ""),
            "apply_method": method,
            "auto_apply_eligible": is_auto_apply_eligible(method),
            "matched_skills": [],
            "missing_skills": [],
            "url": apply_url,
        })
    enriched.sort(key=lambda j: j.get("ai_score", 0), reverse=True)
    return enriched
