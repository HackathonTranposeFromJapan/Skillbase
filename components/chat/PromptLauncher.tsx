import { useRef, useState } from 'react'
import { DitherGradient } from '@/components/dither-kit'
import { demoPrompts } from '@/lib/ai'
import { cn } from '@/lib/utils'
import { useApp } from '@/state/app-state'

/**
 * The single entry point to the agent: a large composer at the top of the
 * dashboard. Submitting opens the chat modal and sends the prompt straight in.
 */
export function PromptLauncher() {
  const { openChat } = useApp()
  const [value, setValue] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const submit = (prompt: string) => {
    const text = prompt.trim()
    if (!text) return
    openChat(text)
    setValue('')
  }

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-hairline bg-surface/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60">
        <DitherGradient from="purple" direction="down" opacity={0.22} cell={3} />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-8 sm:py-10">
        <h1 className="mt-2 text-balance font-medium text-[26px] leading-tight tracking-tight sm:text-[30px]">
          Find the skill your team already trusts.
        </h1>
        <p className="mt-2 max-w-xl text-[13.5px] text-muted-foreground leading-relaxed">
          Describe the outcome you want, not the tool. Every answer cites who runs it, how often,
          and whether they stuck with it.
        </p>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit(value)
          }}
        >
          <div className="rounded-xl border border-hairline bg-background/70 p-2.5 shadow-lg shadow-black/20 transition focus-within:border-primary/45">
            <textarea
              ref={areaRef}
              value={value}
              rows={2}
              onChange={(e) => {
                setValue(e.target.value)
                grow(e.target)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(value)
                }
              }}
              placeholder="I need a skill that…"
              aria-label="Ask Skillbase"
              className="max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-[14.5px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between gap-3 px-1.5 pt-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                skillbase agent · 21 skills indexed
              </span>
              <button
                type="submit"
                disabled={value.trim().length === 0}
                className={cn(
                  'rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition',
                  value.trim().length === 0
                    ? 'cursor-not-allowed border-hairline text-muted-foreground/60'
                    : 'border-primary/40 bg-primary/20 text-primary hover:bg-primary/30 active:translate-y-px',
                )}
              >
                Ask ⏎
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {demoPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submit(prompt)}
              className="group flex items-center gap-2 rounded-full border border-hairline bg-surface-2/60 px-3.5 py-1.5 text-[12.5px] text-foreground/85 transition hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
            >
              <span className="font-mono text-[10px] text-primary/70 group-hover:text-primary">
                &gt;
              </span>
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
