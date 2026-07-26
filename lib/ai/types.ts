import type { ChartConfig } from '@/components/dither-kit'

/** A chart the agent can render inline in an answer. */
export type ChartSpec =
  | {
      kind: 'area' | 'line' | 'bar'
      title: string
      caption?: string
      xKey: string
      data: Record<string, string | number>[]
      config: ChartConfig
      series: string[]
      stacked?: boolean
      height?: number
    }
  | {
      kind: 'pie'
      title: string
      caption?: string
      data: Record<string, string | number>[]
      dataKey: string
      nameKey: string
      config: ChartConfig
      height?: number
    }
  | {
      kind: 'radar'
      title: string
      caption?: string
      data: Record<string, string | number>[]
      nameKey: string
      config: ChartConfig
      series: string[]
      height?: number
    }

/** A skill recommendation with the reason it surfaced. */
export type SkillRecommendation = {
  skillId: string
  /** Shown on the card. Trust comes from the reason, not the ranking. */
  reason: string
}

export type ChatBlock =
  | { type: 'text'; markdown: string }
  | {
      type: 'skills'
      items: SkillRecommendation[]
      /** `row` is a horizontal, scrollable set — use it for a bundle. */
      layout?: 'stack' | 'row'
      /** Heading above the set, e.g. "Engineering baseline". */
      title?: string
      /** Show the bulk install action above the list. */
      installAll?: boolean
    }
  | { type: 'chart'; spec: ChartSpec }
  | { type: 'people'; personIds: string[]; caption: string }

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  blocks: ChatBlock[]
  /** Assistant messages stream in; `pending` drives the typing indicator. */
  pending?: boolean
}

export type AgentContext = {
  userId: string
  /** Skill ids the user already has, so the agent can skip or mark them. */
  installed: string[]
}

/**
 * The single seam between the UI and whatever produces answers.
 * `mockAgent` implements it today; `httpAgent` talks to a real backend.
 * Nothing in the UI knows which one it is using.
 */
export type SkillbaseAgent = {
  id: string
  respond: (prompt: string, ctx: AgentContext) => AsyncGenerator<ChatBlock>
}
