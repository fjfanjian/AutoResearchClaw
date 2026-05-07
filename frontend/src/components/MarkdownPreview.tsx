import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  className?: string
}

export function MarkdownPreview({ content, className = '' }: Props) {
  return (
    <div
      className={`prose prose-sm prose-invert max-w-none ${className}`}
      style={{
        // Tailwind prose-invert doesn't cover all cases in dark mode
        '--tw-prose-body': '#c9d1d9',
        '--tw-prose-headings': '#f0f6fc',
        '--tw-prose-links': '#58a6ff',
        '--tw-prose-code': '#79c0ff',
        '--tw-prose-pre-bg': '#161b22',
        '--tw-prose-pre-code': '#c9d1d9',
        '--tw-prose-th-borders': '#30363d',
        '--tw-prose-td-borders': '#30363d',
        '--tw-prose-hr': '#30363d',
        '--tw-prose-blockquote-color': '#8b949e',
        '--tw-prose-blockquote-border': '#30363d',
      } as React.CSSProperties}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
