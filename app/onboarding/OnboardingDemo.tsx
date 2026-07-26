"use client";

import { useEffect, useState } from "react";

type SkillStatus = "covered" | "at-risk" | "assigned" | "verified";

type Capability = {
  name: string;
  owner: string;
  backup: string | null;
  critical: boolean;
};

const CAPABILITIES: Capability[] = [
  { name: "Standard refunds", owner: "Maya", backup: "Omar", critical: false },
  { name: "Refund exceptions", owner: "Maya", backup: null, critical: true },
  { name: "Replacement orders", owner: "Maya", backup: "Priya", critical: false },
  { name: "Escalation handoff", owner: "Maya", backup: null, critical: true },
  { name: "Customer verification", owner: "Priya", backup: "Omar", critical: false },
  { name: "Billing incident triage", owner: "Maya", backup: null, critical: true },
];

const ONBOARDING_PLAN = [
  { day: "Day 1", name: "Handle a refund exception", source: "Maya’s 47 successful runs" },
  { day: "Day 2", name: "Write an escalation handoff", source: "Maya’s support workflow" },
  { day: "Day 3", name: "Triage a billing incident", source: "Finance-approved playbook" },
];

const RUN_STEPS = [
  "Read the customer request",
  "Find the order and verify identity",
  "Apply the company refund policy",
  "Request manager approval",
  "Draft the response and log the handoff",
];

function statusFor(
  capability: Capability,
  pto: boolean,
  planGenerated: boolean,
  completed: boolean,
): SkillStatus {
  if (capability.name === "Refund exceptions" && completed) return "verified";
  if (capability.critical && capability.owner === "Maya" && pto) {
    return planGenerated ? "assigned" : "at-risk";
  }
  return "covered";
}

function statusCopy(status: SkillStatus) {
  if (status === "at-risk") return "blocked";
  if (status === "assigned") return "assigned to Alex";
  if (status === "verified") return "Alex verified";
  return "covered";
}

function statusClasses(status: SkillStatus) {
  if (status === "at-risk") return "border-rose-400/25 bg-rose-400/8 text-rose-300";
  if (status === "assigned") return "border-amber-400/25 bg-amber-400/8 text-amber-300";
  if (status === "verified") return "border-accent-500/30 bg-accent-500/10 text-accent-400";
  return "border-white/8 bg-white/3 text-mute-300";
}

