"use client";

interface SkillPillsProps {
  skills: string[];
  variant?: "default" | "matched" | "missing";
  size?: "sm" | "md";
}

export default function SkillPills({
  skills,
  variant = "default",
  size = "md",
}: SkillPillsProps) {
  if (skills.length === 0) return null;

  const colorMap = {
    default:
      "border-accent-cyan/20 bg-accent-cyan/8 text-accent-cyan",
    matched:
      "border-accent-emerald/20 bg-accent-emerald/8 text-accent-emerald",
    missing:
      "border-accent-coral/20 bg-accent-coral/8 text-accent-coral",
  };

  const sizeMap = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((skill, i) => (
        <span
          key={skill}
          className={`
            inline-flex items-center rounded-md border font-[family-name:var(--font-jetbrains-mono)] font-medium
            animate-slide-up ${colorMap[variant]} ${sizeMap[size]}
          `}
          style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
        >
          {skill}
        </span>
      ))}
    </div>
  );
}
