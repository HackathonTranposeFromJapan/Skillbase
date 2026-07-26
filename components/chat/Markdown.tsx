import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Terminal-flavoured markdown: tight leading, mono code, hairline tables. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13.5px] text-foreground/90 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-medium text-foreground">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-4 marker:text-primary/60">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-4 marker:text-primary/60">{children}</ol>
          ),
          code: ({ className, children }) => {
            const block = /language-/.test(className ?? '')
            if (!block) {
              return (
                <code className="rounded border border-hairline bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-primary/90">
                  {children}
                </code>
              )
            }
            return (
              <code className="block overflow-x-auto rounded-md border border-hairline bg-background/60 p-3 font-mono text-[12px] text-emerald-300/90">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="mb-2">{children}</pre>,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-hairline border-b px-2 py-1.5 text-left font-mono font-normal text-[10.5px] text-muted-foreground uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-hairline/60 border-b px-2 py-1.5 align-top">{children}</td>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
