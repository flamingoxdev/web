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
  visa_status: string;
  work_authorization: string;
  require_sponsorship: string;
  willing_to_relocate: string;
  expected_graduation: string;
  start_date: string;
  salary_expectation: string;
  gender: string;
  ethnicity: string;
  veteran_status: string;
  disability_status: string;
}

export interface WorkExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string;
  url: string;
}

export interface Education {
  degree: string;
  school: string;
  year: string;
  gpa: string;
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
  visa_status: "",
  work_authorization: "",
  require_sponsorship: "",
  willing_to_relocate: "",
  expected_graduation: "",
  start_date: "",
  salary_expectation: "",
  gender: "",
  ethnicity: "",
  veteran_status: "",
  disability_status: "",
});

export const VISA_OPTIONS = [
  "U.S. Citizen",
  "Permanent Resident (Green Card)",
  "H-1B",
  "F-1 OPT",
  "F-1 CPT",
  "J-1",
  "TN Visa",
  "Other work visa",
  "Need sponsorship",
];

export const YES_NO = ["Yes", "No", "Prefer not to say"];
