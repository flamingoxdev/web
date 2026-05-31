import numpy as np
import pandas as pd
import os
from skills import extract_skills
from embedder import embed, build_index, search, DIM

def rank_jobs(resume_text: str, jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []

    resume_skills = set(extract_skills(resume_text))

    # Fast mode (default): avoid per-job embedding calls so search stays snappy
    # without depending on local Ollama responsiveness.
    use_ollama_embeddings = os.getenv("USE_OLLAMA_EMBEDDINGS", "false").lower() in ("1", "true", "yes")
    if not use_ollama_embeddings:
        results = []
        for job in jobs:
            job_skills = set(extract_skills(job["description"]))
            matched = sorted(resume_skills & job_skills)
            missing = sorted(job_skills - resume_skills)
            overlap = len(matched) / len(job_skills) if job_skills else 0
            title = str(job.get("title", "")).lower()
            # Slight boost for internship-intent queries
            title_boost = 0.05 if "intern" in title or "internship" in title else 0.0
            results.append({
                **job,
                "match_score": round(min(1.0, overlap + title_boost), 3),
                "matched_skills": matched,
                "missing_skills": missing,
                "description_snippet": job["description"][:300] + "...",
            })
        return sorted(results, key=lambda x: -x["match_score"])

    resume_vec = embed(resume_text)

    # Fallback: rank purely by skill overlap when embedding is unavailable.
    if resume_vec.shape[0] != DIM or np.all(resume_vec == 0):
        print("Embedding unavailable — ranking by skill overlap only.")
        results = []
        for job in jobs:
            job_skills = set(extract_skills(job["description"]))
            matched = sorted(resume_skills & job_skills)
            missing = sorted(job_skills - resume_skills)
            overlap = len(matched) / len(job_skills) if job_skills else 0
            results.append({
                **job,
                "match_score": round(overlap, 3),
                "matched_skills": matched,
                "missing_skills": missing,
                "description_snippet": job["description"][:300] + "...",
            })
        return sorted(results, key=lambda x: -x["match_score"])

    job_vecs = []
    for job in jobs:
        vec = embed(job["description"])
        job_vecs.append(vec)

    index = build_index(job_vecs)
    indices, scores = search(index, resume_vec, k=len(jobs))

    results = []
    for idx, score in zip(indices, scores):
        if idx == -1:
            continue
        job = jobs[idx]
        job_skills = set(extract_skills(job["description"]))
        matched = sorted(resume_skills & job_skills)
        missing = sorted(job_skills - resume_skills)
        overlap = len(matched) / len(job_skills) if job_skills else 0
        final_score = round(0.6 * float(score) + 0.4 * overlap, 3)
        results.append({
            **job,
            "match_score": final_score,
            "matched_skills": matched,
            "missing_skills": missing,
            "description_snippet": job["description"][:300] + "...",
        })

    return sorted(results, key=lambda x: -x["match_score"])