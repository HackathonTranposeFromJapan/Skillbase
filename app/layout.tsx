import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase — turn proven work into company capability",
  description:
    "Discover, install, measure, and onboard from the AI-agent skills your company already proved.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="aurora" />
        <div className="relative z-10">
          <header className="sticky top-0 z-20 border-b border-white/6 bg-ink-950/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-500 font-mono text-[13px] font-bold text-ink-950">
                  S
                </span>
                <span className="hidden text-[15px] font-semibold tracking-tight text-white sm:inline">
                  Skillbase
                </span>
              </Link>
              <nav className="flex items-center gap-3 text-[12px] sm:gap-6 sm:text-[13px]">
                <Link href="/" className="text-mute-300 transition hover:text-white">
                  Search
                </Link>
                <Link href="/onboarding" className="text-mute-300 transition hover:text-white">
                  Onboarding
                </Link>
                <Link href="/dashboard" className="text-mute-300 transition hover:text-white">
                  Dashboard
                </Link>
              </nav>
              <div className="ml-auto hidden items-center gap-2 font-mono text-[11px] text-mute-400 sm:flex">
                <span className="hidden sm:inline">acme-corp</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-700 text-[10px] text-mute-200">
                  YT
                </span>
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
