'use client'

import { useState } from 'react'
import { DitherAvatar } from '@/components/dither-kit'
import { PromptLauncher } from '@/components/chat/PromptLauncher'
import { ModalHost } from '@/components/modals/ModalHost'
import { Overview } from '@/components/overview/Overview'
import { SignIn } from '@/components/SignIn'
import { AvatarFilterDefs, PersonAvatar } from '@/components/ui/PersonAvatar'
import { peopleById } from '@/demo/people'
import { AppStateProvider, useApp } from '@/state/app-state'

function Header({ onSignOut }: { onSignOut: () => void }) {
  const { userId, installed, openPerson } = useApp()
  const me = peopleById[userId]

  return (
    <header className="sticky top-0 z-30 border-hairline border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <DitherAvatar name="Skillbase" size={26} animate={false} />
          <span className="font-medium text-[14px] tracking-tight">Skillbase</span>
        </div>

        <nav className="hidden items-center gap-1 font-mono text-[11px] text-muted-foreground md:flex">
          {['Discover', 'Library', 'Analytics', 'Governance'].map((item, i) => (
            <span
              key={item}
              className={
                i === 0
                  ? 'rounded border border-hairline bg-surface-2 px-2 py-1 text-foreground'
                  : 'px-2 py-1'
              }
            >
              {item}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
            {installed.length} skills installed
          </span>
          <button
            type="button"
            onClick={() => openPerson(userId)}
            className="flex items-center gap-2 rounded-md border border-hairline bg-surface-2/50 py-1 pr-2.5 pl-1 transition hover:border-primary/35"
          >
            <PersonAvatar personId={userId} size="xs" clickable={false} />
            <span className="text-left leading-tight">
              <span className="block text-[11.5px]">{me?.name}</span>
              <span className="block font-mono text-[9.5px] text-muted-foreground">{me?.role}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md border border-hairline px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider transition hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="min-h-svh">
      <Header onSignOut={onSignOut} />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-5 sm:px-6">
        <PromptLauncher />
        <Overview />
      </main>
      <footer className="mx-auto max-w-[1200px] px-4 py-6 font-mono text-[10.5px] text-muted-foreground sm:px-6">
        Skillbase · demo data, no live telemetry · charts by dither-kit
      </footer>
      <ModalHost />
    </div>
  )
}

export default function SkillbaseApp() {
  const [signedIn, setSignedIn] = useState(false)

  return (
    <AppStateProvider>
      <AvatarFilterDefs />
      {signedIn ? (
        <Dashboard onSignOut={() => setSignedIn(false)} />
      ) : (
        <SignIn onSignIn={() => setSignedIn(true)} />
      )}
    </AppStateProvider>
  )
}
