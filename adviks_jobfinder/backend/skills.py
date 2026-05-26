# This file contains a predefined list of skills and a function to extract those skills from a given text.
SKILLS = [
    # Tech
    "python", "javascript", "typescript", "java", "c++", "sql", "react",
    "node.js", "fastapi", "django", "docker", "aws", "git", "machine learning",
    "data analysis", "pytorch", "tensorflow", "postgresql", "mongodb",

    # Medicine / Healthcare
    "clinical research", "patient care", "pharmacology", "anatomy", "biology",
    "chemistry", "biochemistry", "nursing", "ehr", "epic", "hipaa",
    "medical coding", "icd-10", "cpr", "phlebotomy", "radiology",

    # Finance / Business
    "financial modeling", "excel", "valuation", "accounting", "bloomberg",
    "cfa", "gaap", "quickbooks", "investment banking", "equity research",
    "financial analysis", "budgeting", "forecasting", "powerpoint",

    # Marketing
    "seo", "google analytics", "social media", "content marketing",
    "copywriting", "hubspot", "salesforce", "email marketing", "figma",
    "adobe photoshop", "canva", "brand strategy",

    # Law
    "legal research", "westlaw", "lexisnexis", "contract drafting",
    "litigation", "compliance", "paralegal", "corporate law",

    # Engineering (non-software)
    "autocad", "solidworks", "matlab", "circuit design", "thermodynamics",
    "mechanical engineering", "electrical engineering", "civil engineering",
    "cad", "finite element analysis",

    # General
    "communication", "leadership", "project management", "microsoft office",
    "data entry", "customer service", "research", "writing", "teamwork",
]

def extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    return sorted({s for s in SKILLS if s in text_lower})