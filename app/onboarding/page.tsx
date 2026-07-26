import { OnboardingDemo } from "./OnboardingDemo";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-12">
      <header className="mb-9 max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/8 px-3 py-1 font-mono text-[10.5px] text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          DAY-ONE READINESS
        </div>
        <h1 className="text-[34px] leading-[1.08] font-semibold tracking-[-0.035em] text-white sm:text-[46px]">
          New hires shouldn&apos;t
          <br />
          start from zero.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mute-300">
          Skillbase turns the workflows your best people already proved into role-specific
          onboarding—then verifies readiness with the first real task.
        </p>
        <p className="mt-3 text-[12px] text-mute-400">
          Every company has a Maya. When Maya is away, the operating system should stay online.
        </p>
      </header>

      <OnboardingDemo />
    </main>
  );
}
