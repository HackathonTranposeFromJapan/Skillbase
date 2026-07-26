import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every module reads SKILLBASE_HOME lazily, so pointing it at a scratch dir
// keeps the tests from touching the developer's real telemetry state.
const TEST_HOME = mkdtempSync(join(tmpdir(), 'skillbase-test-'));
process.env.SKILLBASE_HOME = TEST_HOME;
delete process.env.SKILLBASE_TENANT_ID;
delete process.env.SKILLBASE_PRINCIPAL_ID;

const { adaptBeacon, parseSkillRef, beaconSnippet } = await import('../lib/skillbase/adapters/beacon.ts');
const { adaptClaudeHook } = await import('../lib/skillbase/adapters/claude-code.ts');
const { adaptCodexHook } = await import('../lib/skillbase/adapters/codex.ts');
const { buildDedupeKey, buildMergeKey, skillContentHash } = await import('../lib/skillbase/identity.ts');
const { parseFrontmatter } = await import('../lib/skillbase/scan.ts');
const { validateSkillEvent, SOURCE_CONFIDENCE } = await import('../lib/skillbase/schema.ts');
const { appendEvents, clearSpool, readSpool } = await import('../lib/skillbase/spool.ts');

afterAll(() => rmSync(TEST_HOME, { recursive: true, force: true }));

const preToolUse = (skill: string, sessionId: string, toolUseId: string) => ({
  hook_event_name: 'PreToolUse',
  session_id: sessionId,
  tool_name: 'Skill',
  tool_use_id: toolUseId,
  tool_input: { skill },
});

