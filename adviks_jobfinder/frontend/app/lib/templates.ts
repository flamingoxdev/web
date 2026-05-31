/** Preview layout + colors aligned with ALLtemplates / PDF output. */
export type PreviewLayout =
  | "jake"
  | "bold_header"
  | "executive_timeline"
  | "sidebar"
  | "startup"
  | "elegant"
  | "corporate"
  | "creative"
  | "academic";

export interface TemplateTheme {
  accent: string;
  accent2: string;
  header: "left" | "center";
  font: string;
  layout: PreviewLayout;
  banner?: string;
  sidebar?: string;
  textMuted?: string;
}

export const TEMPLATE_THEMES: Record<string, TemplateTheme> = {
  jakes_resume: {
    accent: "#2a1523",
    accent2: "#2a1523",
    header: "center",
    font: "'Times New Roman', Georgia, serif",
    layout: "jake",
  },
  classic_jake: {
    accent: "#1a1a2e",
    accent2: "#1a1a2e",
    header: "center",
    font: "'Times New Roman', Georgia, serif",
    layout: "jake",
  },
  executive_timeline: {
    accent: "#0D2137",
    accent2: "#B8962E",
    header: "left",
    font: "'Georgia', serif",
    layout: "executive_timeline",
    textMuted: "#4A4A4A",
  },
  bold_header: {
    accent: "#1ABC9C",
    accent2: "#E67E22",
    header: "center",
    font: "'Helvetica Neue', Arial, sans-serif",
    layout: "bold_header",
    banner: "#212F3C",
    sidebar: "#EBF5FB",
  },
  minimalist_elegant: {
    accent: "#1B2540",
    accent2: "#C9A84C",
    header: "center",
    font: "'Georgia', serif",
    layout: "elegant",
  },
  pure_white: {
    accent: "#111111",
    accent2: "#888888",
    header: "center",
    font: "'Arial', sans-serif",
    layout: "jake",
  },
  two_column_sidebar: {
    accent: "#E94560",
    accent2: "#1A1A2E",
    header: "left",
    font: "'Arial', sans-serif",
    layout: "sidebar",
    sidebar: "#1A1A2E",
  },
  corporate_banking: {
    accent: "#003366",
    accent2: "#444444",
    header: "center",
    font: "'Times New Roman', serif",
    layout: "corporate",
  },
  startup: {
    accent: "#00B894",
    accent2: "#2D3436",
    header: "left",
    font: "'Inter', system-ui, sans-serif",
    layout: "startup",
    textMuted: "#636E72",
  },
  creative: {
    accent: "#E17055",
    accent2: "#6C5CE7",
    header: "left",
    font: "'Helvetica Neue', sans-serif",
    layout: "creative",
    sidebar: "#2D3436",
  },
  academic_research: {
    accent: "#003F88",
    accent2: "#555555",
    header: "left",
    font: "'Times New Roman', serif",
    layout: "academic",
    textMuted: "#555555",
  },
};

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  available?: boolean;
}

export function themeForTemplate(id: string): TemplateTheme {
  return TEMPLATE_THEMES[id] || TEMPLATE_THEMES.jakes_resume;
}

export function layoutForTemplate(id: string): PreviewLayout {
  return themeForTemplate(id).layout;
}

/** @deprecated use TemplateTheme */
export type PreviewTheme = Pick<TemplateTheme, "accent" | "header" | "font">;
