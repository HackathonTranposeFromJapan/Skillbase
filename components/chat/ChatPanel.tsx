import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Message } from '@/components/chat/Message'
import { createAgent, demoPrompts } from '@/lib/ai'
import type { ChatMessage } from '@/lib/ai/types'
import { useApp } from '@/state/app-state'
import { cn } from '@/lib/utils'

let messageSeq = 0
const nextId = () => `m${++messageSeq}`

export function ChatPanel({ initialPrompt }: { initialPrompt?: string }) {
  const { userId, installed } = useApp()
  const agent = useMemo(() => createAgent(), [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  // Read at send time so an install made mid-conversation is reflected.
  const ctxRef = useRef({ userId, installed })
  ctxRef.current = { userId, installed }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim()
      if (!text || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setInput('')

      const assistantId = nextId()
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', blocks: [{ type: 'text', markdown: text }] },
        { id: assistantId, role: 'assistant', blocks: [], pending: true },
      ])

      try {
        for await (const block of agent.respond(text, ctxRef.current)) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, blocks: [...m.blocks, block] } : m)),
          )
        }
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  blocks: [
                    ...m.blocks,
                    {
                      type: 'text',
                      markdown: `The agent failed: \`${String(error)}\`. Try again, or check \`NEXT_PUBLIC_SKILLBASE_API\`.`,
                    },
                  ],
                }
              : m,
          ),
        )
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)),
        )
        busyRef.current = false
        setBusy(false)
      }
    },
    [agent],
  )

  // Fire the prompt the launcher was opened with, exactly once.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !initialPrompt) return
    started.current = true
    void send(initialPrompt)
  }, [initialPrompt, send])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <p className="font-mono text-[12px] text-muted-foreground">
            waiting for the first prompt<span className="caret">_</span>
          </p>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
      </div>

      <form
        className="border-hairline border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <div className="flex items-center gap-2 rounded-lg border border-hairline bg-background/60 px-3 py-2 focus-within:border-primary/40">
          <span className="font-mono text-[12px] text-primary/70">&gt;</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up…"
            aria-label="Ask a follow-up"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className={cn(
              'rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition',
              busy || input.trim().length === 0
                ? 'cursor-not-allowed border-hairline text-muted-foreground/60'
                : 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25',
            )}
          >
            {busy ? 'running' : 'send ⏎'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {demoPrompts.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => void send(p)}
              className="rounded border border-hairline bg-surface-2/40 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/30 hover:text-foreground disabled:opacity-50"
            >
              {p.length > 46 ? `${p.slice(0, 44)}…` : p}
            </button>
          ))}
        </div>
      </form>
    </div>
  )
}
