#!/usr/bin/env node
// @bun

// cli/skilldrop-collect.ts
import { existsSync as existsSync11 } from "fs";
import { homedir as homedir8 } from "os";
import { join as join12, resolve as resolve2 } from "path";

// lib/skillbase/identity.ts
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { join } from "node:path";

// lib/skillbase/schema.ts
var SCHEMA_VERSION = 1;
var AGENT_KINDS = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "hermes",
  "opencode",
  "goose",
  "other"
];
var EVENT_TYPES = [
  "invoked",
  "completed",
  "failed",
  "installed",
  "updated",
  "uninstalled",
  "listed",
  "blocked"
];
var TRIGGERS = [
  "explicit_command",
  "model_auto",
  "subagent",
  "scheduled",
  "unknown"
];
var OUTCOMES = ["success", "error", "aborted"];
var DETECTION_SOURCES = ["hook", "beacon", "transcript", "otel", "api"];
var INSTALL_SCOPES = ["user", "project", "admin", "plugin", "unknown"];
var SOURCE_CONFIDENCE = {
  api: 1,
  hook: 1,
  transcript: 0.99,
  otel: 0.95,
  beacon: 0.8
};
var isString = (v) => typeof v === "string";
var isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
function isOneOf(v, allowed) {
  return isString(v) && allowed.includes(v);
}
function validateSkillEvent(input) {
  const errors = [];
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["event must be an object"] };
  }
  const e = input;
  const req = (field, ok, expected) => {
    if (!ok)
      errors.push(`${field}: expected ${expected}, got ${JSON.stringify(e[field])}`);
  };
  req("schemaVersion", isFiniteNumber(e.schemaVersion), "number");
  req("eventId", isString(e.eventId) && e.eventId.length > 0, "non-empty string");
  req("dedupeKey", isString(e.dedupeKey) && e.dedupeKey.length > 0, "non-empty string");
  req("mergeKey", isString(e.mergeKey) && e.mergeKey.length > 0, "non-empty string");
  req("agentInstallId", isString(e.agentInstallId) && e.agentInstallId.length > 0, "non-empty string");
  req("occurredAt", isString(e.occurredAt) && !Number.isNaN(Date.parse(e.occurredAt)), "ISO-8601 timestamp");
  req("agentKind", isOneOf(e.agentKind, AGENT_KINDS), `one of ${AGENT_KINDS.join("|")}`);
  req("observedSkillName", isString(e.observedSkillName) && e.observedSkillName.length > 0, "non-empty string");
  req("eventType", isOneOf(e.eventType, EVENT_TYPES), `one of ${EVENT_TYPES.join("|")}`);
  req("trigger", isOneOf(e.trigger, TRIGGERS), `one of ${TRIGGERS.join("|")}`);
  req("installScope", isOneOf(e.installScope, INSTALL_SCOPES), `one of ${INSTALL_SCOPES.join("|")}`);
  req("detectedBy", isOneOf(e.detectedBy, DETECTION_SOURCES), `one of ${DETECTION_SOURCES.join("|")}`);
  req("isSubagent", typeof e.isSubagent === "boolean", "boolean");
  req("confidence", isFiniteNumber(e.confidence) && e.confidence >= 0 && e.confidence <= 1, "number in [0,1]");
  req("agentMeta", typeof e.agentMeta === "object" && e.agentMeta !== null && !Array.isArray(e.agentMeta), "object");
  if (e.outcome !== null && e.outcome !== undefined && !isOneOf(e.outcome, OUTCOMES)) {
    errors.push(`outcome: expected null or one of ${OUTCOMES.join("|")}`);
  }
  const nullableStrings = [
    "tenantId",
    "principalId",
    "agentVersion",
    "skillId",
    "skillVersionId",
    "observedContentHash",
    "errorKind",
    "invocationId",
    "parentInvocationId",
    "sessionId",
    "turnId",
    "projectKey",
    "argsHash"
  ];
  for (const f of nullableStrings) {
    const v = e[f];
    if (v !== null && v !== undefined && !isString(v))
      errors.push(`${f}: expected string or null`);
  }
  const nullableNumbers = [
    "durationMs",
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "costUsd"
  ];
  for (const f of nullableNumbers) {
    const v = e[f];
    if (v !== null && v !== undefined && !isFiniteNumber(v))
      errors.push(`${f}: expected number or null`);
  }
  for (const banned of ["args", "prompt", "output", "toolResponse", "content"]) {
    if (banned in e)
      errors.push(`${banned}: forbidden field (metadata-only telemetry)`);
  }
  if (errors.length > 0)
    return { ok: false, errors };
  return { ok: true, value: input };
}

// lib/skillbase/identity.ts
var MERGE_BUCKET_MS = 120000;
var sha256 = (input) => createHash("sha256").update(input, "utf8").digest("hex");
var shortHash = (input) => sha256(input).slice(0, 32);
function skillbaseHome() {
  return process.env.SKILLBASE_HOME ?? join(homedir(), ".skillbase");
}
function ensureHome() {
  const dir = skillbaseHome();
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true });
  return dir;
}
function loadDeviceIdentity() {
  const dir = ensureHome();
  const file = join(dir, "device.json");
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed.salt && parsed.machineIdHash) {
        return {
          salt: parsed.salt,
          machineIdHash: parsed.machineIdHash,
          agentInstallIds: parsed.agentInstallIds ?? {}
        };
      }
    } catch {}
  }
  const salt = randomUUID();
  const identity = {
    salt,
    machineIdHash: shortHash(`${salt}:${hostname()}:${platform()}`),
    agentInstallIds: {}
  };
  writeFileSync(file, JSON.stringify(identity, null, 2), "utf8");
  return identity;
}
function agentInstallId(agentKind) {
  const identity = loadDeviceIdentity();
  const existing = identity.agentInstallIds[agentKind];
  if (existing)
    return existing;
  const id = shortHash(`${identity.salt}:${identity.machineIdHash}:${agentKind}`);
  identity.agentInstallIds[agentKind] = id;
  writeFileSync(join(ensureHome(), "device.json"), JSON.stringify(identity, null, 2), "utf8");
  return id;
}
function projectKey(cwd) {
  if (!cwd)
    return null;
  return shortHash(`${loadDeviceIdentity().salt}:project:${cwd}`);
}
function skillContentHash(skillMarkdown) {
  const normalized = skillMarkdown.replace(/\r\n/g, `
`).replace(/[ \t]+$/gm, "").trim();
  return sha256(normalized);
}
function buildDedupeKey(e) {
  const invocation = e.invocationId ?? `t:${bucket(e.occurredAt)}`;
  return shortHash([e.detectedBy, e.agentInstallId, e.sessionId ?? "-", invocation, e.observedSkillName, e.eventType].join("|"));
}
function buildMergeKey(e) {
  return shortHash([e.agentInstallId, e.sessionId ?? "-", e.observedSkillName, e.eventType, bucket(e.occurredAt)].join("|"));
}
function bucket(occurredAt) {
  const ms = Date.parse(occurredAt);
  return Math.floor((Number.isNaN(ms) ? 0 : ms) / MERGE_BUCKET_MS);
}
function buildEvent(input) {
  return {
    ...input,
    schemaVersion: SCHEMA_VERSION,
    dedupeKey: buildDedupeKey(input),
    mergeKey: buildMergeKey(input),
    confidence: input.confidence ?? SOURCE_CONFIDENCE[input.detectedBy],
    receivedAt: null
  };
}
var newEventId = () => randomUUID();

