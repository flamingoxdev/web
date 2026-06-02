"""LLM job matching — score jobs 1-10 for candidate fit."""

import json

from llm import chat, extract_json


async def rank_jobs(user_profile: dict, jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []

    summaries = [
        {
            "id": j.get("id"),
            "title": j.get("title"),
            "company": j.get("company"),
            "description": (j.get("description") or "")[:400],
        }
        for j in jobs
    ]

    prompt = f"""You are a job matching expert. Score each job 1-10 for fit.
Return ONLY a valid JSON array. No markdown.

Candidate:
- Name: {user_profile.get('name', '')}
- Skills: {', '.join(user_profile.get('skills') or [])}
- Years experience: {user_profile.get('years_exp', 0)}
- Target role: {user_profile.get('target_role', '')}
- Location: {user_profile.get('location', '')}

Jobs:
{json.dumps(summaries)}

Return format:
[{{"id":"job_id","score":8,"reason":"Short reason under 15 words"}}]"""

    try:
        raw = await __import__("asyncio").to_thread(chat, prompt, json_mode=True, timeout=90)
        data = extract_json(raw)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "rankings" in data:
            return data["rankings"]
    except Exception as e:
        print(f"[job_matcher] rank failed: {e}")

    return [{"id": j.get("id"), "score": 5, "reason": "Default score"} for j in jobs]
