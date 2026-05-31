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

  const validWork = workExperience.filter((w) => w.title.trim() || w.company.trim());
  if (validWork.length === 0) {
    errors.work = "Add at least one work experience entry";
  } else {
    for (const w of validWork) {
      if (!w.description.trim()) {
        errors.work = "Describe what you did in each role";
        break;
      }
    }
  }

  const validProjects = projects.filter((p) => p.name.trim());
  if (validProjects.length === 0) {
    errors.projects = "Add at least one project";
  } else {
    for (const p of validProjects) {
      if (!p.description.trim()) {
        errors.projects = "Add a description for each project";
        break;
      }
    }
  }

  return errors;
}

export interface OnboardingStatus {
  profile_complete: boolean;
  has_resume: boolean;
  has_template: boolean;
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
