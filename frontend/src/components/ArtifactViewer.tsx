import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react'
import { api } from '@/api/client'
import type { ArtifactNode, ArtifactContent } from '@/types'
import MarkdownPreview from './MarkdownPreview'

interface Props {
  runId: string
}

function FileTreeNode({ node, depth = 0, selectedPath, onSelect }: {
  node: ArtifactNode
  depth?: number
  selectedPath: string
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'directory'
  const isSelected = node.path === selectedPath

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) { setOpen(!open) } else { onSelect(node.path) }
        }}
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors ${
          isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
        }`}
        style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
      >
        {isDir ? (
          <>
            {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default function ArtifactViewer({ runId }: Props) {
  const [tree, setTree] = useState<ArtifactNode | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.listArtifacts(runId).then((res) => {
      setTree(res.tree)
    }).catch(() => setTree(null))
  }, [runId])

  const loadContent = useCallback(async (path: string) => {
    setSelectedPath(path)
    setLoading(true)
    try {
      const data = await api.getArtifact(runId, path)
      setContent(data)
    } catch {
      setContent(null)
    } finally {
      setLoading(false)
    }
  }, [runId])

  const renderPreview = () => {
    if (!content) return <p className="text-sm text-slate-500">选择文件以预览</p>
    if (loading) return <p className="text-sm text-slate-500">加载中...</p>

    const mime = content.mime_type || ''
    const path = content.path || ''

    if (mime.startsWith('image/')) {
      return <img src={`data:${mime};base64,${content.content}`} alt={path} className="max-w-full rounded border border-slate-800" />
    }

    if (path.endsWith('.md')) {
      return <MarkdownPreview content={content.content} />
    }

    if (path.endsWith('.json')) {
      try {
        const json = JSON.parse(content.content)
        return (
          <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs text-slate-300">
            {JSON.stringify(json, null, 2)}
          </pre>
        )
      } catch {
        return <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs text-slate-300">{content.content}</pre>
      }
    }

    return (
      <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs font-mono text-slate-300">
        {content.content}
      </pre>
    )
  }

  return (
    <div className="flex h-full gap-4">
      <div className="w-64 shrink-0 overflow-auto rounded-lg border border-slate-800 bg-slate-900/50">
        {tree?.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={loadContent} />
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-900/30 p-4">
        {selectedPath && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">{selectedPath}</span>
            <button
              onClick={() => {
                const blob = new Blob([content?.content || ''], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = selectedPath.split('/').pop() || 'download'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="btn-ghost text-xs px-2 py-1"
            >
              下载
            </button>
          </div>
        )}
        {renderPreview()}
      </div>
    </div>
  )
}
