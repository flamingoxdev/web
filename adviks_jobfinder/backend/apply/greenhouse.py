"""Greenhouse ATS public API apply."""

import base64
import httpx

from ai.answer_question import answer_custom_question


async def apply_via_greenhouse(
    *,
    board_token: str,
    job_id: str,
    user_profile: dict,
    resume_base64: str,
    cover_letter: str,
    job_meta: dict | None = None,
) -> dict:
    base = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}"

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        job_res = await client.get(f"{base}?questions=true")
        if not job_res.is_success:
            raise RuntimeError(f"Greenhouse job fetch failed: {job_res.status_code}")
        job_data = job_res.json()

        form: dict[str, str] = {
            "first_name": user_profile.get("first_name") or "Candidate",
            "last_name": user_profile.get("last_name") or "",
            "email": user_profile.get("email") or "",
            "phone": user_profile.get("phone") or "",
            "resume_content": resume_base64,
            "resume_content_filename": (
                f"{user_profile.get('first_name', 'Resume')}_{user_profile.get('last_name', '')}_Resume.pdf"
            ).replace(" ", "_"),
        }

        if cover_letter:
            form["cover_letter_content"] = base64.b64encode(cover_letter.encode("utf-8")).decode("ascii")
            form["cover_letter_content_filename"] = "cover_letter.txt"

        if user_profile.get("linkedin"):
            form["linkedin_profile"] = user_profile["linkedin"]
        if user_profile.get("website"):
            form["website"] = user_profile["website"]

        skip_fields = {
            "first_name", "last_name", "email", "phone",
            "resume", "cover_letter", "resume_content", "cover_letter_content",
        }
        for question in job_data.get("questions") or []:
            fields = question.get("fields") or []
            if not fields:
                continue
            field_name = fields[0].get("name")
            if not field_name or field_name in skip_fields:
                continue
            label = question.get("label") or field_name
            answer = await answer_custom_question(label, user_profile, job_meta or job_data)
            form[field_name] = answer

        apply_res = await client.post(base, data=form)

    if not apply_res.is_success:
        raise RuntimeError(f"Greenhouse apply failed ({apply_res.status_code}): {apply_res.text[:300]}")

    return {"success": True, "method": "greenhouse", "board_token": board_token, "job_id": job_id}