describe('SkillEvent schema', () => {
  test('accepts a well-formed event from an adapter', () => {
    const [event] = adaptClaudeHook(preToolUse('handoff', 'v-1', 'tu-1'));
    expect(event).toBeDefined();
    const result = validateSkillEvent(event);
    expect(result.ok).toBe(true);
  });

  test('rejects an unknown agent kind', () => {
    const [event] = adaptClaudeHook(preToolUse('handoff', 'v-2', 'tu-2'));
    const result = validateSkillEvent({ ...event, agentKind: 'jarvis' });
    expect(result.ok).toBe(false);
  });

  test('rejects free-text fields so metadata-only cannot regress', () => {
    const [event] = adaptClaudeHook(preToolUse('handoff', 'v-3', 'tu-3'));
    for (const banned of ['args', 'prompt', 'output', 'content']) {
      const result = validateSkillEvent({ ...event, [banned]: 'leaked user text' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join()).toContain(banned);
    }
  });

  test('rejects a confidence outside [0,1]', () => {
    const [event] = adaptClaudeHook(preToolUse('handoff', 'v-4', 'tu-4'));
    expect(validateSkillEvent({ ...event, confidence: 1.5 }).ok).toBe(false);
  });
});

describe('Claude Code adapter', () => {
  test('a model-selected skill is model_auto', () => {
    const [event] = adaptClaudeHook(preToolUse('handoff', 'cc-1', 'tu-a'));
    expect(event?.trigger).toBe('model_auto');
    expect(event?.eventType).toBe('invoked');
    expect(event?.detectedBy).toBe('hook');
    expect(event?.confidence).toBe(SOURCE_CONFIDENCE.hook);
  });

  test('a typed command is explicit_command, and is counted exactly once', () => {
    const fromExpansion = adaptClaudeHook({
      hook_event_name: 'UserPromptExpansion',
      session_id: 'cc-2',
      command_name: 'research',
    });
    // The expansion only leaves a marker; emitting here would double-count.
    expect(fromExpansion).toHaveLength(0);

    const events = adaptClaudeHook(preToolUse('research', 'cc-2', 'tu-b'));
    expect(events).toHaveLength(1);
    expect(events[0]?.trigger).toBe('explicit_command');
  });

  test('an unconsumed command is flushed at session end, so it is never lost', () => {
    adaptClaudeHook({
      hook_event_name: 'UserPromptExpansion',
      session_id: 'cc-3',
      command_name: 'imagegen',
    });
    const flushed = adaptClaudeHook({ hook_event_name: 'SessionEnd', session_id: 'cc-3' });
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.observedSkillName).toBe('imagegen');
    expect(flushed[0]?.trigger).toBe('explicit_command');
  });

  test('a session end after the tool call fired flushes nothing', () => {
    adaptClaudeHook({
      hook_event_name: 'UserPromptExpansion',
      session_id: 'cc-4',
      command_name: 'research',
    });
    adaptClaudeHook(preToolUse('research', 'cc-4', 'tu-c'));
    expect(adaptClaudeHook({ hook_event_name: 'SessionEnd', session_id: 'cc-4' })).toHaveLength(0);
  });

  test('completion pairs with its invocation and yields a duration', () => {
    const start = new Date('2026-07-26T10:00:00.000Z');
    const end = new Date('2026-07-26T10:00:04.500Z');
    adaptClaudeHook(preToolUse('handoff', 'cc-5', 'tu-d'), start);

    const [completed] = adaptClaudeHook(
      {
        hook_event_name: 'PostToolUse',
        session_id: 'cc-5',
        tool_name: 'Skill',
        tool_use_id: 'tu-d',
        tool_input: { skill: 'handoff' },
        tool_response_is_error: false,
      },
      end,
    );
    expect(completed?.eventType).toBe('completed');
    expect(completed?.outcome).toBe('success');
    expect(completed?.durationMs).toBe(4500);
  });

  test('a failed skill is recorded as failed', () => {
    adaptClaudeHook(preToolUse('handoff', 'cc-6', 'tu-e'));
    const [failed] = adaptClaudeHook({
      hook_event_name: 'PostToolUse',
      session_id: 'cc-6',
      tool_name: 'Skill',
      tool_use_id: 'tu-e',
      tool_input: { skill: 'handoff' },
      tool_response_is_error: true,
    });
    expect(failed?.eventType).toBe('failed');
    expect(failed?.outcome).toBe('error');
  });

  test('tools other than Skill are ignored', () => {
    const events = adaptClaudeHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cc-7',
      tool_name: 'Bash',
      tool_use_id: 'tu-f',
      tool_input: { skill: undefined },
    });
    expect(events).toHaveLength(0);
  });

  test('a subagent invocation is marked as one', () => {
    const [event] = adaptClaudeHook({
      ...preToolUse('handoff', 'cc-8', 'tu-g'),
      agent_id: 'agent-123',
      agent_type: 'Explore',
    });
    expect(event?.isSubagent).toBe(true);
    expect(event?.trigger).toBe('subagent');
  });
});

