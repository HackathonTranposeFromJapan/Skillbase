import { NextResponse } from "next/server";
import { getSkill } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const skill = getSkill(slug);
  if (!skill) return NextResponse.json({ error: "unknown skill" }, { status: 404 });
  return NextResponse.json(skill);
}
