import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { currentUserId, peopleById } from '@/demo/people'

/** What is stacked on top of the dashboard. Modals can open modals. */
export type ModalTarget =
  | { kind: 'skill'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'chat'; prompt: string }

type AppState = {
  userId: string
  installed: string[]
  isInstalled: (skillId: string) => boolean
  install: (skillId: string) => void
  uninstall: (skillId: string) => void
  modals: ModalTarget[]
  openSkill: (id: string) => void
  openPerson: (id: string) => void
  openChat: (prompt: string) => void
  closeTop: () => void
  closeAll: () => void
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<string[]>(
    () => peopleById[currentUserId]?.collection ?? [],
  )
  const [modals, setModals] = useState<ModalTarget[]>([])

  const install = useCallback((skillId: string) => {
    setInstalled((prev) => (prev.includes(skillId) ? prev : [...prev, skillId]))
  }, [])

  const uninstall = useCallback((skillId: string) => {
    setInstalled((prev) => prev.filter((id) => id !== skillId))
  }, [])

  /** Re-opening whatever is already on top is a no-op, not a duplicate layer. */
  const pushUnique = (prev: ModalTarget[], next: ModalTarget): ModalTarget[] => {
    const top = prev[prev.length - 1]
    if (top && top.kind === next.kind && 'id' in top && 'id' in next && top.id === next.id) {
      return prev
    }
    return [...prev, next]
  }

  const openSkill = useCallback((id: string) => {
    setModals((prev) => pushUnique(prev, { kind: 'skill', id }))
  }, [])

  const openPerson = useCallback((id: string) => {
    setModals((prev) => pushUnique(prev, { kind: 'person', id }))
  }, [])

  /** The chat always opens at the bottom of the stack, one at a time. */
  const openChat = useCallback((prompt: string) => {
    setModals((prev) => [...prev.filter((m) => m.kind !== 'chat'), { kind: 'chat', prompt }])
  }, [])

  const closeTop = useCallback(() => setModals((prev) => prev.slice(0, -1)), [])
  const closeAll = useCallback(() => setModals([]), [])

  const value = useMemo<AppState>(
    () => ({
      userId: currentUserId,
      installed,
      isInstalled: (skillId: string) => installed.includes(skillId),
      install,
      uninstall,
      modals,
      openSkill,
      openPerson,
      openChat,
      closeTop,
      closeAll,
    }),
    [installed, modals, install, uninstall, openSkill, openPerson, openChat, closeTop, closeAll],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>')
  return ctx
}