describe('Codex adapter', () => {
  test('a $mention names the skill without retaining the prompt', () => {
    const [event] = adaptCodexHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'cx-1',
      prompt: 'please use $agent-reach on this confidential customer list',
    });
    expect(event?.observedSkillName).toBe('agent-reach');
    expect(event?.trigger).toBe('explicit_command');
    expect(JSON.stringify(event)).not.toContain('confidential');
  });

  test('reading SKILL.md from a Codex skills directory is the activation', () => {
    // How Codex actually loads a skill, observed in real rollout files. Shell is
    // the one tool its PreToolUse hook fires for, which is what makes skill use
    // detectable on Codex at all.
    const [event] = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-act-1',
      tool_name: 'Bash',
      tool_input: { command: "sed -n '1,240p' /home/node/.agents/skills/agent-reach/SKILL.md" },
    });
    expect(event?.observedSkillName).toBe('agent-reach');
    expect(event?.eventType).toBe('invoked');
    expect(event?.agentMeta.detectionNote).toBe('skill_md_read');
    expect(event?.confidence).toBe(0.95);
  });

  test('the skill name is recovered even if the skill is no longer on disk', () => {
    const [event] = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-act-2',
      tool_name: 'Bash',
      tool_input: { command: 'cat /home/node/.agents/skills/deleted-skill/SKILL.md' },
    });
    expect(event?.observedSkillName).toBe('deleted-skill');
    expect(event?.observedContentHash).toBeNull();
  });

  test('reading a skill outside Codex discovery paths is authoring, not use', () => {
    // `.claude/skills` is not a Codex skill root, so a read there is somebody
    // editing a skill. Counting it produced 242 false invocations across 51
    // skills on real data.
    const events = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-act-3',
      tool_name: 'Bash',
      tool_input: { command: 'cat /IdeaProjects/AstarSite/.claude/skills/auto-site/SKILL.md' },
    });
    expect(events).toHaveLength(0);
  });

  test('one activation per skill per session, however many files it touches', () => {
    const first = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-act-4',
      tool_name: 'Bash',
      tool_input: { command: 'cat /home/node/.agents/skills/agent-reach/SKILL.md' },
    });
    const second = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-act-4',
      tool_name: 'Bash',
      tool_input: { command: 'cat /home/node/.agents/skills/agent-reach/references/x.md' },
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  test('a beacon command is not counted twice by the shell hook', () => {
    const events = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-2',
      tool_name: 'Bash',
      tool_input: { command: 'npx -y skilldrop emit --skill acme/find-skills --phase start' },
    });
    expect(events).toHaveLength(0);
  });

  test('an unrelated shell command produces nothing', () => {
    const events = adaptCodexHook({
      hook_event_name: 'PreToolUse',
      session_id: 'cx-3',
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    });
    expect(events).toHaveLength(0);
  });
});

describe('beacon', () => {
  test('parses a fully qualified skill reference', () => {
    expect(parseSkillRef('acme/prod-db@1.4.0')).toEqual({
      skillId: 'acme/prod-db',
      name: 'prod-db',
      version: '1.4.0',
    });
  });

  test('parses a bare directory name', () => {
    expect(parseSkillRef('handoff')).toEqual({ skillId: null, name: 'handoff', version: null });
  });

  test('carries the registry id it was published under', () => {
    const event = adaptBeacon({ skill: 'acme/handoff@2.0.0', phase: 'start', session: 'b-1' });
    expect(event.skillId).toBe('acme/handoff');
    expect(event.agentMeta.declaredVersion).toBe('2.0.0');
    expect(event.detectedBy).toBe('beacon');
  });

  test('is trusted below direct observation because the model may skip it', () => {
    const event = adaptBeacon({ skill: 'acme/handoff', phase: 'start', session: 'b-2' });
    expect(event.confidence).toBeLessThan(SOURCE_CONFIDENCE.hook);
  });

  test('start mints a run id that end reclaims, with no id threaded by the model', () => {
    const start = adaptBeacon(
      { skill: 'acme/handoff', phase: 'start', session: 'b-3' },
      new Date('2026-07-26T10:00:00.000Z'),
    );
    const end = adaptBeacon(
      { skill: 'acme/handoff', phase: 'end', session: 'b-3' },
      new Date('2026-07-26T10:00:07.000Z'),
    );
    expect(start.invocationId).toBeTruthy();
    expect(end.invocationId).toBe(start.invocationId);
    expect(end.durationMs).toBe(7000);
    expect(end.eventType).toBe('completed');
  });

  test('a reported failure is recorded as failed', () => {
    const event = adaptBeacon({ skill: 'acme/handoff', phase: 'end', outcome: 'error', session: 'b-4' });
    expect(event.eventType).toBe('failed');
    expect(event.outcome).toBe('error');
  });

  test('the injected snippet asks for the start call and names no variables', () => {
    const snippet = beaconSnippet('acme/prod-db@1.0.0');
    expect(snippet).toContain('emit --skill acme/prod-db@1.0.0 --phase start');
    expect(snippet).not.toContain('$SKILLDROP_RUN');
  });
});

