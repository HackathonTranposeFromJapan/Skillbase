import skillsData from "@/data/skills.json";

export type Skill = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  department: string;
  roles: string[];
  tags: string[];
  requiredRole: string;
  official: boolean;
  version: string;
  updatedAt: string;
  author: string;
  installs: number;
  activeUsers: number;
  rating: number;
  retention30d: number;
  adoptionByDept: Record<string, number>;
  weeklyUsage: number[];
  impact: string;
  body: string;
};

// Each entry lists only the departments that use it, so the inferred JSON union
// disagrees with the open Record — the shape is validated by the type below.
export const SKILLS = skillsData as unknown as Skill[];

export function getSkill(slug: string): Skill | undefined {
  return SKILLS.find((s) => s.slug === slug);
}

/** Roles a viewer can hold in the demo. Gates installs on restricted skills. */
export const ROLE_RANK: Record<string, number> = {
  employee: 0,
  "manager-approved": 1,
  "legal-approved": 1,
};

export function canInstall(skill: Skill, viewerRole: string): boolean {
  if (skill.requiredRole === "employee") return true;
  return skill.requiredRole === viewerRole;
}
