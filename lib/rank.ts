import { execFile } from "node:child_process";
import { SKILLS, type Skill } from "./skills";

export type Ranked = {
  skill: Skill;
  score: number;
  reason: string;
};

export type RankResult = {
  results: Ranked[];
  engine: "claude-api" | "claude-cli" | "lexical";
};

const STOP = new Set([
  "a", "an", "the", "i", "im", "am", "is", "are", "was", "for", "to", "of", "and", "or", "my",
  "me", "we", "our", "you", "your", "it", "its", "that", "this", "with", "on", "in", "at", "by",
  "want", "need", "find", "looking", "look", "help", "make", "makes", "get", "some", "skill",
  "skills", "can", "should", "would", "how", "what", "which", "who", "do", "does", "please",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Deterministic lexical scoring. Always available — this is the safety net that
 * keeps search working when no model is reachable.
 */
export function lexicalRank(query: string, role?: string): Ranked[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return SKILLS.map((skill) => ({
      skill,
      score: skill.installs / 1000,
      reason: `Popular in ${skill.department} — ${skill.installs} installs.`,
    })).sort((a, b) => b.score - a.score);
  }

  const scored = SKILLS.map((skill) => {
    const haystacks: Array<[string, number]> = [
      [skill.tags.join(" "), 3],
      [skill.name, 2.5],
      [skill.tagline, 2],
      [skill.description, 1],
      [skill.department, 1.5],
      [skill.roles.join(" "), 1.5],
    ];

    let score = 0;
    const hits: string[] = [];
    for (const term of terms) {
      for (const [text, weight] of haystacks) {
        if (text.toLowerCase().includes(term)) {
          score += weight;
          if (!hits.includes(term)) hits.push(term);
          break;
        }
      }
    }

    // Gentle popularity prior so ties resolve toward what the company actually uses.
    score += Math.min(skill.installs / 500, 0.8);
    if (role && skill.roles.includes(role)) score += 1.2;

    const reason = hits.length
      ? `Matches ${hits.slice(0, 3).map((h) => `"${h}"`).join(", ")} · ${skill.activeUsers} active users in ${skill.department}.`
      : `${skill.impact}`;

    return { skill, score, reason };
  });

  return scored.filter((s) => s.score > 0.9).sort((a, b) => b.score - a.score);
}

function claudeCli(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", prompt, "--output-format", "text"],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
    child.stdin?.end();
  });
}

async function claudeApi(prompt: string, timeoutMs: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

function buildPrompt(query: string, candidates: Skill[], role?: string): string {
  const catalog = candidates
    .map(
      (s) =>
        `- ${s.slug} | ${s.name} | ${s.tagline} | dept=${s.department} | for=${s.roles.join(",")} | ${s.installs} installs, ${s.activeUsers} active | ${s.impact}`,
    )
    .join("\n");

  return `You rank an internal library of AI-agent skills for an employee.

Employee role: ${role || "unspecified"}
They asked: "${query}"

Candidate skills:
${catalog}

Return ONLY a JSON array, no prose, no code fence. At most 5 entries, best first.
Each entry: {"slug": string, "reason": string}
"reason" is one sentence, max 16 words, addressed to the employee, saying concretely why this skill fits THEIR request. Reference their words. Do not repeat the tagline verbatim. Never invent a slug that is not listed.`;
}

function parseModelJson(raw: string): Array<{ slug: string; reason: string }> {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("no json array in model output");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("not an array");
  return parsed;
}

/**
 * Lexical prefilter, then a model reranks and explains. Any failure in the model
 * path falls back to the lexical ordering rather than erroring the request.
 */
export async function rankSkills(query: string, role?: string): Promise<RankResult> {
  const lexical = lexicalRank(query, role);
  const candidates = (lexical.length ? lexical : lexicalRank("", role)).slice(0, 8).map((r) => r.skill);

  if (!query.trim()) return { results: lexical.slice(0, 5), engine: "lexical" };

  const prompt = buildPrompt(query, candidates, role);
  const useApi = Boolean(process.env.ANTHROPIC_API_KEY);

  try {
    const raw = useApi ? await claudeApi(prompt, 12000) : await claudeCli(prompt, 20000);
    const picks = parseModelJson(raw);

    const results: Ranked[] = [];
    picks.forEach((pick, i) => {
      const skill = candidates.find((c) => c.slug === pick.slug);
      if (skill && !results.some((r) => r.skill.slug === skill.slug)) {
        results.push({ skill, score: picks.length - i, reason: pick.reason });
      }
    });

    if (results.length === 0) throw new Error("model returned no usable slugs");
    return { results, engine: useApi ? "claude-api" : "claude-cli" };
  } catch {
    return { results: lexical.slice(0, 5), engine: "lexical" };
  }
}
