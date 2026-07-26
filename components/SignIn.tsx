import { useState } from 'react'
import { DitherAvatar, DitherGradient } from '@/components/dither-kit'
import { cn } from '@/lib/utils'

const DEMO_ID = 'demo'
const DEMO_PW = 'demodemo'

export function SignIn({ onSignIn }: { onSignIn: () => void }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    // Mock auth: a real build swaps this for the company SSO handshake.
    window.setTimeout(() => {
      if (id.trim() === DEMO_ID && pw === DEMO_PW) {
        onSignIn()
      } else {
        setError('Invalid credentials. Use demo / demodemo.')
        setBusy(false)
      }
    }, 450)
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-70" />
      {/* DitherGradient is itself `absolute inset-0`, so it needs its own box. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4">
        <DitherGradient from="purple" direction="up" opacity={0.32} cell={3} />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <DitherAvatar name="Skillbase" size={40} animate />
          <div>
            <h1 className="font-medium text-[17px] tracking-tight">Skillbase</h1>
            <p className="font-mono text-[11px] text-muted-foreground">
              internal AI skill registry
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-hairline bg-surface/80 p-5 backdrop-blur"
        >
          <p className="label">Sign in</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Single sign-on is disabled in the hackathon build.
          </p>

          <label className="mt-4 block">
            <span className="label">Employee ID</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1.5 w-full rounded-md border border-hairline bg-background/60 px-3 py-2 font-mono text-[13px] outline-none transition focus:border-primary/50"
              placeholder="demo"
            />
          </label>

          <label className="mt-3 block">
            <span className="label">Password</span>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-md border border-hairline bg-background/60 px-3 py-2 font-mono text-[13px] outline-none transition focus:border-primary/50"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={cn(
              'mt-4 w-full rounded-md border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition',
              busy
                ? 'cursor-wait border-hairline text-muted-foreground'
                : 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 active:translate-y-px',
            )}
          >
            {busy ? 'authenticating…' : 'sign in'}
          </button>

          <button
            type="button"
            onClick={() => {
              setId(DEMO_ID)
              setPw(DEMO_PW)
            }}
            className="mt-3 w-full rounded-md border border-hairline bg-surface-2/40 px-3 py-2 text-[11.5px] text-muted-foreground transition hover:text-foreground"
          >
            Fill demo credentials · demo / demodemo
          </button>
        </form>

        <p className="mt-4 text-center font-mono text-[10.5px] text-muted-foreground">
          skillbase v0.4.0 · global hackathon build
        </p>
      </div>
    </div>
  )
}