describe('deduplication', () => {
  const base = {
    detectedBy: 'hook',
    agentInstallId: 'install-1',
    sessionId: 's-1',
    invocationId: 'tu-1',
    observedSkillName: 'handoff',
    eventType: 'invoked',
    occurredAt: '2026-07-26T10:00:00.000Z',
  };

  test('the same observation resent collapses to one key', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
  });

  test('invoke and complete of one run stay distinct', () => {
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, eventType: 'completed' }));
  });

  test('hook and transcript views of one run stay separate rows', () => {
    // Deliberate: comparing the two is how beacon compliance gets measured.
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, detectedBy: 'transcript' }));
  });

  test('different sources of one run share a merge key', () => {
    // The beacon cannot see the agent's tool_use_id, so the merge key must not
    // depend on the invocation id at all.
    const { invocationId: _hookId, ...mergeInputs } = base;
    expect(buildMergeKey(mergeInputs)).toBe(buildMergeKey({ ...mergeInputs }));
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, invocationId: 'run-xyz' }));
  });

  test('different skills never merge', () => {
    expect(buildMergeKey(base)).not.toBe(buildMergeKey({ ...base, observedSkillName: 'research' }));
  });
});

describe('content hashing', () => {
  test('line endings and trailing whitespace do not change identity', () => {
    const unix = '---\nname: x\n---\n\nBody line\n';
    const windows = '---\r\nname: x\r\n---\r\n\r\nBody line   \r\n';
    expect(skillContentHash(unix)).toBe(skillContentHash(windows));
  });

  test('an edit to the body changes identity', () => {
    expect(skillContentHash('---\nname: x\n---\nA')).not.toBe(skillContentHash('---\nname: x\n---\nB'));
  });
});

describe('frontmatter parsing', () => {
  test('reads the fields the Agent Skills spec defines', () => {
    const fm = parseFrontmatter(
      ['---', 'name: prod-db', 'description: Run SQL against production.', 'version: 1.4.0', 'license: MIT', 'tags: [database, ops]', '---', '# Body'].join('\n'),
    );
    expect(fm.name).toBe('prod-db');
    expect(fm.version).toBe('1.4.0');
    expect(fm.license).toBe('MIT');
    expect(fm.tags).toEqual(['database', 'ops']);
  });

  test('reads a folded description block', () => {
    const fm = parseFrontmatter(
      ['---', 'name: handoff', 'description: >', '  Stage a session handoff', '  for the next session.', '---'].join('\n'),
    );
    expect(fm.description).toBe('Stage a session handoff for the next session.');
  });

  test('reads a list written in block form', () => {
    const fm = parseFrontmatter(['---', 'name: x', 'authors:', '  - alice', '  - bob', '---'].join('\n'));
    expect(fm.authors).toEqual(['alice', 'bob']);
  });

  test('a file with no frontmatter yields no fields', () => {
    expect(parseFrontmatter('# Just a heading')).toEqual({});
  });
});

describe('spool', () => {
  beforeEach(() => clearSpool());

  test('valid events round-trip through the spool file', () => {
    const events = adaptClaudeHook(preToolUse('handoff', 'sp-1', 'tu-sp1'));
    const { written, errors } = appendEvents(events);
    expect(written).toBe(1);
    expect(errors).toHaveLength(0);
    expect(readSpool()[0]?.observedSkillName).toBe('handoff');
  });

  test('an invalid event is rejected without discarding the valid ones', () => {
    const [valid] = adaptClaudeHook(preToolUse('handoff', 'sp-2', 'tu-sp2'));
    const invalid = { ...valid, agentKind: 'nonsense' } as unknown as typeof valid;
    const { written, errors } = appendEvents([valid as NonNullable<typeof valid>, invalid]);
    expect(written).toBe(1);
    expect(errors).toHaveLength(1);
  });
});
