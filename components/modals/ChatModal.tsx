import { ChatPanel } from '@/components/chat/ChatPanel'
import { Modal } from '@/components/ui/Modal'

/** The conversation lives in a large modal opened from the launcher. */
export function ChatModal({
  prompt,
  depth,
  onClose,
}: {
  prompt: string
  depth: number
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose} depth={depth} className="max-w-4xl">
      <div className="flex h-[82svh] flex-col">
        <header className="flex items-start justify-between gap-3 border-hairline border-b px-5 py-3.5 pr-16">
          <div>
            <h2 className="font-medium text-[14px]">Ask Skillbase</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Answers cite who already runs it. Install straight from a card.
            </p>
          </div>
          <span className="label mt-1 hidden sm:inline">agent · demo</span>
        </header>
        <ChatPanel initialPrompt={prompt} />
      </div>
    </Modal>
  )
}
