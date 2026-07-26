import { NextResponse } from "next/server";
import { rankSkills } from "@/lib/rank";
import { canInstall } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { query = "", role = "employee" } = await req.json().catch(() => ({}));
  const { results, engine } = await rankSkills(String(query), String(role));

  return NextResponse.json({
    engine,
    results: results.map(({ skill, reason }) => ({
      slug: skill.slug,
      name: skill.name,
      tagline: skill.tagline,
      department: skill.department,
      tags: skill.tags.slice(0, 4),
      official: skill.official,
      version: skill.version,
      updatedAt: skill.updatedAt,
      installs: skill.installs,
      activeUsers: skill.activeUsers,
      rating: skill.rating,
      weeklyUsage: skill.weeklyUsage,
      impact: skill.impact,
      requiredRole: skill.requiredRole,
      locked: !canInstall(skill, String(role)),
      reason,
    })),
  });
}