// lib/skillbase/pending.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
var TTL_MS = 30 * 60 * 1000;
function storePath() {
  return join2(skillbaseHome(), "pending.json");
}
function readStore() {
  try {
    const raw = readFileSync2(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const fresh = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.ts === "number" && now - entry.ts < TTL_MS)
        fresh[key] = entry;
    }
    return fresh;
  } catch {
    return {};
  }
}
function writeStore(store) {
  const path = storePath();
  mkdirSync2(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync2(tmp, JSON.stringify(store), "utf8");
  renameSync(tmp, path);
}
function putPending(key, data) {
  const store = readStore();
  store[key] = { ts: Date.now(), data };
  writeStore(store);
}
function takePending(key) {
  const store = readStore();
  const entry = store[key];
  if (!entry)
    return null;
  delete store[key];
  writeStore(store);
  return entry;
}
function peekPending(key) {
  return readStore()[key] ?? null;
}
function drainPrefix(prefix) {
  const store = readStore();
  const drained = [];
  for (const [key, entry] of Object.entries(store)) {
    if (key.startsWith(prefix)) {
      drained.push({ key, entry });
      delete store[key];
    }
  }
  if (drained.length > 0)
    writeStore(store);
  return drained;
}

// lib/skillbase/scan.ts
import { existsSync as existsSync3, readdirSync, readFileSync as readFileSync3, statSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
function searchPaths(agentKind, cwd) {
  const home = homedir2();
  const paths = [];
  switch (agentKind) {
    case "claude_code":
      paths.push({ dir: join3(home, ".claude", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join3(cwd, ".claude", "skills"), scope: "project" });
      break;
    case "codex":
      paths.push({ dir: join3(home, ".agents", "skills"), scope: "user" });
      paths.push({ dir: join3(home, ".codex", "skills"), scope: "user" });
      if (cwd) {
        paths.push({ dir: join3(cwd, ".agents", "skills"), scope: "project" });
        paths.push({ dir: join3(cwd, ".codex", "skills"), scope: "project" });
      }
      paths.push({ dir: "/etc/codex/skills", scope: "admin" });
      break;
    case "cursor":
      paths.push({ dir: join3(home, ".cursor", "skills-cursor"), scope: "user" });
      paths.push({ dir: join3(home, ".cursor", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join3(cwd, ".cursor", "skills"), scope: "project" });
      break;
    default:
      paths.push({ dir: join3(home, ".agents", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join3(cwd, ".agents", "skills"), scope: "project" });
      break;
  }
  return paths;
}
function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match?.[1])
    return {};
  const out = {};
  let currentKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.*)$/.exec(rawLine);
    if (listItem?.[1] !== undefined && currentKey) {
      const existing = out[currentKey];
      const list = Array.isArray(existing) ? existing : [];
      list.push(stripQuotes(listItem[1].trim()));
      out[currentKey] = list;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (!kv?.[1])
      continue;
    const key = kv[1];
    const value = (kv[2] ?? "").trim();
    currentKey = key;
    if (value === "" || value === ">" || value === "|" || value === ">-" || value === "|-") {
      out[key] = value === "" ? [] : "";
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value.slice(1, -1).split(",").map((s) => stripQuotes(s.trim())).filter((s) => s.length > 0);
      continue;
    }
    out[key] = stripQuotes(value);
  }
  for (const key of ["description", "name"]) {
    if (Array.isArray(out[key]) || out[key] === "") {
      const block = readBlockScalar(match[1], key);
      if (block)
        out[key] = block;
    }
  }
  return out;
}
function stripQuotes(value) {
  if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
function readBlockScalar(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => new RegExp(`^${key}:\\s*[>|]?-?\\s*$`).test(l));
  if (startIndex === -1)
    return null;
  const collected = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^[A-Za-z0-9_-]+:/.test(line))
      break;
    collected.push(line.trim());
  }
  const text = collected.join(" ").trim();
  return text.length > 0 ? text : null;
}
function readSkillDir(dir, name, scope) {
  const skillMdPath = join3(dir, name, "SKILL.md");
  if (!existsSync3(skillMdPath))
    return null;
  try {
    const markdown = readFileSync3(skillMdPath, "utf8");
    return {
      name,
      path: join3(dir, name),
      skillMdPath,
      scope,
      contentHash: skillContentHash(markdown),
      frontmatter: parseFrontmatter(markdown)
    };
  } catch {
    return null;
  }
}
function discoverSkills(agentKind, cwd) {
  const found = [];
  const seen = new Set;
  for (const { dir, scope } of searchPaths(agentKind, cwd)) {
    if (!existsSync3(dir))
      continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      try {
        if (!statSync(join3(dir, entry)).isDirectory())
          continue;
      } catch {
        continue;
      }
      const skill = readSkillDir(dir, entry, scope);
      if (skill && !seen.has(skill.path)) {
        seen.add(skill.path);
        found.push(skill);
      }
    }
  }
  return found;
}
function resolveSkill(agentKind, observedName, cwd) {
  const bare = observedName.includes(":") ? observedName.split(":").pop() ?? observedName : observedName;
  for (const { dir, scope } of searchPaths(agentKind, cwd)) {
    const direct = readSkillDir(dir, bare, scope);
    if (direct)
      return direct;
  }
  return discoverSkills(agentKind, cwd).find((s) => s.name === bare) ?? null;
}
function inferScope(observedName, basePath) {
  if (observedName.includes(":"))
    return "plugin";
  if (!basePath)
    return "unknown";
  if (basePath.includes("/plugins/"))
    return "plugin";
  if (basePath.startsWith(homedir2()))
    return "user";
  if (basePath.startsWith("/etc/"))
    return "admin";
  return "project";
}

// lib/skillbase/adapters/beacon.ts
function parseSkillRef(ref) {
  const at = ref.lastIndexOf("@");
  const hasVersion = at > 0;
  const withoutVersion = hasVersion ? ref.slice(0, at) : ref;
  const version = hasVersion ? ref.slice(at + 1) : null;
  const namespaced = withoutVersion.includes("/");
  const name = withoutVersion.split("/").pop() ?? withoutVersion;
  return {
    skillId: namespaced ? withoutVersion : null,
    name,
    version: version && version.length > 0 ? version : null
  };
}
function detectAgentKind(explicit) {
  if (explicit && AGENT_KINDS.includes(explicit))
    return explicit;
  const env = process.env;
  if (env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDECODE ?? env.CLAUDE_CODE_VERSION)
    return "claude_code";
  if (env.CODEX_SESSION_ID ?? env.CODEX_SANDBOX ?? env.CODEX_HOME)
    return "codex";
  if (env.CURSOR_SESSION_ID ?? env.CURSOR_AGENT)
    return "cursor";
  if (env.GEMINI_CLI_SESSION ?? env.GEMINI_SESSION_ID)
    return "gemini_cli";
  if (env.HERMES_SESSION_ID ?? env.HERMES_AGENT)
    return "hermes";
  return "other";
}
var runKey = (sessionId, skillName) => `beacon:run:${sessionId ?? "-"}:${skillName}`;
function adaptBeacon(input, now = new Date) {
  const ref = parseSkillRef(input.skill);
  const agentKind = detectAgentKind(input.agent);
  const cwd = input.cwd ?? process.cwd();
  const resolved = resolveSkill(agentKind, ref.name, cwd);
  const sessionId = input.session ?? process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? null;
  const key = runKey(sessionId, ref.name);
  let runId = input.run ?? null;
  let durationMs = null;
  if (input.phase === "start") {
    runId = runId ?? newEventId();
    putPending(key, { startedAt: now.getTime(), runId });
  } else {
    const started = takePending(key);
    if (typeof started?.data.startedAt === "number") {
      durationMs = Math.max(0, now.getTime() - started.data.startedAt);
    }
    if (!runId && typeof started?.data.runId === "string")
      runId = started.data.runId;
  }
  const isEnd = input.phase === "end";
  const outcome = isEnd ? input.outcome ?? "success" : null;
  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(agentKind),
    occurredAt: now.toISOString(),
    agentKind,
    agentVersion: null,
    skillId: ref.skillId,
    skillVersionId: null,
    observedSkillName: ref.name,
    observedContentHash: resolved?.contentHash ?? null,
    installScope: resolved?.scope ?? "unknown",
    eventType: isEnd ? outcome === "success" ? "completed" : "failed" : "invoked",
    trigger: input.trigger ?? "unknown",
    outcome,
    errorKind: outcome === "error" ? "skill_reported_error" : null,
    durationMs,
    invocationId: runId,
    parentInvocationId: null,
    sessionId,
    turnId: null,
    isSubagent: false,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(cwd),
    argsHash: input.args ? sha256(input.args) : null,
    agentMeta: {
      declaredVersion: ref.version,
      resolvedVersion: resolved?.frontmatter.version ?? null
    },
    detectedBy: "beacon"
  });
}
var BEACON_MARKER = "<!-- skillbase:beacon -->";
var BEACON_PACKAGE = "skillbase";
function beaconSnippet(skillRef) {
  return [
    BEACON_MARKER,
    "## Telemetry (managed by Skillbase — do not edit)",
    "",
    "Run this first, before any other step in this skill:",
    "",
    "```bash",
    `npx -y ${BEACON_PACKAGE} emit --skill ${skillRef} --phase start`,
    "```",
    "",
    "Optionally, once the skill is finished:",
    "",
    "```bash",
    `npx -y ${BEACON_PACKAGE} emit --skill ${skillRef} --phase end`,
    "```",
    "",
    "This records only the skill name, version and timing. No prompt, argument or",
    "output content is transmitted.",
    BEACON_MARKER,
    ""
  ].join(`
`);
}

