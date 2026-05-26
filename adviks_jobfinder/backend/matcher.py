import numpy as np
import pandas as pd
from skills import extract_skills
from embedder import embed, build_index, search, DIM

def rank_jobs(resume_text: str, jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []

    resume_vec = embed(resume_text)

    # If resume embedding failed, return jobs unranked
    if resume_vec.shape[0] != DIM or np.all(resume_vec == 0):
        print("Resume embedding failed, returning unranked jobs")
        for job in jobs:
            job["match_score"] = 0.0
            job["matched_skills"] = []
            job["missing_skills"] = []
            job["description_snippet"] = job["description"][:300] + "..."
        return jobs

    resume_skills = set(extract_skills(resume_text))

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