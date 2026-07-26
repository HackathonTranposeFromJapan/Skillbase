import { NextResponse } from "next/server";
import { getFeed } from "@/lib/backend/feed";
import { recordEvent } from "@/lib/events";
import { getSkill } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Recorded telemetry when the database is up, seed activity when it is not.
  const { events, source } = await getFeed();
  return NextResponse.json({ events, source });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const skill = getSkill(String(body.slug ?? ""));
  if (!skill) {
    return NextResponse.json({ error: "unknown skill" }, { status: 404 });
  }

  const event = recordEvent({
    type: body.type === "run" ? "run" : "install",
    slug: skill.slug,
    actor: String(body.actor ?? "you@"),
    department: skill.department,
    live: true,
  });

  return NextResponse.json({ ok: true, event });
}
