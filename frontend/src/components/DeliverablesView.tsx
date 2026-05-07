import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import type { ArtifactNode } from '../types'
import { fetchArtifactContent, fetchArtifacts } from '../api/client'
import { MarkdownPreview } from './MarkdownPreview'

interface Props {
  runId: string
}

const DELIVERABLE_PATTERNS = [
  'deliverables/',
  'paper.md',
  'paper.tex',
  'paper.pdf',
]

function isDeliverable(path: string): boolean {
  return DELIVERABLE_PATTERNS.some((p) => path.includes(p))
}

function flatFiles(node: ArtifactNode, base = ''): Array<{ path: string; name: string; ext: string }> {
  const full = base ? `${base}/${node.name}` : node.name
  if (node.type === 'file') {
    return [{ path: full, name: node.name, ext: node.extension ?? '' }]
  }
  return (node.children ?? []).flatMap((c) => flatFiles(c, full))
}

export function DeliverablesView({ runId }: Props) {
  const [files, setFiles] = useState<Array<{ path: string; name: string; ext: string }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchArtifacts(runId)
      .then(({ tree }) => {
        const all = flatFiles(tree)
        setFiles(all.filter((f) => isDeliverable(f.path)))
      })
      .catch(() => {})
  }, [runId])

  useEffect(() => {
    if (!selected) { setContent(null); return }
    setLoading(true)
    fetchArtifactContent(runId, selected)
      .then((res) => setContent(res.content))
      .catch(() => setContent(null))
      .finally(() => setLoading(false))
  }, [runId, selected])

  const ext = selected?.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="flex h-full overflow-hidden">
      {/* File list */}
      <div className="w-52 shrink-0 border-r border-surface-border overflow-auto py-3 px-2">
        <p className="text-xs text-muted px-2 mb-2">Deliverables</p>
        {files.length === 0 ? (
          <p className="text-xs text-muted px-2">None yet</p>
        ) : (
          files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelected(f.path)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-surface-overlay text-xs ${
                selected === f.path ? 'bg-accent/10 text-accent' : 'text-gray-300'
              }`}
            >
              <FileText size={12} className="shrink-0 text-muted" />
              <span className="truncate">{f.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto">
        {selected && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border">
            <span className="text-xs text-muted font-mono">{selected}</span>
            <a
              href={`/api/runs/${runId}/artifacts/${selected}`}
              download
              className="flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <Download size={12} /> Download
            </a>
          </div>
        )}
        <div className="p-4">
          {loading && <p className="text-sm text-muted animate-pulse">Loading…</p>}
          {!loading && content !== null && ext === 'md' && (
            <MarkdownPreview content={content} />
          )}
          {!loading && content !== null && ext !== 'md' && (
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-300">{content}</pre>
          )}
          {!loading && content === null && !selected && (
            <p className="text-sm text-muted">Select a deliverable to preview</p>
          )}
        </div>
      </div>
    </div>
  )
}
