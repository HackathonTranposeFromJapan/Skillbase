import type { ChatBlock, SkillbaseAgent } from './types'

/**
 * Real-backend implementation. Expects `POST {baseUrl}/chat` to stream
 * newline-delimited JSON, one {@link ChatBlock} per line:
 *
 * ```
 * {"type":"text","markdown":"..."}
 * {"type":"skills","items":[{"skillId":"design-polish","reason":"..."}]}
 * {"type":"chart","spec":{...}}
 * ```
 *
 * Wire it up by setting `NEXT_PUBLIC_SKILLBASE_API` — see `src/lib/ai/index.ts`.
 * The UI is unaware of which agent is active.
 */
export function httpAgent(baseUrl: string): SkillbaseAgent {
  return {
    id: 'http',
    async *respond(prompt, ctx) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, context: ctx }),
      })
      if (!res.ok || !res.body) {
        yield {
          type: 'text',
          markdown: `The agent backend returned \`${res.status}\`. Falling back to the local library search.`,
        }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            yield JSON.parse(trimmed) as ChatBlock
          } catch {
            // Ignore partial or malformed frames rather than killing the stream.
          }
        }
      }
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer.trim()) as ChatBlock
        } catch {
          // Same: a truncated tail frame is not worth surfacing.
        }
      }
    },
  }
}
