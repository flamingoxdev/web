export interface PersonalInfo {
  full_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio_url: string;
  resume_template?: string;
}

export interface WorkExperience {
  title: string;
  company: string;
  location: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string;
  url: string;
  start_date: string;
  end_date: string;
}

export interface Education {
  degree: string;
  school: string;
  location: string;
  year: string;
  gpa: string;
  honors: string;
  distinction: string;
}

export const emptyPersonal = (): PersonalInfo => ({
  full_name: "",
  preferred_name: "",
  email: "",
  phone: "",
  street_address: "",
  city: "",
  state: "",
  zip_code: "",
  country: "United States",
  location: "",
  linkedin: "",
  github: "",
  portfolio_url: "",
  resume_template: "jakes_resume",
});

/** Sort entries most-recent first using date/year fields. */
export function sortByRecency<T extends Record<string, string>>(
  items: T[],
  keys: (keyof T)[] = ["end_date", "start_date", "year"] as (keyof T)[]
): T[] {
  const score = (item: T) => {
    for (const k of keys) {
      const val = String(item[k] || "").toLowerCase();
      if (val.includes("present") || val.includes("current")) return 9999;
      const years = val.match(/(?:20|19)\d{2}/g);
      if (years?.length) return parseInt(years[years.length - 1], 10);
    }
    return 0;
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

export function isBlankWork(w: WorkExperience) {
  return !w.title.trim() && !w.company.trim();
}

export function isBlankProject(p: Project) {
  return !p.name.trim();
}

export function isBlankEducation(e: Education) {
  return !e.degree.trim() && !e.school.trim();
}