// lib/skillbase/adapters/claude-code.ts
var AGENT = "claude_code";
var markerKey = (sessionId, skill) => `cc:expansion:${sessionId ?? "-"}:${skill}`;
var startKey = (toolUseId) => `cc:start:${toolUseId}`;
function adaptClaudeHook(payload, now = new Date) {
  const event = payload.hook_event_name ?? "";
  if (event === "UserPromptExpansion")
    return handleExpansion(payload);
  if (event === "SessionEnd")
    return flushUnconsumedMarkers(payload, now);
  if (payload.tool_name !== "Skill")
    return [];
  switch (event) {
    case "PreToolUse":
      return [buildInvoked(payload, now)];
    case "PostToolUse":
      return [buildFinished(payload, now, "completed")];
    case "PostToolUseFailure":
      return [buildFinished(payload, now, "failed")];
    default:
      return [];
  }
}
function handleExpansion(payload) {
  const skill = payload.command_name;
  if (!skill)
    return [];
  putPending(markerKey(payload.session_id ?? null, skill), {
    skill,
    sessionId: payload.session_id ?? null,
    cwd: payload.cwd ?? null,
    occurredAt: new Date().toISOString()
  });
  return [];
}
function buildInvoked(payload, now) {
  const skillName = payload.tool_input?.skill ?? "unknown";
  const sessionId = payload.session_id ?? null;
  const occurredAt = now.toISOString();
  const explicit = takePending(markerKey(sessionId, skillName)) !== null;
  const trigger = explicit ? "explicit_command" : payload.agent_id ? "subagent" : "model_auto";
  if (payload.tool_use_id) {
    putPending(startKey(payload.tool_use_id), { startedAt: now.getTime(), trigger, skillName });
  }
  return skillEvent(payload, {
    eventType: "invoked",
    skillName,
    trigger,
    occurredAt,
    outcome: null,
    errorKind: null,
    durationMs: null
  });
}
function buildFinished(payload, now, eventType) {
  const skillName = payload.tool_input?.skill ?? "unknown";
  const started = payload.tool_use_id ? takePending(startKey(payload.tool_use_id)) : null;
  const startedAt = typeof started?.data.startedAt === "number" ? started.data.startedAt : null;
  const trigger = typeof started?.data.trigger === "string" ? started.data.trigger : "unknown";
  const isError = eventType === "failed" || payload.tool_response_is_error === true;
  return skillEvent(payload, {
    eventType: isError ? "failed" : "completed",
    skillName,
    trigger,
    occurredAt: now.toISOString(),
    outcome: isError ? "error" : "success",
    errorKind: isError ? "tool_error" : null,
    durationMs: startedAt === null ? null : Math.max(0, now.getTime() - startedAt)
  });
}
function flushUnconsumedMarkers(payload, now) {
  const prefix = `cc:expansion:${payload.session_id ?? "-"}:`;
  return drainPrefix(prefix).map(({ entry }) => {
    const skillName = typeof entry.data.skill === "string" ? entry.data.skill : "unknown";
    const occurredAt = typeof entry.data.occurredAt === "string" ? entry.data.occurredAt : now.toISOString();
    return skillEvent({ ...payload, cwd: entry.data.cwd ?? payload.cwd }, {
      eventType: "invoked",
      skillName,
      trigger: "explicit_command",
      occurredAt,
      outcome: null,
      errorKind: null,
      durationMs: null
    }, null);
  });
}
function skillEvent(payload, fields, invocationIdOverride) {
  const cwd = payload.cwd ?? null;
  const resolved = resolveSkill(AGENT, fields.skillName, cwd);
  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(AGENT),
    occurredAt: fields.occurredAt,
    agentKind: AGENT,
    agentVersion: process.env.CLAUDE_CODE_VERSION ?? null,
    skillId: null,
    skillVersionId: null,
    observedSkillName: fields.skillName,
    observedContentHash: resolved?.contentHash ?? null,
    installScope: resolved?.scope ?? inferScope(fields.skillName, null),
    eventType: fields.eventType,
    trigger: fields.trigger,
    outcome: fields.outcome,
    errorKind: fields.errorKind,
    durationMs: fields.durationMs,
    invocationId: invocationIdOverride === undefined ? payload.tool_use_id ?? null : invocationIdOverride,
    parentInvocationId: null,
    sessionId: payload.session_id ?? null,
    turnId: payload.prompt_id ?? null,
    isSubagent: Boolean(payload.agent_id),
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(cwd),
    argsHash: null,
    agentMeta: {
      permissionMode: payload.permission_mode ?? null,
      agentType: payload.agent_type ?? null,
      skillVersion: resolved?.frontmatter.version ?? null
    },
    detectedBy: "hook"
  });
}

// lib/skillbase/adapters/codex.ts
var AGENT2 = "codex";
var ACTIVATION_CONFIDENCE = 0.95;
var MENTION_CONFIDENCE = 0.85;
var SCRIPT_CONFIDENCE = 0.9;
var SKILL_MD_READ = /((?:[^\s'"|;&]*\/(?:\.agents|\.codex)|\/etc\/codex)\/skills)\/([A-Za-z0-9._-]+)\/SKILL\.md/g;
function adaptCodexHook(payload, now = new Date) {
  const event = payload.hook_event_name ?? "";
  const skills = discoverSkills(AGENT2, payload.cwd ?? null);
  if (event === "UserPromptSubmit") {
    return skills.length === 0 ? [] : handleMentions(payload, skills, now);
  }
  if (event === "PreToolUse" || event === "PostToolUse")
    return handleShell(payload, skills, now, event);
  return [];
}
function handleMentions(payload, skills, now) {
  const prompt = payload.prompt ?? payload.user_prompt ?? "";
  if (!prompt)
    return [];
  const mentioned = new Set;
  for (const match of prompt.matchAll(/\$([A-Za-z0-9][A-Za-z0-9._-]*)/g)) {
    const name = match[1];
    if (name)
      mentioned.add(name);
  }
  if (mentioned.size === 0)
    return [];
  return skills.filter((s) => mentioned.has(s.name)).map((skill) => {
    putPending(`cx:mention:${payload.session_id ?? "-"}:${skill.name}`, { ts: now.getTime() });
    return codexEvent(payload, skill, {
      occurredAt: now.toISOString(),
      trigger: "explicit_command",
      confidence: MENTION_CONFIDENCE,
      detectionNote: "dollar_mention"
    });
  });
}
function handleShell(payload, skills, now, event) {
  const command = normalizeCommand(payload.tool_input?.command);
  if (!command)
    return [];
  if (/(skillbase|skilldrop)\s+emit/.test(command))
    return [];
  if (event !== "PreToolUse")
    return [];
  const activated = readActivationName(command);
  if (activated) {
    const skill = skills.find((s) => s.name === activated);
    return emitOnce(payload, activated, skill, now, {
      confidence: ACTIVATION_CONFIDENCE,
      detectionNote: "skill_md_read"
    });
  }
  const owning = skills.find((skill) => command.includes(skill.path));
  if (!owning)
    return [];
  return emitOnce(payload, owning.name, owning, now, {
    confidence: SCRIPT_CONFIDENCE,
    detectionNote: "skill_script_execution"
  });
}
function readActivationName(command) {
  SKILL_MD_READ.lastIndex = 0;
  return SKILL_MD_READ.exec(command)?.[2] ?? null;
}
function emitOnce(payload, skillName, skill, now, fields) {
  const session = payload.session_id ?? "-";
  const seenKey = `cx:seen:${session}:${skillName}`;
  if (peekPending(seenKey) !== null)
    return [];
  putPending(seenKey, { ts: now.getTime() });
  const mentioned = takePending(`cx:mention:${session}:${skillName}`) !== null;
  if (mentioned)
    return [];
  return [
    codexEvent(payload, skill ?? syntheticSkill(skillName), {
      occurredAt: now.toISOString(),
      trigger: "unknown",
      confidence: fields.confidence,
      detectionNote: fields.detectionNote
    })
  ];
}
function syntheticSkill(name) {
  return {
    name,
    path: "",
    skillMdPath: "",
    scope: "unknown",
    contentHash: "",
    frontmatter: {}
  };
}
function normalizeCommand(command) {
  if (typeof command === "string")
    return command;
  if (Array.isArray(command))
    return command.join(" ");
  return null;
}
function codexEvent(payload, skill, fields) {
  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(AGENT2),
    occurredAt: fields.occurredAt,
    agentKind: AGENT2,
    agentVersion: null,
    skillId: null,
    skillVersionId: null,
    observedSkillName: skill.name,
    observedContentHash: skill.contentHash === "" ? null : skill.contentHash,
    installScope: skill.scope,
    eventType: "invoked",
    trigger: fields.trigger,
    outcome: null,
    errorKind: null,
    durationMs: null,
    invocationId: payload.turn_id ?? payload.tool_use_id ?? null,
    parentInvocationId: null,
    sessionId: payload.session_id ?? null,
    turnId: payload.turn_id ?? null,
    isSubagent: false,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(payload.cwd ?? null),
    argsHash: null,
    agentMeta: {
      detectionNote: fields.detectionNote,
      permissionMode: payload.permission_mode ?? null,
      skillVersion: skill.frontmatter.version ?? null
    },
    detectedBy: "hook",
    confidence: fields.confidence
  });
}

// lib/skillbase/backfill/claude-code.ts
import { existsSync as existsSync4, readdirSync as readdirSync2, readFileSync as readFileSync4, statSync as statSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";
var AGENT3 = "claude_code";
function transcriptRoot() {
  return join4(homedir3(), ".claude", "projects");
}
function listTranscripts(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join4(dir, entry);
      let isDir = false;
      try {
        isDir = statSync2(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir)
        walk(full);
      else if (entry.endsWith(".jsonl"))
        files.push(full);
    }
  };
  if (existsSync4(root))
    walk(root);
  return files;
}
function backfillClaudeCode(options = {}) {
  const root = options.root ?? transcriptRoot();
  const since = options.since ?? null;
  const events = [];
  const stats = {
    filesScanned: 0,
    linesParsed: 0,
    parseFailures: 0,
    events: 0,
    bySkill: {}
  };
  const installId = agentInstallId(AGENT3);
  for (const file of listTranscripts(root)) {
    stats.filesScanned += 1;
    let content;
    try {
      content = readFileSync4(file, "utf8");
    } catch {
      continue;
    }
    const pending = new Map;
    for (const line of content.split(`
`)) {
      if (!line.trim())
        continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        stats.parseFailures += 1;
        continue;
      }
      stats.linesParsed += 1;
      for (const invocation of extractInvocations(record, installId, since)) {
        events.push(invocation.event);
        stats.bySkill[invocation.event.observedSkillName] = (stats.bySkill[invocation.event.observedSkillName] ?? 0) + 1;
        pending.set(invocation.toolUseId, invocation);
      }
      const completion = extractCompletion(record, pending, installId);
      if (completion)
        events.push(completion);
    }
  }
  stats.events = events.length;
  return { events, stats };
}
function extractInvocations(record, installId, since) {
  const content = record.message?.content;
  if (!Array.isArray(content))
    return [];
  const out = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null)
      continue;
    const b = block;
    if (b.type !== "tool_use" || b.name !== "Skill")
      continue;
    const skillName = b.input?.skill;
    if (!skillName)
      continue;
    const occurredAt = record.timestamp ?? new Date(0).toISOString();
    if (since && Date.parse(occurredAt) < since.getTime())
      continue;
    const toolUseId = b.id ?? `${record.uuid ?? "unknown"}:${skillName}`;
    const usage = record.message?.usage;
    out.push({
      toolUseId,
      event: buildEvent({
        eventId: newEventId(),
        tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
        principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
        agentInstallId: installId,
        occurredAt,
        agentKind: AGENT3,
        agentVersion: record.version ?? null,
        skillId: null,
        skillVersionId: null,
        observedSkillName: skillName,
        observedContentHash: null,
        installScope: inferScope(skillName, null),
        eventType: "invoked",
        trigger: record.isSidechain ? "subagent" : "unknown",
        outcome: null,
        errorKind: null,
        durationMs: null,
        invocationId: toolUseId,
        parentInvocationId: null,
        sessionId: record.sessionId ?? record.session_id ?? null,
        turnId: record.promptId ?? null,
        isSubagent: Boolean(record.isSidechain),
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        cacheReadTokens: usage?.cache_read_input_tokens ?? null,
        costUsd: null,
        projectKey: projectKey(record.cwd ?? null),
        argsHash: null,
        agentMeta: {
          model: record.message?.model ?? null,
          callerType: b.input?.caller?.type ?? null
        },
        detectedBy: "transcript"
      })
    });
  }
  return out;
}
function extractCompletion(record, pending, installId) {
  const content = record.message?.content;
  if (!Array.isArray(content))
    return null;
  for (const block of content) {
    if (typeof block !== "object" || block === null)
      continue;
    const b = block;
    if (b.type !== "tool_result" || !b.tool_use_id)
      continue;
    const invocation = pending.get(b.tool_use_id);
    if (!invocation)
      continue;
    pending.delete(b.tool_use_id);
    const success = record.toolUseResult?.success !== false;
    const outcome = success ? "success" : "error";
    const occurredAt = record.timestamp ?? invocation.event.occurredAt;
    const startedAt = Date.parse(invocation.event.occurredAt);
    const endedAt = Date.parse(occurredAt);
    return buildEvent({
      ...invocation.event,
      eventId: newEventId(),
      agentInstallId: installId,
      occurredAt,
      eventType: success ? "completed" : "failed",
      outcome,
      errorKind: success ? null : "skill_launch_failed",
      durationMs: Number.isNaN(startedAt) || Number.isNaN(endedAt) ? null : Math.max(0, endedAt - startedAt),
      detectedBy: "transcript"
    });
  }
  return null;
}

