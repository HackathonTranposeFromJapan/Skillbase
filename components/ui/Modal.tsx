import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Modal({
  onClose,
  children,
  depth = 0,
  className,
}: {
  onClose: () => void
  children: ReactNode
  /** Stack index: modals opened from modals sit slightly lower and darker. */
  depth?: number
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ zIndex: 50 + depth * 10 }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled above */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative my-auto w-full max-w-3xl rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/60',
          'duration-200 animate-in fade-in-0 zoom-in-95',
          className,
        )}
        style={{ marginTop: depth * 16 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="absolute top-3.5 right-3.5 z-10 flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}
