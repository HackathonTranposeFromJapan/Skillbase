import { ChartBlock } from '@/components/charts/ChartBlock'
import { SkillCard } from '@/components/SkillCard'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { Markdown } from '@/components/chat/Markdown'
import { hasAccess } from '@/demo/access'
import { peopleById } from '@/demo/people'
import { skillsById } from '@/demo/skills'
import type { ChatBlock, ChatMessage } from '@/lib/ai/types'
import { useApp } from '@/state/app-state'

type SkillsBlock = Extract<ChatBlock, { type: 'skills' }>

/**
 * A recommended set. `row` lays the cards out horizontally and scrolls when
 * they overflow, with a bulk install above the list.
 */
function SkillSet({ block }: { block: SkillsBlock }) {
  const { userId, installed, install } = useApp()
  const me = peopleById[userId]
  const row = block.layout === 'row'

  const installable = block.items
    .map((item) => skillsById[item.skillId])
    .filter((skill) => skill && hasAccess(skill, me) && !installed.includes(skill.id))

  const locked = block.items.filter((item) => !hasAccess(skillsById[item.skillId], me)).length

  const header = (block.title || block.installAll) && (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <span className="label">{block.title ?? 'Recommended set'}</span>
      {block.installAll && (
        <div className="flex items-center gap-2">
          {locked > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {locked} restricted
            </span>
          )}
          <button
            type="button"
            disabled={installable.length === 0}
            onClick={() => {
              for (const skill of installable) install(skill.id)
            }}
            className={
              installable.length === 0
                ? 'cursor-default rounded-md border border-hairline px-2.5 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider'
                : 'rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1 font-mono text-[10px] text-primary uppercase tracking-wider transition hover:bg-primary/25 active:translate-y-px'
            }
          >
            {installable.length === 0
              ? '✓ Set installed'
              : `Install all · ${installable.length}`}
          </button>
        </div>
      )}
    </div>
  )

  if (!row) {
    return (
      <div>
        {header}
        <div className="grid gap-2.5">
          {block.items.map((item) => (
            <SkillCard key={item.skillId} skillId={item.skillId} reason={item.reason} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
        {block.items.map((item) => (
          <SkillCard
            key={item.skillId}
            skillId={item.skillId}
            reason={item.reason}
            className="w-[290px] shrink-0 snap-start"
          />
        ))}
      </div>
    </div>
  )
}

function Block({ block }: { block: ChatBlock }) {
  if (block.type === 'text') return <Markdown>{block.markdown}</Markdown>

  if (block.type === 'skills') return <SkillSet block={block} />


  if (block.type === 'chart') return <ChartBlock spec={block.spec} />

  return (
    <div className="rounded-lg border border-hairline bg-surface-2/40 p-3">
      <p className="label mb-2">{block.caption}</p>
      <div className="flex flex-wrap gap-3">
        {block.personIds.map((id) => (
          <div key={id} className="flex items-center gap-2">
            <PersonAvatar personId={id} size="sm" />
            <div className="leading-tight">
              <p className="text-[12px] text-foreground">{peopleById[id]?.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{peopleById[id]?.role}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-primary/25 bg-primary/10 px-3.5 py-2 text-[13.5px] text-foreground">
          {message.blocks.map((b, i) =>
            b.type === 'text' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: user text is a single static block
              <span key={i}>{b.markdown}</span>
            ) : null,
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 font-mono text-[10px] text-primary">
        SB
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {message.blocks.map((block, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks are append-only within a message
          <Block key={i} block={block} />
        ))}
        {message.pending && (
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            searching the skill library
            <span className="caret">_</span>
          </p>
        )}
      </div>
    </div>
  )
}
