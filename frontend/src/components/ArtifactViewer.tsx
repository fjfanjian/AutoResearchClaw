import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ArtifactNode } from '../types'
import { fetchArtifactContent, fetchArtifacts } from '../api/client'
import { MarkdownPreview } from './MarkdownPreview'

// Extension → Prism language map
const EXT_LANG: Record<string, string> = {
  py: 'python',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  tex: 'latex',
  bib: 'bibtex',
  sh: 'bash',
  bash: 'bash',
  txt: 'text',
  log: 'text',
  csv: 'text',
}

interface TreeNodeProps {
  node: ArtifactNode
  depth: number
  onSelect: (path: string) => void
  selectedPath: string | null
}

function TreeNode({ node, depth, onSelect, selectedPath }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-surface-overlay text-left rounded"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {open ? (
            <ChevronDown size={12} className="text-muted shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-muted shrink-0" />
          )}
          <Folder size={13} className="text-accent shrink-0" />
          <span className="text-xs truncate">{node.name}</span>
        </button>
        {open && (
          <div>
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full px-2 py-1 hover:bg-surface-overlay text-left rounded ${
        selectedPath === node.path ? 'bg-accent/10 text-accent' : ''
      }`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <File size={12} className="text-muted shrink-0" />
      <span className="text-xs truncate flex-1">{node.name}</span>
      {node.size != null && (
        <span className="text-xs text-muted shrink-0">
          {node.size < 1024
            ? `${node.size}B`
            : node.size < 1048576
            ? `${(node.size / 1024).toFixed(1)}KB`
            : `${(node.size / 1048576).toFixed(1)}MB`}
        </span>
      )}
    </button>
  )
}

interface Props {
  runId: string
  initialPath?: string
}

export function ArtifactViewer({ runId, initialPath }: Props) {
  const [tree, setTree] = useState<ArtifactNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath ?? null)
  const [content, setContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load tree
  useEffect(() => {
    fetchArtifacts(runId)
      .then(({ tree: t }) => setTree(t))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [runId])

  // Load file content
  useEffect(() => {
    if (!selectedPath) { setContent(null); return }
    setLoadingContent(true)
    setError(null)
    fetchArtifactContent(runId, selectedPath)
      .then((res) => {
        setContent(res.content)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load file')
        setContent(null)
      })
      .finally(() => setLoadingContent(false))
  }, [runId, selectedPath])

  const ext = selectedPath?.split('.').pop()?.toLowerCase() ?? ''
  const lang = EXT_LANG[ext] ?? 'text'
  const isMarkdown = ext === 'md'

  return (
    <div className="flex h-full overflow-hidden">
      {/* File tree */}
      <div className="w-56 shrink-0 border-r border-surface-border overflow-auto py-2">
        {tree ? (
          <TreeNode
            node={tree}
            depth={0}
            onSelect={setSelectedPath}
            selectedPath={selectedPath}
          />
        ) : (
          <p className="text-xs text-muted p-3">Loading…</p>
        )}
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="p-4 text-sm text-danger">{error}</div>
        )}
        {loadingContent && (
          <div className="p-4 text-sm text-muted animate-pulse">Loading…</div>
        )}
        {!loadingContent && content !== null && (
          <div className="p-4">
            {isMarkdown ? (
              <MarkdownPreview content={content} />
            ) : (
              <SyntaxHighlighter
                language={lang}
                style={vscDarkPlus}
                customStyle={{
                  background: 'transparent',
                  fontSize: '12px',
                  margin: 0,
                  padding: 0,
                }}
                showLineNumbers
                wrapLongLines
              >
                {content}
              </SyntaxHighlighter>
            )}
          </div>
        )}
        {!loadingContent && content === null && !error && (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  )
}
