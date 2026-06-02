
raw
Readme · MD
# 🦩 Flamingo AI
 
**One-click, apply to 20 jobs automatically — powered by AI.**
 
Flamingo is an AI-powered job application platform that finds relevant jobs, scores them against your profile, writes tailored cover letters, and submits applications — all in a single click. No browser automation. No bots. No getting blocked.
 
> Built on top of Flamingo's existing AI resume builder.
  
---
 
## ✨ Features
 
- **AI Resume Builder** — Generate tailored, ATS-optimized resumes from your profile
- **Smart Job Search** — Pulls listings from Adzuna API + RemoteOK (no key needed)
- **AI Job Matching** — Scores every job 1–10 against your skills and experience
- **Auto Apply** — Submits applications directly via Greenhouse ATS API and email
- **AI Cover Letters** — Unique, role-specific cover letter generated per application
- **Custom Question AI** — Answers Greenhouse application questions automatically
- **Resume Attachment** — Your PDF resume is attached to every application automatically
- **Application Dashboard** — Track every application: status, company, method, AI score
- **Manual Queue** — Jobs that need human apply are curated and ranked for you
---
 
## 🏗️ Tech Stack
 
| Layer | Technology |
|---|---|
| Frontend | Next.js / React |
| Job Search | [Adzuna API](https://developer.adzuna.com/) + [RemoteOK API](https://remoteok.com/api) |
| Auto Apply | [Greenhouse ATS Public API](https://developers.greenhouse.io/job-board.html) |
| Email Apply | [Resend](https://resend.com) |
| AI (Matching + Cover Letters) | [NVIDIA NIM API](https://build.nvidia.com) — Llama 3.1 70B |
| Database | MongoDB / Supabase (your choice) |
| Hosting | [Render](https://render.com) |
 
---
 
## 🚀 How It Works
 
```
Your Profile + Resume
        ↓
Search Jobs (Adzuna + RemoteOK)
        ↓
AI Scores Each Job (1–10 fit score)
        ↓
Filter: Only apply to score 6+
        ↓
Generate Cover Letter per Job (NVIDIA Llama)
        ↓
Auto-Submit via Greenhouse API or Email
        ↓
Track Everything in Your Dashboard
```
 
---
 
## 📦 Getting Started
 
### Prerequisites
 
- Node.js 18+
- npm or yarn
- MongoDB or Supabase instance
### 1. Clone the repo
 
```bash
git clone https://github.com/yourusername/flamingo-ai.git
cd flamingo-ai
npm install
```
 
### 2. Set up environment variables
 
Create a `.env.local` file in the root:
 
```bash
# Job Search
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_API_KEY=your_adzuna_api_key
# RemoteOK requires no API key
 
# AI — NVIDIA NIM (free at build.nvidia.com)
NVIDIA_API_KEY=your_nvidia_key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
 
# Email Applications
RESEND_API_KEY=your_resend_key
EMAIL_FROM=applications@yourdomain.com
 
# Database
DATABASE_URL=your_db_connection_string
 
# App
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=http://localhost:3000
```
 
### 3. Run locally
 
```bash
npm run dev
```
 
Open [http://localhost:3000](http://localhost:3000).
 
---
 
## 🔑 API Keys & Free Tiers
 
| Service | Free Tier | Sign Up |
|---|---|---|
| Adzuna | 1,000 calls/month | [developer.adzuna.com](https://developer.adzuna.com) |
| RemoteOK | Unlimited | No key needed |
| Greenhouse Apply | Free (public endpoint) | No key needed |
| NVIDIA NIM | 40 req/min — Llama 3.1 70B | [build.nvidia.com](https://build.nvidia.com) |
| Resend | 3,000 emails/month | [resend.com](https://resend.com) |
 
**Total cost to run: $0/month** on free tiers for most users.
 
---
 
## 📁 Project Structure
 
```
/lib
  /jobs
    adzuna.js          ← Adzuna job search
    remoteok.js        ← RemoteOK job search
    deduplicator.js    ← Merge & deduplicate results
  /apply
    router.js          ← Detects apply method from URL
    greenhouse.js      ← Greenhouse ATS API submit
    email.js           ← Resend email apply
  /ai
    matcher.js         ← NVIDIA: rank jobs by fit
    coverLetter.js     ← NVIDIA: generate cover letter
    answerQuestion.js  ← NVIDIA: answer custom ATS questions
  /resume
    getPdf.js          ← Fetch user's resume as base64 PDF
/api
  /jobs
    search.js          ← GET /api/jobs/search
  /apply
    auto.js            ← POST /api/apply/auto (bulk apply)
    single.js          ← POST /api/apply/single
/db
  applications.js      ← Application tracking DB queries
```
 
---
 
## 🤖 Why No Playwright / Browser Automation?
 
Job boards (LinkedIn, Indeed, Greenhouse) actively block headless browsers using Cloudflare, reCAPTCHA, canvas fingerprinting, and timing analysis. Browser automation:
 
- Breaks on every site deploy
- Gets your IP banned
- Violates Terms of Service
- Wastes hours of debugging
**Flamingo's approach:** Use what job boards actually built for programmatic access.
 
- **Greenhouse** has a fully documented public API to submit applications — used by Stripe, Figma, Airbnb, and thousands more
- **Email apply** (via Resend) works for any `mailto:` application link — literally cannot be blocked
- **Together they cover ~50% of tech job postings** with zero browser involvement
---
 
## 📊 Apply Coverage
 
| Method | Coverage | How |
|---|---|---|
| Greenhouse API | ~35% of tech jobs | Direct POST to public API |
| Email Apply | ~15% of postings | Via Resend, PDF attached |
| Manual Queue | ~50% | AI-ranked list with direct links |
 
Jobs that can't be auto-applied (Indeed, LinkedIn, Workday) are surfaced in a ranked **Manual Queue** — so even those are easier and faster.
 
---
 
## 🗺️ Roadmap
 
- [x] AI Resume Builder
- [x] Adzuna + RemoteOK job search
- [x] AI job matching (NVIDIA Llama)
- [ ] Greenhouse auto-apply
- [ ] Email auto-apply (Resend)
- [ ] AI cover letter generation
- [ ] Application tracking dashboard
- [ ] Manual apply queue with ranked listings
- [ ] Workday ATS support
- [ ] Lever ATS support
- [ ] Job alerts + scheduled auto-apply
---
 
## 🤝 Contributing
 
Pull requests welcome. For major changes, open an issue first to discuss what you'd like to change.
 
1. Fork the repo
2. Create your feature branch: `git checkout -b feature/workday-support`
3. Commit your changes: `git commit -m 'Add Workday apply support'`
4. Push to the branch: `git push origin feature/workday-support`
5. Open a pull request
---
