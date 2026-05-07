import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Props {
  content: string
}

export default function MarkdownPreview({ content }: Props) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-a:text-indigo-400 prose-code:text-emerald-300 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800 prose-blockquote:border-l-indigo-500">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                {...(props as any)}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-emerald-300" {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