export function OnboardingDemo() {
  const [pto, setPto] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [runStep, setRunStep] = useState(-1);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (runStep < 0 || awaitingApproval || completed) return;

    if (runStep === 3) {
      const approvalTimer = window.setTimeout(() => setAwaitingApproval(true), 520);
      return () => window.clearTimeout(approvalTimer);
    }

    if (runStep >= RUN_STEPS.length - 1) {
      const completionTimer = window.setTimeout(() => setCompleted(true), 620);
      return () => window.clearTimeout(completionTimer);
    }

    const timer = window.setTimeout(() => setRunStep((step) => step + 1), 620);
    return () => window.clearTimeout(timer);
  }, [runStep, awaitingApproval, completed]);

  const readiness = completed ? 58 : planGenerated ? 47 : 31;
  const coverage = completed ? 72 : planGenerated ? 68 : pto ? 61 : 82;
  const singleOwner = completed ? 2 : 3;

  function simulatePto() {
    setPto(true);
    setPlanGenerated(false);
    setRunStep(-1);
    setAwaitingApproval(false);
    setCompleted(false);
  }

  function generatePlan() {
    setPto(true);
    setPlanGenerated(true);
    setRunStep(-1);
    setAwaitingApproval(false);
    setCompleted(false);
  }

  function startRun() {
    setCompleted(false);
    setAwaitingApproval(false);
    setRunStep(0);
  }

  function approveRun() {
    setAwaitingApproval(false);
    setRunStep(4);
  }

  function reset() {
    setPto(false);
    setPlanGenerated(false);
    setRunStep(-1);
    setAwaitingApproval(false);
    setCompleted(false);
  }

  return (
    <div>
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Knowledge coverage", value: `${coverage}%`, sub: pto ? "with Maya away" : "team baseline" },
          { label: "Single-owner skills", value: singleOwner, sub: completed ? "1 risk removed" : "need a backup" },
          { label: "Alex readiness", value: `${readiness}%`, sub: completed ? "first task verified" : "Customer Operations" },
          { label: "Time to first task", value: completed ? "12 min" : "—", sub: completed ? "from invite to outcome" : "waiting for a real run" },
        ].map((stat) => (
          <div key={stat.label} className="card min-w-0 p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-mute-400">
              {stat.label}
            </p>
            <p className="mt-2 text-[27px] font-semibold leading-none tracking-[-0.02em] text-white">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-mute-400">{stat.sub}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="card overflow-hidden">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-white/6 p-5 sm:flex-row">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent-500">
                Company capability map
              </p>
              <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
                Customer Operations
              </h2>
              <p className="mt-1 text-[12.5px] text-mute-400">
                Skills the team actually runs, and who the company depends on.
              </p>
            </div>
            <button
              type="button"
              onClick={pto ? reset : simulatePto}
              className={`shrink-0 rounded-lg border px-3 py-2 font-mono text-[11px] transition ${
                pto
                  ? "border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/15"
                  : "border-white/10 bg-white/4 text-mute-200 hover:border-accent-500/40 hover:text-white"
              }`}
            >
              {pto ? "Reset scenario" : "Set Maya to PTO"}
            </button>
          </div>

          {pto && (
            <div className="border-b border-rose-400/15 bg-rose-400/6 px-5 py-3">
              <p className="flex items-center gap-2 text-[12.5px] text-rose-200">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-400" />
                Maya is away. Three business-critical skills have no active backup.
              </p>
            </div>
          )}

          <ul className="p-3">
            {CAPABILITIES.map((capability) => {
              const status = statusFor(capability, pto, planGenerated, completed);
              return (
                <li
                  key={capability.name}
                  className={`mb-2 flex items-center gap-3 rounded-xl border p-3.5 transition-all last:mb-0 ${statusClasses(status)}`}
                >
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                      status === "at-risk"
                        ? "bg-rose-400/15 text-rose-200"
                        : status === "verified"
                          ? "bg-accent-500/15 text-accent-400"
                          : "bg-ink-700 text-mute-200"
                    }`}
                  >
                    {status === "verified" ? "AK" : capability.owner.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-white">{capability.name}</p>
                    <p className="mt-0.5 text-[11px] text-mute-400">
                      {status === "verified"
                        ? "Maya → Alex · verified by a real run"
                        : capability.backup
                          ? `${capability.owner} · backup ${capability.backup}`
                          : `${capability.owner} · no verified backup`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-current/20 px-2 py-1 font-mono text-[9.5px]">
                    {statusCopy(status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card flex min-h-[510px] flex-col overflow-hidden">
          <div className="border-b border-white/6 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-violet-400">
                  New hire
                </p>
                <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
                  Alex Kim
                </h2>
                <p className="mt-1 text-[12.5px] text-mute-400">
                  Customer Operations · starts Monday
                </p>
              </div>
              <div className="relative grid h-16 w-16 place-items-center rounded-full border border-white/8 bg-white/3">
                <span className="text-[17px] font-semibold text-white">{readiness}%</span>
                <span className="absolute -bottom-5 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-mute-400">
                  ready
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col p-5 pt-7">
            {!planGenerated ? (
              <div className="flex flex-1 flex-col justify-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/8 text-violet-300">
                  ↗
                </div>
                <h3 className="mt-4 text-center text-[15px] font-semibold text-white">
                  Alex should not start from zero
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-center text-[12.5px] leading-relaxed text-mute-400">
                  Build the first week from the workflows this team has already proven—not a
                  generic handbook.
                </p>
                <button
                  type="button"
                  onClick={generatePlan}
                  className="mx-auto mt-5 rounded-lg bg-accent-500 px-4 py-2.5 text-[12.5px] font-semibold text-ink-950 transition hover:bg-accent-400"
                >
                  {pto ? "Generate onboarding from Maya’s skills" : "Simulate PTO & generate onboarding"}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-white">Alex’s first week</p>
                    <p className="mt-0.5 text-[11px] text-mute-400">Generated from proven work</p>
                  </div>
                  <span className="rounded-full border border-violet-400/20 bg-violet-400/8 px-2.5 py-1 font-mono text-[9.5px] text-violet-300">
                    3 skills assigned
                  </span>
                </div>

                <ol className="space-y-2">
                  {ONBOARDING_PLAN.map((item, index) => {
                    const firstDone = index === 0 && completed;
                    return (
                      <li
                        key={item.name}
                        className={`rounded-xl border p-3 transition ${
                          firstDone
                            ? "border-accent-500/25 bg-accent-500/8"
                            : "border-white/7 bg-white/2"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[9px] ${
                              firstDone
                                ? "bg-accent-500 text-ink-950"
                                : "bg-ink-700 text-mute-300"
                            }`}
                          >
                            {firstDone ? "✓" : index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-white">
                              <span className="mr-2 font-mono text-[9.5px] text-mute-400">
                                {item.day}
                              </span>
                              {item.name}
                            </p>
                            <p className="mt-1 text-[10.5px] text-mute-400">{item.source}</p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {runStep < 0 && !completed && (
                  <button
                    type="button"
                    onClick={startRun}
                    className="mt-auto rounded-lg bg-accent-500 px-4 py-2.5 text-[12.5px] font-semibold text-ink-950 transition hover:bg-accent-400"
                  >
                    Run Alex’s first real task
                  </button>
                )}

                {completed && (
                  <div className="mt-auto rounded-xl border border-accent-500/25 bg-accent-500/8 p-3.5">
                    <p className="text-[12.5px] font-semibold text-accent-400">
                      First real task completed
                    </p>
                    <p className="mt-1 text-[11px] text-mute-300">
                      Alex is now a verified backup for Refund exceptions · 12 minutes from invite
                      to outcome.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {planGenerated && runStep >= 0 && (
        <section className="card mt-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent-500">
                First task replay
              </p>
              <p className="mt-1 text-[13px] font-medium text-white">
                Refund order #1842 · $129
              </p>
            </div>
            <span className="rounded-full border border-white/8 bg-white/3 px-2.5 py-1 font-mono text-[9.5px] text-mute-300">
              permission-aware
            </span>
          </div>

          <ol className="grid gap-px bg-white/6 sm:grid-cols-5">
            {RUN_STEPS.map((step, index) => {
              const done = completed || index < runStep || (awaitingApproval && index < 3);
              const active = !completed && index === runStep;
              return (
                <li key={step} className="min-h-28 bg-ink-900 p-4">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[9px] ${
                      done
                        ? "bg-accent-500 text-ink-950"
                        : active
                          ? "onboard-pulse border border-accent-500/50 bg-accent-500/12 text-accent-400"
                          : "bg-ink-700 text-mute-400"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <p className={`mt-3 text-[11.5px] leading-relaxed ${active ? "text-white" : "text-mute-400"}`}>
                    {step}
                  </p>
                </li>
              );
            })}
          </ol>

          {awaitingApproval && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/15 bg-amber-400/6 px-5 py-3.5">
              <p className="text-[12px] text-amber-200">
                Alex can prepare the refund, but a manager must approve transactions over $100.
              </p>
              <button
                type="button"
                onClick={approveRun}
                className="rounded-lg bg-amber-400 px-3.5 py-2 text-[11.5px] font-semibold text-ink-950 transition hover:bg-amber-300"
              >
                Omar approves $129 refund
              </button>
            </div>
          )}
        </section>
      )}

      <p className="mt-4 text-center font-mono text-[10px] text-mute-400">
        Seeded company scenario · every interaction above runs live in this demo
      </p>
    </div>
  );
}
