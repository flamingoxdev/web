"""Answer Greenhouse custom application questions."""

from llm import chat


async def answer_custom_question(question: str, user_profile: dict, job: dict) -> str:
    q = (question or "").strip()
    if not q:
        return ""

    if q.lower().startswith("how many years"):
        return str(user_profile.get("years_exp") or 0)
    if "authorized" in q.lower() and "work" in q.lower():
        return "Yes"
    if "sponsorship" in q.lower():
        return "No"
    if "salary" in q.lower() and "expect" in q.lower():
        return user_profile.get("salary_expectation") or ""

    prompt = f"""Answer this job application question. Be concise (under 100 words), specific, professional.
No preamble — answer only.

Candidate: skills: {', '.join(user_profile.get('skills') or [])}, {user_profile.get('years_exp', 0)} years experience
Job: {job.get('title', job.get('name', ''))} at {job.get('company', '')}
Question: "{q}" """

    try:
        return await __import__("asyncio").to_thread(chat, prompt, json_mode=False, timeout=45)
    except Exception as e:
        print(f"[answer_question] failed: {e}")
        return user_profile.get("summary") or "Please see my resume for details."
