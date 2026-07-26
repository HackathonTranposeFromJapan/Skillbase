import { ChatModal } from '@/components/modals/ChatModal'
import { PersonModal } from '@/components/modals/PersonModal'
import { SkillModal } from '@/components/modals/SkillModal'
import { useApp } from '@/state/app-state'

/**
 * Renders the modal stack. The chat sits at the bottom; a skill card inside it
 * can open a skill modal, which can open a person modal on top of that.
 */
export function ModalHost() {
  const { modals, closeTop } = useApp()

  return (
    <>
      {modals.map((modal, i) => {
        if (modal.kind === 'chat') {
          return (
            <ChatModal key={`chat-${i}`} prompt={modal.prompt} depth={i} onClose={closeTop} />
          )
        }
        if (modal.kind === 'skill') {
          return (
            <SkillModal
              key={`skill-${modal.id}-${i}`}
              skillId={modal.id}
              depth={i}
              onClose={closeTop}
            />
          )
        }
        return (
          <PersonModal
            key={`person-${modal.id}-${i}`}
            personId={modal.id}
            depth={i}
            onClose={closeTop}
          />
        )
      })}
    </>
  )
}
