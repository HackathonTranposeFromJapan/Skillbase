import Link from "next/link";
import { hexclaveServerApp, hexclaveConfigured } from "@/hexclave/server";

/**
 * Who is signed in, and which team's data the page is showing.
 *
 * The team matters more than the name here: it is the tenant, so it tells the
 * viewer whose numbers these are. Renders a static placeholder when Hexclave is
 * not configured so the app still runs on seed data.
 */
export async function AccountBadge() {
  if (!hexclaveConfigured()) {
    return <span className="hidden sm:inline">demo workspace</span>;
  }

  const user = await hexclaveServerApp.getUser().catch(() => null);

  if (!user) {
    return (
      <Link
        href="/handler/sign-in"
        className="rounded-md border border-white/10 px-2.5 py-1 text-mute-200 transition hover:border-white/20 hover:text-white"
      >
        sign in
      </Link>
    );
  }

  const team = user.selectedTeam;
  const label = user.displayName ?? user.primaryEmail ?? "account";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <>
      {team?.displayName ? <span className="hidden sm:inline">{team.displayName}</span> : null}
      <span
        title={label}
        className="grid h-6 w-6 place-items-center rounded-full bg-ink-700 text-[10px] text-mute-200"
      >
        {initials}
      </span>
    </>
  );
}
