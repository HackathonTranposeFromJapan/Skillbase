import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Panel({
  title,
  kicker,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  kicker?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-hairline bg-surface/70 backdrop-blur-sm',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-hairline border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="font-medium text-[13px] text-foreground">{title}</h3>}
            {kicker && <p className="mt-0.5 text-[11px] text-muted-foreground">{kicker}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn('flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
