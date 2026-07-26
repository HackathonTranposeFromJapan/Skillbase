import { httpAgent } from './http-agent'
import { mockAgent } from './mock-agent'
import type { SkillbaseAgent } from './types'

/**
 * Single place where the app decides who answers.
 * Set `NEXT_PUBLIC_SKILLBASE_API=https://api.example.com` in `.env.local` to point the
 * dashboard at a real agent; leave it unset for the offline demo.
 */
export function createAgent(): SkillbaseAgent {
  const baseUrl = process.env.NEXT_PUBLIC_SKILLBASE_API
  return baseUrl ? httpAgent(baseUrl) : mockAgent
}

export { demoPrompts } from './mock-agent'
export type { AgentContext, ChartSpec, ChatBlock, ChatMessage, SkillbaseAgent } from './types'
