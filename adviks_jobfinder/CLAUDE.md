# Project: AI Internship Intelligence Engine

## What this is
A web app where a user uploads their resume and gets a ranked list of
real internship matches fetched from Indeed, powered by local AI models.

## Your job
Build the entire Next.js frontend in the /frontend directory.
The backend API is already running at http://localhost:8000.

## API endpoints you must wire up

### POST /upload
- Input: multipart/form-data with field "file" (PDF)
- Response:
  {
    "resume_id": "abc123",
    "extracted_skills": ["python", "react", "sql"],
    "resume_text": "..."
  }

### POST /search
- Input: { "resume_id": "abc123", "location": "Remote", "limit": 20 }
- This triggers job scraping + embedding + ranking. Takes 30–60 seconds.
- Response: streaming JSON lines, one job per line:
  {
    "title": "Software Engineering Intern",
    "company": "Stripe",
    "location": "Remote",
    "match_score": 0.87,
    "matched_skills": ["python", "react"],
    "missing_skills": ["docker", "kubernetes"],
    "url": "https://...",
    "description_snippet": "..."
  }

### GET /status/{resume_id}
- Returns current processing status: "uploading" | "scraping" | "embedding" | "ranking" | "done"

## Pages to build

### Main page (/)
- Full-width layout, dark or light — your design call
- Step 1: Resume upload zone (drag and drop + click to browse, PDF only)
- After upload: show detected skills as pill badges
- Step 2: Location input (text field, default "Remote") + "Find Internships" button
- While processing: animated status bar showing current step
  (Uploading → Scraping Indeed → Embedding → Ranking → Done)
- Results: stream in one by one as they arrive

### Results section (same page, below fold)
- Left column (65%): ranked job cards
  - Each card: job title, company, location, match % progress bar,
    matched skills (green pills), missing skills (red pills),
    "View on Indeed" link, collapsible full description
- Right column (35%): sticky skill gap panel
  - Title: "Your skill gaps"
  - List of missing skills sorted by how many jobs require them
  - Each skill: name + count badge (e.g. "docker — 8 jobs")

## Design requirements
- Use Anthropic's frontend-design skill for component styling
- Tailwind CSS only — no component libraries
- Mobile responsive
- Show empty/loading/error states for every component
- No auth, no routing beyond the single page

## New feature — Remote toggle

Add a toggle switch next to the Location input with two options:
- "Local" — uses the location text field as-is
- "Remote" — ignores the location field and passes "Remote" to the API

When "Remote" is selected:
- Grey out the location text field
- Pass `"location": "Remote"` in the /search request body

When "Local" is selected:
- Enable the location text field
- Pass whatever the user typed as the location

Default to "Remote" selected.