// lib/skillbase/backfill/codex.ts
import { existsSync as existsSync5, readdirSync as readdirSync3, readFileSync as readFileSync5, statSync as statSync3 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join5 } from "node:path";

// lib/skillbase/adapters/codex.ts
var SKILL_MD_READ2 = /((?:[^\s'"|;&]*\/(?:\.agents|\.codex)|\/etc\/codex)\/skills)\/([A-Za-z0-9._-]+)\/SKILL\.md/g;

// lib/skillbase/backfill/codex.ts
var AGENT4 = "codex";
var ACTIVATION_CONFIDENCE2 = 0.95;
function rolloutRoot() {
  const codexHome = process.env.CODEX_HOME ?? join5(homedir4(), ".codex");
  return join5(codexHome, "sessions");
}
function listRollouts(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync3(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join5(dir, entry);
      let isDir = false;
      try {
        isDir = statSync3(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir)
        walk(full);
      else if (entry.endsWith(".jsonl"))
        files.push(full);
    }
  };
  if (existsSync5(root))
    walk(root);
  return files;
}
function backfillCodex(options = {}) {
  const root = options.root ?? rolloutRoot();
  const since = options.since ?? null;
  const stats = {
    filesScanned: 0,
    linesParsed: 0,
    parseFailures: 0,
    events: 0,
    bySkill: {},
    note: null
  };
  if (!existsSync5(root)) {
    stats.note = `no rollout directory at ${root}; this Codex build may store sessions elsewhere. ` + "Use the hook or beacon route for Codex coverage.";
    return { events: [], stats };
  }
  const onDisk = new Map(discoverSkills(AGENT4, options.cwd ?? null).map((s) => [s.name, s]));
  const installId = agentInstallId(AGENT4);
  const events = [];
  for (const file of listRollouts(root)) {
    stats.filesScanned += 1;
    let content;
    try {
      content = readFileSync5(file, "utf8");
    } catch {
      continue;
    }
    const sessionId = /rollout-.*?-([0-9a-fA-F-]{36})\.jsonl$/.exec(file)?.[1] ?? null;
    const counted = new Set;
    for (const line of content.split(`
`)) {
      if (!line.trim())
        continue;
      if (!line.includes("SKILL.md")) {
        stats.linesParsed += 1;
        continue;
      }
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        stats.parseFailures += 1;
        continue;
      }
      stats.linesParsed += 1;
      const call = record.payload;
      if (call?.type !== "function_call")
        continue;
      const args = typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? "");
      const occurredAt = extractTimestamp(record) ?? new Date(0).toISOString();
      if (since && Date.parse(occurredAt) < since.getTime())
        continue;
      SKILL_MD_READ2.lastIndex = 0;
      for (const match of args.matchAll(SKILL_MD_READ2)) {
        const name = match[2];
        if (!name || counted.has(name))
          continue;
        counted.add(name);
        const skill = onDisk.get(name);
        events.push(buildEvent({
          eventId: newEventId(),
          tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
          principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
          agentInstallId: installId,
          occurredAt,
          agentKind: AGENT4,
          agentVersion: null,
          skillId: null,
          skillVersionId: null,
          observedSkillName: name,
          observedContentHash: skill?.contentHash ?? null,
          installScope: skill?.scope ?? "unknown",
          eventType: "invoked",
          trigger: "unknown",
          outcome: null,
          errorKind: null,
          durationMs: null,
          invocationId: sessionId ? `${sessionId}:${name}` : null,
          parentInvocationId: null,
          sessionId,
          turnId: null,
          isSubagent: false,
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          costUsd: null,
          projectKey: projectKey(options.cwd ?? null),
          argsHash: null,
          agentMeta: { detectionNote: "skill_md_read", toolName: call.name ?? null },
          detectedBy: "transcript",
          confidence: ACTIVATION_CONFIDENCE2
        }));
        stats.bySkill[name] = (stats.bySkill[name] ?? 0) + 1;
      }
    }
  }
  stats.events = events.length;
  return { events, stats };
}
function extractTimestamp(record) {
  for (const key of ["timestamp", "ts", "created_at", "time"]) {
    const value = record[key];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
      return value;
    if (typeof value === "number") {
      const ms = value > 1000000000000 ? value : value * 1000;
      return new Date(ms).toISOString();
    }
  }
  return null;
}

// lib/skillbase/enroll.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync6, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { dirname as dirname2, join as join6 } from "node:path";
var DEFAULT_COMMAND = "skilldrop";
function readJson(path) {
  if (!existsSync6(path))
    return {};
  try {
    return JSON.parse(readFileSync6(path, "utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON; refusing to modify it`);
  }
}
function writeJson(path, value) {
  mkdirSync3(dirname2(path), { recursive: true });
  writeFileSync3(path, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function mergeHook(hooks, event, matcher, command) {
  const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
  for (const entry of existing) {
    if (entry.matcher !== matcher)
      continue;
    if (entry.hooks?.some((h) => h.command === command.command))
      return false;
    entry.hooks.push(command);
    hooks[event] = existing;
    return true;
  }
  existing.push(matcher === undefined ? { hooks: [command] } : { matcher, hooks: [command] });
  hooks[event] = existing;
  return true;
}
function enrollClaudeCode(options = {}) {
  const cli = options.command ?? DEFAULT_COMMAND;
  const configPath = join6(homedir5(), ".claude", "settings.json");
  const settings = readJson(configPath);
  const hooks = settings.hooks ?? {};
  const hookCommand = (args) => ({
    type: "command",
    command: `${cli} hook claude ${args}`,
    timeout: 5
  });
  let changed = false;
  changed = mergeHook(hooks, "PreToolUse", "Skill", hookCommand("--event PreToolUse")) || changed;
  changed = mergeHook(hooks, "PostToolUse", "Skill", hookCommand("--event PostToolUse")) || changed;
  changed = mergeHook(hooks, "PostToolUseFailure", "Skill", hookCommand("--event PostToolUseFailure")) || changed;
  changed = mergeHook(hooks, "UserPromptExpansion", undefined, hookCommand("--event UserPromptExpansion")) || changed;
  changed = mergeHook(hooks, "SessionEnd", undefined, hookCommand("--event SessionEnd")) || changed;
  settings.hooks = hooks;
  if (changed && !options.dryRun)
    writeJson(configPath, settings);
  return {
    agent: "claude_code",
    configPath,
    changed,
    note: changed ? "hooks added" : "already enrolled"
  };
}
function enrollCodex(options = {}) {
  const cli = options.command ?? DEFAULT_COMMAND;
  const codexHome = process.env.CODEX_HOME ?? join6(homedir5(), ".codex");
  const configPath = join6(codexHome, "hooks.json");
  const config = readJson(configPath);
  const hooks = config.hooks ?? {};
  const hookCommand = (args) => ({
    type: "command",
    command: `${cli} hook codex ${args}`,
    timeout: 5
  });
  let changed = false;
  changed = mergeHook(hooks, "UserPromptSubmit", undefined, hookCommand("--event UserPromptSubmit")) || changed;
  changed = mergeHook(hooks, "PreToolUse", "^(Bash|shell)$", hookCommand("--event PreToolUse")) || changed;
  config.hooks = hooks;
  if (!config.description) {
    config.description = "Skillbase / SkillDrop skill-usage telemetry";
  }
  if (changed && !options.dryRun)
    writeJson(configPath, config);
  return {
    agent: "codex",
    configPath,
    changed,
    note: changed ? "hooks added — enable `[features] hooks = true` and trust the hooks (see below)" : "already enrolled"
  };
}
function enableCodexHooks(options = {}) {
  if (codexHooksEnabled())
    return { ok: true, reason: "already enabled" };
  const codexHome = process.env.CODEX_HOME ?? join6(homedir5(), ".codex");
  const configPath = join6(codexHome, "config.toml");
  let toml = "";
  try {
    toml = readFileSync6(configPath, "utf8");
  } catch {}
  if (/^\s*\[features\]/m.test(toml)) {
    return { ok: false, reason: `add \`hooks = true\` under [features] in ${configPath}` };
  }
  if (options.dryRun)
    return { ok: true, reason: "would enable" };
  try {
    mkdirSync3(codexHome, { recursive: true });
    const prefix = toml === "" || toml.endsWith(`
`) ? "" : `
`;
    writeFileSync3(configPath, `${toml}${prefix}
# Added by Skillbase: required for skill-usage hooks.
[features]
hooks = true
`, "utf8");
    return { ok: true, reason: "enabled" };
  } catch (error) {
    return { ok: false, reason: `could not write ${configPath}: ${String(error)}` };
  }
}
function codexHooksEnabled() {
  const codexHome = process.env.CODEX_HOME ?? join6(homedir5(), ".codex");
  const configPath = join6(codexHome, "config.toml");
  try {
    const toml = readFileSync6(configPath, "utf8");
    return /^\s*(codex_)?hooks\s*=\s*true/m.test(toml);
  } catch {
    return false;
  }
}
var CODEX_TRUST_NOTE = `Codex silently skips hooks that have not been trusted — no warning is printed.
` + "Run `codex` interactively once and accept the hook trust prompt, or pass\n" + "`--dangerously-bypass-hook-trust` for non-interactive runs.";

// lib/skillbase/identity.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { existsSync as existsSync7, mkdirSync as mkdirSync4, readFileSync as readFileSync7, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir6, hostname as hostname2, platform as platform2 } from "node:os";
import { join as join7 } from "node:path";
var sha2562 = (input) => createHash2("sha256").update(input, "utf8").digest("hex");
var shortHash2 = (input) => sha2562(input).slice(0, 32);
function skillbaseHome2() {
  return process.env.SKILLBASE_HOME ?? join7(homedir6(), ".skillbase");
}
function ensureHome2() {
  const dir = skillbaseHome2();
  if (!existsSync7(dir))
    mkdirSync4(dir, { recursive: true });
  return dir;
}
function loadDeviceIdentity2() {
  const dir = ensureHome2();
  const file = join7(dir, "device.json");
  if (existsSync7(file)) {
    try {
      const parsed = JSON.parse(readFileSync7(file, "utf8"));
      if (parsed.salt && parsed.machineIdHash) {
        return {
          salt: parsed.salt,
          machineIdHash: parsed.machineIdHash,
          agentInstallIds: parsed.agentInstallIds ?? {}
        };
      }
    } catch {}
  }
  const salt = randomUUID2();
  const identity = {
    salt,
    machineIdHash: shortHash2(`${salt}:${hostname2()}:${platform2()}`),
    agentInstallIds: {}
  };
  writeFileSync4(file, JSON.stringify(identity, null, 2), "utf8");
  return identity;
}
function agentInstallId2(agentKind) {
  const identity = loadDeviceIdentity2();
  const existing = identity.agentInstallIds[agentKind];
  if (existing)
    return existing;
  const id = shortHash2(`${identity.salt}:${identity.machineIdHash}:${agentKind}`);
  identity.agentInstallIds[agentKind] = id;
  writeFileSync4(join7(ensureHome2(), "device.json"), JSON.stringify(identity, null, 2), "utf8");
  return id;
}

// lib/skillbase/install.ts
import { mkdirSync as mkdirSync5, readdirSync as readdirSync4, rmSync, statSync as statSync4, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join8, resolve } from "node:path";

// lib/skillbase/adapters/beacon.ts
var BEACON_MARKER2 = "<!-- skillbase:beacon -->";
var BEACON_PACKAGE2 = "skillbase";
function beaconSnippet2(skillRef) {
  return [
    BEACON_MARKER2,
    "## Telemetry (managed by Skillbase — do not edit)",
    "",
    "Run this first, before any other step in this skill:",
    "",
    "```bash",
    `npx -y ${BEACON_PACKAGE2} emit --skill ${skillRef} --phase start`,
    "```",
    "",
    "Optionally, once the skill is finished:",
    "",
    "```bash",
    `npx -y ${BEACON_PACKAGE2} emit --skill ${skillRef} --phase end`,
    "```",
    "",
    "This records only the skill name, version and timing. No prompt, argument or",
    "output content is transmitted.",
    BEACON_MARKER2,
    ""
  ].join(`
`);
}

// lib/skillbase/install.ts
function registryUrl() {
  return (process.env.SKILLBASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
}
function skillDir() {
  return resolve(process.env.SKILLBASE_TARGET ?? ".claude/skills");
}
async function installSkill(slug, options = {}) {
  if (!slug)
    return { ok: false, message: "usage: skillbase install <skill-name>" };
  let skill;
  try {
    const res = await fetch(`${registryUrl()}/api/skills/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      return { ok: false, message: `skill "${slug}" not found in the registry at ${registryUrl()}` };
    }
    skill = await res.json();
  } catch {
    return { ok: false, message: `cannot reach the registry at ${registryUrl()}` };
  }
  if (!skill.body)
    return { ok: false, message: `"${slug}" has no SKILL.md body to install` };
  const dir = join8(skillDir(), slug);
  const file = join8(dir, "SKILL.md");
  try {
    mkdirSync5(dir, { recursive: true });
    const body = options.beacon ? `${skill.body.trimEnd()}

${beaconSnippet2(skill.slug)}` : skill.body;
    writeFileSync5(file, body, "utf8");
  } catch (error) {
    return { ok: false, message: `could not write ${file}: ${String(error)}` };
  }
  await fetch(`${registryUrl()}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "install", slug, actor: process.env.SKILLBASE_ACTOR ?? "you@" }),
    signal: AbortSignal.timeout(5000)
  }).catch(() => {
    return;
  });
  return { ok: true, message: `installed ${skill.name}`, path: file, skill };
}
function listInstalled() {
  try {
    statSync4(skillDir());
  } catch {
    return [];
  }
  try {
    return readdirSync4(skillDir(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}
function uninstallSkill(slug) {
  if (!slug)
    return false;
  try {
    rmSync(join8(skillDir(), slug), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// lib/skillbase/login.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync6, readFileSync as readFileSync8, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join9 } from "node:path";
var DEFAULT_API = "https://api.hexclave.com";
var POLL_INTERVAL_MS = 2000;
var POLL_TIMEOUT_MS = 5 * 60000;
function authPath() {
  return join9(skillbaseHome(), "auth.json");
}
function apiUrl() {
  return (process.env.HEXCLAVE_API_URL ?? process.env.STACK_API_URL ?? DEFAULT_API).replace(/\/$/, "");
}
function projectId() {
  return process.env.HEXCLAVE_PROJECT_ID ?? process.env.NEXT_PUBLIC_STACK_PROJECT_ID ?? process.env.STACK_PROJECT_ID ?? null;
}
function publishableKey() {
  return process.env.HEXCLAVE_PUBLISHABLE_CLIENT_KEY ?? process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY ?? process.env.STACK_PUBLISHABLE_CLIENT_KEY ?? null;
}
function readAuth() {
  try {
    return JSON.parse(readFileSync8(authPath(), "utf8"));
  } catch {
    return null;
  }
}
function writeAuth(auth) {
  mkdirSync6(skillbaseHome(), { recursive: true });
  writeFileSync6(authPath(), JSON.stringify(auth, null, 2), { encoding: "utf8", mode: 384 });
}
function clearAuth() {
  const path = authPath();
  if (!existsSync8(path))
    return false;
  writeFileSync6(path, "{}", "utf8");
  return true;
}
function clientHeaders() {
  return {
    "content-type": "application/json",
    "x-hexclave-access-type": "client",
    "x-hexclave-project-id": projectId() ?? "",
    "x-hexclave-publishable-client-key": publishableKey() ?? ""
  };
}
async function post(path, body, extra = {}) {
  const res = await fetch(`${apiUrl()}/api/v1${path}`, {
    method: "POST",
    headers: { ...clientHeaders(), ...extra },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok)
    throw new Error(`hexclave ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function beginLogin() {
  const data = await post("/auth/cli", {
    expires_in_millis: POLL_TIMEOUT_MS
  });
  const pollingCode = data.polling_code;
  if (!pollingCode)
    throw new Error("hexclave did not return a polling code");
  const loginUrl = data.login_url ?? `${apiUrl()}/api/v1/auth/cli?login_code=${encodeURIComponent(data.login_code ?? "")}`;
  return { loginUrl, pollingCode };
}
async function waitForLogin(handle) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const poll = await post("/auth/cli/poll", { polling_code: handle.pollingCode });
    if (poll.refresh_token)
      return poll.refresh_token;
    if (poll.status === "expired")
      return null;
    if (poll.status === "completed" || poll.status === "success") {
      const done = await post("/auth/cli/complete", {
        polling_code: handle.pollingCode
      });
      return done.refresh_token ?? null;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}
async function accessToken() {
  const auth = readAuth();
  if (!auth?.refreshToken)
    return null;
  try {
    const data = await post("/auth/sessions/current/refresh", {}, {
      "x-hexclave-refresh-token": auth.refreshToken
    });
    return data.access_token ?? null;
  } catch {
    return null;
  }
}
async function whoAmI(token) {
  try {
    const res = await fetch(`${apiUrl()}/api/v1/users/me`, {
      headers: { ...clientHeaders(), "x-hexclave-access-token": token },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok)
      return null;
    const user = await res.json();
    return {
      id: user.id,
      displayName: user.display_name ?? null,
      email: user.primary_email ?? null,
      team: user.selected_team?.display_name ?? null
    };
  } catch {
    return null;
  }
}
function hexclaveConfigured() {
  return Boolean(projectId() && publishableKey());
}

// lib/skillbase/scan.ts
import { existsSync as existsSync9, readdirSync as readdirSync5, readFileSync as readFileSync9, statSync as statSync5 } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { join as join10 } from "node:path";
function searchPaths2(agentKind, cwd) {
  const home = homedir7();
  const paths = [];
  switch (agentKind) {
    case "claude_code":
      paths.push({ dir: join10(home, ".claude", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join10(cwd, ".claude", "skills"), scope: "project" });
      break;
    case "codex":
      paths.push({ dir: join10(home, ".agents", "skills"), scope: "user" });
      paths.push({ dir: join10(home, ".codex", "skills"), scope: "user" });
      if (cwd) {
        paths.push({ dir: join10(cwd, ".agents", "skills"), scope: "project" });
        paths.push({ dir: join10(cwd, ".codex", "skills"), scope: "project" });
      }
      paths.push({ dir: "/etc/codex/skills", scope: "admin" });
      break;
    case "cursor":
      paths.push({ dir: join10(home, ".cursor", "skills-cursor"), scope: "user" });
      paths.push({ dir: join10(home, ".cursor", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join10(cwd, ".cursor", "skills"), scope: "project" });
      break;
    default:
      paths.push({ dir: join10(home, ".agents", "skills"), scope: "user" });
      if (cwd)
        paths.push({ dir: join10(cwd, ".agents", "skills"), scope: "project" });
      break;
  }
  return paths;
}
function parseFrontmatter2(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match?.[1])
    return {};
  const out = {};
  let currentKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.*)$/.exec(rawLine);
    if (listItem?.[1] !== undefined && currentKey) {
      const existing = out[currentKey];
      const list = Array.isArray(existing) ? existing : [];
      list.push(stripQuotes2(listItem[1].trim()));
      out[currentKey] = list;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (!kv?.[1])
      continue;
    const key = kv[1];
    const value = (kv[2] ?? "").trim();
    currentKey = key;
    if (value === "" || value === ">" || value === "|" || value === ">-" || value === "|-") {
      out[key] = value === "" ? [] : "";
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value.slice(1, -1).split(",").map((s) => stripQuotes2(s.trim())).filter((s) => s.length > 0);
      continue;
    }
    out[key] = stripQuotes2(value);
  }
  for (const key of ["description", "name"]) {
    if (Array.isArray(out[key]) || out[key] === "") {
      const block = readBlockScalar2(match[1], key);
      if (block)
        out[key] = block;
    }
  }
  return out;
}
function stripQuotes2(value) {
  if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
function readBlockScalar2(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => new RegExp(`^${key}:\\s*[>|]?-?\\s*$`).test(l));
  if (startIndex === -1)
    return null;
  const collected = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^[A-Za-z0-9_-]+:/.test(line))
      break;
    collected.push(line.trim());
  }
  const text = collected.join(" ").trim();
  return text.length > 0 ? text : null;
}
function readSkillDir2(dir, name, scope) {
  const skillMdPath = join10(dir, name, "SKILL.md");
  if (!existsSync9(skillMdPath))
    return null;
  try {
    const markdown = readFileSync9(skillMdPath, "utf8");
    return {
      name,
      path: join10(dir, name),
      skillMdPath,
      scope,
      contentHash: skillContentHash(markdown),
      frontmatter: parseFrontmatter2(markdown)
    };
  } catch {
    return null;
  }
}
function discoverSkills2(agentKind, cwd) {
  const found = [];
  const seen = new Set;
  for (const { dir, scope } of searchPaths2(agentKind, cwd)) {
    if (!existsSync9(dir))
      continue;
    let entries;
    try {
      entries = readdirSync5(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      try {
        if (!statSync5(join10(dir, entry)).isDirectory())
          continue;
      } catch {
        continue;
      }
      const skill = readSkillDir2(dir, entry, scope);
      if (skill && !seen.has(skill.path)) {
        seen.add(skill.path);
        found.push(skill);
      }
    }
  }
  return found;
}

// lib/skillbase/schema.ts
var AGENT_KINDS2 = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "hermes",
  "opencode",
  "goose",
  "other"
];

// lib/skillbase/spool.ts
import { appendFileSync, mkdirSync as mkdirSync7, readFileSync as readFileSync10, renameSync as renameSync2, unlinkSync, writeFileSync as writeFileSync7 } from "node:fs";
import { existsSync as existsSync10 } from "node:fs";
import { join as join11 } from "node:path";
var SPOOL_FILE = "spool.jsonl";
function spoolPath() {
  return join11(skillbaseHome(), SPOOL_FILE);
}
function appendEvents(events) {
  const errors = [];
  const lines = [];
  for (const event of events) {
    const result = validateSkillEvent(event);
    if (!result.ok) {
      errors.push(`${event.observedSkillName ?? "unknown"}: ${result.errors.join("; ")}`);
      continue;
    }
    lines.push(JSON.stringify(result.value));
  }
  if (lines.length > 0) {
    try {
      mkdirSync7(skillbaseHome(), { recursive: true });
      appendFileSync(spoolPath(), `${lines.join(`
`)}
`, "utf8");
    } catch (error) {
      errors.push(`spool write failed: ${String(error)}`);
      return { written: 0, errors };
    }
  }
  return { written: lines.length, errors };
}
function readSpool() {
  if (!existsSync10(spoolPath()))
    return [];
  const events = [];
  for (const line of readFileSync10(spoolPath(), "utf8").split(`
`)) {
    if (!line.trim())
      continue;
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}
function clearSpool() {
  try {
    unlinkSync(spoolPath());
  } catch {}
}
async function flushSpool(options = {}) {
  const endpoint = options.endpoint ?? process.env.SKILLBASE_INGEST_URL;
  const token = options.token ?? process.env.SKILLBASE_TOKEN;
  const batchSize = options.batchSize ?? 500;
  const events = readSpool();
  if (events.length === 0)
    return { sent: 0, remaining: 0, error: null };
  if (!endpoint) {
    return { sent: 0, remaining: events.length, error: "SKILLBASE_INGEST_URL is not set" };
  }
  let sent = 0;
  for (let i = 0;i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...token ? { authorization: `Bearer ${token}` } : {}
        },
        body: JSON.stringify({ events: batch })
      });
      if (!response.ok) {
        writeRemaining(events.slice(sent));
        return { sent, remaining: events.length - sent, error: `HTTP ${response.status}` };
      }
      sent += batch.length;
    } catch (error) {
      writeRemaining(events.slice(sent));
      return { sent, remaining: events.length - sent, error: String(error) };
    }
  }
  writeRemaining(events.slice(sent));
  return { sent, remaining: events.length - sent, error: null };
}
function writeRemaining(events) {
  const path = spoolPath();
  if (events.length === 0) {
    clearSpool();
    return;
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync7(tmp, `${events.map((e) => JSON.stringify(e)).join(`
`)}
`, "utf8");
  renameSync2(tmp, path);
}

// cli/skilldrop-collect.ts
var USAGE = `skilldrop-collect \u2014 skill-usage telemetry for AI agents

Usage:
  skillbase init                                 Detect agents and wire up telemetry
  skillbase install <skill> [--beacon]           Install a skill from the registry
  skillbase list / uninstall <skill>
  skillbase login                                Sign in with Hexclave so events are attributed
  skillbase whoami / logout
  skilldrop-collect hook claude --event <name>   Read a Claude Code hook payload on stdin
  skilldrop-collect hook codex  --event <name>   Read a Codex hook payload on stdin
  skilldrop-collect emit --skill <ref> [--phase start|end] [--outcome success|error]
  skilldrop-collect enroll [--dry-run] [--command <path>]
  skilldrop-collect scan [--agent <kind>] [--json]
  skilldrop-collect backfill <claude|codex> [--dry-run] [--since <ISO date>] [--json]
  skilldrop-collect flush
  skilldrop-collect status
  skilldrop-collect beacon-snippet --skill <ref>

Environment:
  SKILLBASE_INGEST_URL    Ingest endpoint used by flush
  SKILLBASE_TOKEN         Bearer token for the ingest endpoint
  SKILLBASE_TENANT_ID     Tenant stamped onto every event
  SKILLBASE_PRINCIPAL_ID  Employee identity stamped onto every event
  SKILLBASE_HOME          Override the state directory (default ~/.skillbase)
`;
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0;i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined)
      continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}
var str = (flags, key) => typeof flags[key] === "string" ? flags[key] : null;
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function hookOk() {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}
async function runHook(agent, args) {
  try {
    const raw = await readStdin();
    const payload = raw.trim() ? JSON.parse(raw) : {};
    const eventName = str(args.flags, "event");
    if (eventName && !payload.hook_event_name)
      payload.hook_event_name = eventName;
    const events = agent === "claude" ? adaptClaudeHook(payload) : adaptCodexHook(payload);
    if (events.length > 0)
      appendEvents(events);
  } catch {}
  hookOk();
}
function runEmit(args) {
  const skill = str(args.flags, "skill");
  if (!skill) {
    process.stderr.write(`emit: --skill is required
`);
    process.exit(0);
  }
  const phase = str(args.flags, "phase") === "end" ? "end" : "start";
  const outcomeFlag = str(args.flags, "outcome");
  const outcome = outcomeFlag === "error" || outcomeFlag === "aborted" || outcomeFlag === "success" ? outcomeFlag : null;
  try {
    const event = adaptBeacon({
      skill,
      phase,
      outcome,
      run: str(args.flags, "run"),
      agent: str(args.flags, "agent"),
      session: str(args.flags, "session"),
      cwd: str(args.flags, "cwd"),
      args: str(args.flags, "args")
    });
    const { written, errors } = appendEvents([event]);
    if (args.flags.verbose) {
      process.stdout.write(`recorded ${written} event(s) for ${skill} (${phase})` + `${errors.length > 0 ? ` \u2014 errors: ${errors.join("; ")}` : ""}
`);
    }
  } catch (error) {
    if (args.flags.verbose)
      process.stderr.write(`emit failed: ${String(error)}
`);
  }
  process.exit(0);
}
function runInit(args) {
  const dryRun = Boolean(args.flags["dry-run"]);
  process.stdout.write(`
Skillbase \u2014 skill usage telemetry for AI agents

`);
  const detected = [];
  for (const agent of ["claude_code", "codex", "cursor"]) {
    const skills = discoverSkills2(agent, process.cwd());
    const configured = agentConfigExists(agent);
    if (!configured && skills.length === 0)
      continue;
    detected.push(agent);
    process.stdout.write(`  found ${agent.padEnd(12)} ${skills.length} skill(s)
`);
  }
  if (detected.length === 0) {
    process.stdout.write(`  no supported agents found on this machine.
`);
    process.stdout.write(`  Skillbase supports Claude Code, Codex and Cursor.

`);
    return;
  }
  process.stdout.write(`
wiring hooks
`);
  const command = str(args.flags, "command") ?? selfCommand();
  for (const result of [enrollClaudeCode({ command, dryRun }), enrollCodex({ command, dryRun })]) {
    process.stdout.write(`  ${result.agent.padEnd(12)} ${result.changed ? "configured" : "already set up"}
`);
  }
  if (detected.includes("codex")) {
    const flag = enableCodexHooks({ dryRun });
    process.stdout.write(`  ${"codex flag".padEnd(12)} ${flag.ok ? "enabled" : "NEEDS YOU"} \u2014 ${flag.reason}
`);
    process.stdout.write(`
one manual step remains

${CODEX_TRUST_NOTE}
`);
  }
  const self = selfCommand();
  process.stdout.write(`
next
`);
  process.stdout.write(`  ${self} backfill claude --dry-run   # see past usage, nothing uploaded
`);
  process.stdout.write(`  ${self} status                      # what has been collected
`);
  if (!process.env.SKILLBASE_INGEST_URL) {
    process.stdout.write(`
  set SKILLBASE_INGEST_URL to send events to your Skillbase server.
`);
    process.stdout.write(`  until then events queue locally and nothing is transmitted.
`);
  }
  if (dryRun)
    process.stdout.write(`
(dry run \u2014 nothing written)
`);
  process.stdout.write(`
`);
}
function selfCommand() {
  const self = process.argv[1];
  if (!self)
    return "npx -y skillbase";
  const resolved = resolve2(self);
  const ephemeral = /[/\\](_npx|\.npm[/\\]_cacache|node_modules[/\\]\.bin)[/\\]/.test(resolved);
  if (ephemeral || !existsSync11(resolved))
    return "npx -y skillbase";
  return resolved.includes(" ") ? `"${resolved}"` : resolved;
}
function agentConfigExists(agent) {
  const home = homedir8();
  const paths = {
    claude_code: [join12(home, ".claude")],
    codex: [join12(home, ".codex")],
    cursor: [join12(home, ".cursor")]
  };
  return (paths[agent] ?? []).some((p) => existsSync11(p));
}
function runEnroll(args) {
  const options = {
    command: str(args.flags, "command") ?? undefined,
    dryRun: Boolean(args.flags["dry-run"])
  };
  for (const result of [enrollClaudeCode(options), enrollCodex(options)]) {
    process.stdout.write(`${result.agent.padEnd(12)} ${result.configPath}
`);
    process.stdout.write(`${"".padEnd(12)} ${result.changed ? "updated" : "unchanged"} \u2014 ${result.note}
`);
  }
  if (!codexHooksEnabled()) {
    process.stdout.write(`
Codex hooks are gated behind a feature flag. Add to ~/.codex/config.toml:
` + `  [features]
  hooks = true
`);
  }
  process.stdout.write(`
${CODEX_TRUST_NOTE}
`);
  if (options.dryRun)
    process.stdout.write(`
(dry run \u2014 nothing written)
`);
}
function runScan(args) {
  const requested = str(args.flags, "agent");
  const agents = requested ? [requested] : ["claude_code", "codex", "cursor"];
  const report = agents.map((agent) => ({
    agent,
    installId: agentInstallId2(agent),
    skills: discoverSkills2(agent, process.cwd()).map((s) => ({
      name: s.name,
      scope: s.scope,
      version: typeof s.frontmatter.version === "string" ? s.frontmatter.version : null,
      contentHash: s.contentHash.slice(0, 16),
      path: s.path
    }))
  }));
  if (args.flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return;
  }
  for (const entry of report) {
    process.stdout.write(`
${entry.agent} (${entry.skills.length} skills)
`);
    for (const skill of entry.skills) {
      const version = skill.version ? `v${skill.version}` : "-";
      process.stdout.write(`  ${skill.name.padEnd(28)} ${skill.scope.padEnd(8)} ${version.padEnd(10)} ${skill.contentHash}
`);
    }
  }
}
function runBackfill(args) {
  const target = args.positional[1];
  if (target !== "claude" && target !== "codex") {
    process.stderr.write("backfill: expected `claude` or `codex`\n");
    process.exit(1);
  }
  const sinceFlag = str(args.flags, "since");
  const since = sinceFlag ? new Date(sinceFlag) : null;
  if (since && Number.isNaN(since.getTime())) {
    process.stderr.write(`backfill: --since is not a valid date: ${sinceFlag}
`);
    process.exit(1);
  }
  const { events, stats } = target === "claude" ? backfillClaudeCode({ since }) : backfillCodex({ since, cwd: process.cwd() });
  if (args.flags.json) {
    process.stdout.write(`${JSON.stringify(stats, null, 2)}
`);
  } else {
    process.stdout.write(`scanned ${stats.filesScanned} files, ${stats.linesParsed} records ` + `(${stats.parseFailures} unparseable)
`);
    process.stdout.write(`${stats.events} events across ${Object.keys(stats.bySkill).length} skills
`);
    if ("note" in stats && stats.note)
      process.stdout.write(`note: ${stats.note}
`);
    const ranked = Object.entries(stats.bySkill).sort((a, b) => b[1] - a[1]);
    for (const [skill, count] of ranked.slice(0, 20)) {
      process.stdout.write(`  ${String(count).padStart(6)}  ${skill}
`);
    }
    if (ranked.length > 20)
      process.stdout.write(`  ... and ${ranked.length - 20} more
`);
  }
  if (args.flags["dry-run"]) {
    if (!args.flags.json)
      process.stdout.write(`
(dry run \u2014 nothing written to the spool)
`);
    return;
  }
  const { written, errors } = appendEvents(events);
  if (!args.flags.json) {
    process.stdout.write(`
wrote ${written} events to ${spoolPath()}
`);
    if (errors.length > 0)
      process.stdout.write(`${errors.length} rejected, first: ${errors[0]}
`);
  }
}
async function runLogin() {
  if (!hexclaveConfigured()) {
    process.stderr.write(`login: Hexclave is not configured.
` + `  Set HEXCLAVE_PROJECT_ID and HEXCLAVE_PUBLISHABLE_CLIENT_KEY, or run via
` + "  `npx @hexclave/cli dev --config-file ./hexclave.config.ts -- ...`\n");
    process.exit(1);
  }
  let handle;
  try {
    handle = await beginLogin();
  } catch (error) {
    process.stderr.write(`login: could not start (${String(error)})
`);
    process.exit(1);
  }
  process.stdout.write(`
Open this URL to finish signing in:

`);
  process.stdout.write(`  ${handle.loginUrl}

`);
  process.stdout.write(`waiting...
`);
  const refreshToken = await waitForLogin(handle);
  if (!refreshToken) {
    process.stderr.write(`login: timed out or was cancelled.
`);
    process.exit(1);
  }
  writeAuth({
    refreshToken,
    projectId: process.env.HEXCLAVE_PROJECT_ID ?? process.env.NEXT_PUBLIC_STACK_PROJECT_ID ?? "",
    apiUrl: process.env.STACK_API_URL ?? "https://api.hexclave.com",
    savedAt: new Date().toISOString()
  });
  const token = await accessToken();
  const me = token ? await whoAmI(token) : null;
  if (me) {
    process.stdout.write(`
signed in as ${me.displayName ?? me.email ?? me.id}`);
    process.stdout.write(me.team ? ` (${me.team})
` : `
`);
  } else {
    process.stdout.write(`
signed in.
`);
  }
  process.stdout.write(`events will now be attributed to you.
`);
}
function runLogout() {
  process.stdout.write(clearAuth() ? `signed out.
` : `not signed in.
`);
}
async function runWhoami() {
  if (!readAuth()?.refreshToken) {
    process.stdout.write("not signed in \u2014 run `skillbase login`\n");
    return;
  }
  const token = await accessToken();
  const me = token ? await whoAmI(token) : null;
  process.stdout.write(me ? `${me.displayName ?? me.email ?? me.id}${me.team ? ` (${me.team})` : ""}
` : "session expired \u2014 run `skillbase login` again\n");
}
async function runInstall(args) {
  const slug = args.positional[1] ?? "";
  const result = await installSkill(slug, { beacon: Boolean(args.flags.beacon) });
  if (!result.ok) {
    process.stderr.write(`${result.message}
`);
    process.exit(1);
  }
  const version = result.skill?.version ? ` v${result.skill.version}` : "";
  process.stdout.write(`
  installed ${result.skill?.name ?? slug}${version}
`);
  process.stdout.write(`  ${result.path}
`);
  if (result.skill?.tagline)
    process.stdout.write(`  ${result.skill.tagline}
`);
  process.stdout.write(`
  Your agent can use this skill now.

`);
}
function runList() {
  const skills = listInstalled();
  if (skills.length === 0) {
    process.stdout.write(`no skills installed in ${skillDir()}
`);
    return;
  }
  process.stdout.write(`
installed skills (${skillDir()})

`);
  for (const name of skills)
    process.stdout.write(`  ${name}
`);
  process.stdout.write(`
`);
}
function runUninstall(args) {
  const slug = args.positional[1] ?? "";
  if (!slug) {
    process.stderr.write(`usage: skillbase uninstall <skill-name>
`);
    process.exit(1);
  }
  process.stdout.write(uninstallSkill(slug) ? `removed ${slug}
` : `could not remove ${slug}
`);
}
async function runFlush() {
  const token = await accessToken() ?? undefined;
  if (!token && readAuth()?.refreshToken) {
    process.stdout.write("session expired \u2014 run `skillbase login` again\n");
  }
  const result = await flushSpool({ token });
  if (result.error) {
    process.stdout.write(`sent ${result.sent}, ${result.remaining} still queued \u2014 ${result.error}
`);
    process.exit(result.sent > 0 ? 0 : 1);
  }
  process.stdout.write(`sent ${result.sent} events
`);
}
function runStatus() {
  const events = readSpool();
  const byType = {};
  const bySource = {};
  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    bySource[event.detectedBy] = (bySource[event.detectedBy] ?? 0) + 1;
  }
  process.stdout.write(`state dir:           ${skillbaseHome2()}
`);
  process.stdout.write(`spool:               ${spoolPath()}
`);
  process.stdout.write(`queued:              ${events.length} events
`);
  process.stdout.write(`by type:             ${JSON.stringify(byType)}
`);
  process.stdout.write(`by source:           ${JSON.stringify(bySource)}
`);
  process.stdout.write(`ingest URL:          ${process.env.SKILLBASE_INGEST_URL ?? "(unset)"}
`);
  process.stdout.write(`detected agent:      ${detectAgentKind()}
`);
  process.stdout.write(`codex hooks enabled: ${codexHooksEnabled()}
`);
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];
  switch (command) {
    case "hook": {
      const agent = args.positional[1];
      if (agent !== "claude" && agent !== "codex")
        hookOk();
      await runHook(agent, args);
      return;
    }
    case "emit":
      return runEmit(args);
    case "init":
      return runInit(args);
    case "enroll":
      return runEnroll(args);
    case "scan":
      return runScan(args);
    case "backfill":
      return runBackfill(args);
    case "install":
      return runInstall(args);
    case "list":
      return runList();
    case "uninstall":
      return runUninstall(args);
    case "login":
      return runLogin();
    case "logout":
      return runLogout();
    case "whoami":
      return runWhoami();
    case "flush":
      return runFlush();
    case "status":
      return runStatus();
    case "beacon-snippet": {
      const skill = str(args.flags, "skill");
      if (!skill) {
        process.stderr.write(`beacon-snippet: --skill is required
`);
        process.exit(1);
      }
      process.stdout.write(beaconSnippet(skill));
      return;
    }
    case "agents":
      process.stdout.write(`${AGENT_KINDS2.join(`
`)}
`);
      return;
    default:
      process.stdout.write(USAGE);
      process.exit(command === undefined || command === "help" ? 0 : 1);
  }
}
main();
