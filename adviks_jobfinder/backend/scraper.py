# pyrefly: ignore [missing-import]
from jobspy import scrape_jobs
import pandas as pd

def fetch_jobs(skills: list[str], location: str = "Remote", limit: int = 20) -> list[dict]:
    # Use top skill as field detector instead of hardcoding "software engineering"
    top_skills = skills[:3] if skills else ["intern"]
    query = " ".join(top_skills) + " intern"
    print(f"Search query: {query} | Location: {location}")

    try:
        jobs = scrape_jobs(
            site_name=["indeed"],
            search_term=query,
            location=location,
            results_wanted=limit,
            hours_old=720,
            country_indeed="USA",
        )
        print(f"Jobs fetched: {len(jobs)}")
        print(f"Columns: {list(jobs.columns)}")
        print(jobs[['title', 'company', 'location']].head())
    except Exception as e:
        print(f"Scraping error: {e}")
        return []

    if jobs is None or len(jobs) == 0:
        print("No jobs returned from scraper")
        return []

    results = []
    for _, row in jobs.iterrows():
        try:
            desc = str(row.get("description") or "")
            if len(desc) < 50:
                continue
            results.append({
                "title": str(row.get("title") or ""),
                "company": str(row.get("company") or ""),
                "location": str(row.get("location") or location),
                "description": desc[:2000],
                "url": str(row.get("job_url") or ""),
                "date_posted": str(row.get("date_posted") or ""),
            })
        except Exception as e:
            print(f"Row error: {e}")
            continue

    print(f"Jobs returned: {len(results)}")
    return results