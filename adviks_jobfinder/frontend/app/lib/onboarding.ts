import type { PersonalInfo, WorkExperience, Project, Education } from "./profileTypes";

const REQUIRED_PERSONAL: (keyof PersonalInfo)[] = [
  "full_name",
  "email",
  "phone",
  "street_address",
  "city",
  "state",
  "zip_code",
  "country",
  "visa_status",
  "work_authorization",
  "require_sponsorship",
  "expected_graduation",
  "start_date",
];

export function validateProfile(
  personal: PersonalInfo,
  skills: string[],
  workExperience: WorkExperience[],
  projects: Project[]
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const key of REQUIRED_PERSONAL) {
    if (!personal[key]?.trim()) {
      errors[key] = "Required for job applications";
    }
  }

  if (skills.length === 0) errors.skills = "Add at least one skill";
  if (!workExperience.some((w) => w.title.trim() || w.company.trim())) {
    errors.work = "Add at least one work experience entry";
  }
  if (!projects.some((p) => p.name.trim())) {
    errors.projects = "Add at least one project";
  }

  return errors;
}

export interface OnboardingStatus {
  profile_complete: boolean;
  has_resume: boolean;
  ready: boolean;
  missing_fields: string[];
  resume_id: string | null;
}

export async function fetchOnboardingStatus(token: string, apiUrl: string): Promise<OnboardingStatus | null> {
  try {
    const res = await fetch(`${apiUrl}/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
