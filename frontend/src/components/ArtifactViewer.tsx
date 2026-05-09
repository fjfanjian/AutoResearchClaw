import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, File, Folder, Download, Search, FileCode, FileImage, FileSpreadsheet, FileText, AlertTriangle, FileArchive } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { api } from '@/api/client'
import type { ArtifactNode, ArtifactContent } from '@/types'
import MarkdownPreview from './MarkdownPreview'

interface Props {
  runId: string
}

// Map file extensions to syntax-highlighting languages
const EXT_TO_LANG: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.toml': 'toml',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.dockerfile': 'dockerfile',
  '.tex': 'latex',
  '.bib': 'bibtex',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.r': 'r',
  '.sql': 'sql',
  '.md': 'markdown',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function FileTreeNode({ node, depth = 0, selectedPath, onSelect, filter }: {
  node: ArtifactNode
  depth?: number
  selectedPath: string
  onSelect: (path: string) => void
  filter: string
}) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'directory'
  const isSelected = node.path === selectedPath

  // Auto-expand when filter is active
  useEffect(() => {
    if (filter) setOpen(true)
  }, [filter])

  // Filter matching
  const matchesFilter = useMemo(() => {
    if (!filter) return true
    const lower = filter.toLowerCase()
    return node.name.toLowerCase().includes(lower)
  }, [node.name, filter])

  const childMatches = useMemo(() => {
    if (!filter || !node.children) return false
    return node.children.some(
      (c) => c.name.toLowerCase().includes(filter.toLowerCase()) ||
        (c.children?.some((cc) => cc.name.toLowerCase().includes(filter.toLowerCase())))
    )
  }, [filter, node.children])

  if (filter && !matchesFilter && !childMatches && !isDir) return null
  if (filter && !matchesFilter && isDir && !childMatches) return null

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) { setOpen(!open) } else { onSelect(node.path) }
        }}
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors ${
          isSelected
            ? 'bg-indigo-500/20 text-indigo-300'
            : filter && matchesFilter && !isDir
              ? 'text-yellow-300 hover:bg-slate-800/60'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
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
        {node.size != null && !isDir && (
          <span className="ml-auto shrink-0 text-[10px] text-slate-600">{formatSize(node.size)}</span>
        )}
      </button>
      {isDir && open && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} filter={filter} />
      ))}
    </div>
  )
}

// ── File icon resolver ─────────────────────────────────────
function getFileIcon(path: string, className = 'h-3.5 w-3.5 shrink-0') {
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(path)) return <FileImage className={`${className} text-pink-400`} />
  if (/\.(csv|tsv|xlsx?)$/i.test(path)) return <FileSpreadsheet className={`${className} text-green-400`} />
  if (/\.(py|js|ts|jsx|tsx|java|go|rs|cpp|c|h|hpp)$/i.test(path)) return <FileCode className={`${className} text-blue-400`} />
  if (/\.(md|txt|tex)$/i.test(path)) return <FileText className={`${className} text-slate-400`} />
  if (/\.(zip|tar|gz|bz2|7z)$/i.test(path)) return <FileArchive className={`${className} text-amber-400`} />
  return <File className={`${className} text-slate-500`} />
}

// ── CSV / TSV table renderer ───────────────────────────────
function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => {
    const lines = content.split('\n').filter(Boolean)
    if (lines.length === 0) return { headers: [] as string[], data: [] as string[][] }
    const delimiter = content.includes('\t') ? '\t' : ','
    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''))
    const data = lines.slice(1).map((line) => line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, '')))
    return { headers, data }
  }, [content])

  if (rows.headers.length === 0) {
    return <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs text-slate-300">{content}</pre>
  }

  return (
    <div className="overflow-auto rounded-md border border-slate-800">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="bg-slate-800/80">
            {rows.headers.map((h, i) => (
              <th key={i} className="sticky top-0 px-3 py-2 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.data.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-900/20'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-slate-400 border-b border-slate-800/50 max-w-xs truncate" title={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── File extension badge ───────────────────────────────────
function ExtensionBadge({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toUpperCase() || ''
  return (
    <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{ext}</span>
  )
}

export default function ArtifactViewer({ runId }: Props) {
  const [tree, setTree] = useState<ArtifactNode | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [treeLoading, setTreeLoading] = useState(true)

  useEffect(() => {
    setTreeLoading(true)
    api.listArtifacts(runId).then((res) => {
      setTree(res.tree)
    }).catch(() => setTree(null))
      .finally(() => setTreeLoading(false))
  }, [runId])

  const loadContent = useCallback(async (path: string) => {
    setSelectedPath(path)
    setContent(null)
    setLoading(true)
    setError(null)
    try {
      const data = await api.getArtifact(runId, path)
      setContent(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
      setContent(null)
    } finally {
      setLoading(false)
    }
  }, [runId])

  const downloadFile = useCallback(() => {
    if (!content) return
    let blob: Blob
    if (content.encoding === 'base64') {
      const binary = atob(content.content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: content.mime_type || 'application/octet-stream' })
    } else {
      blob = new Blob([content.content], { type: content.mime_type || 'text/plain' })
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedPath.split('/').pop() || 'download'
    a.click()
    URL.revokeObjectURL(url)
  }, [content, selectedPath])

  const renderPreview = () => {
    if (!selectedPath) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 text-slate-700" />
            <p className="mt-3 text-sm text-slate-500">选择左侧文件以预览</p>
          </div>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
            加载中...
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-2 text-sm text-red-400">{error}</p>
          </div>
        </div>
      )
    }

    if (!content) return null

    const mime = content.mime_type || ''
    const path = content.path || ''

    // ── Images ──────────────────────────────────────────────
    if (mime.startsWith('image/')) {
      if (content.encoding !== 'base64') {
        return <p className="text-sm text-slate-500">无法渲染此图片（编码格式不支持）</p>
      }
      return (
        <div className="flex items-start justify-center">
          <img src={`data:${mime};base64,${content.content}`} alt={path} className="max-w-full rounded-lg border border-slate-800 shadow-lg" />
        </div>
      )
    }

    // ── PDF (show download hint) ────────────────────────────
    if (mime === 'application/pdf') {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <File className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">PDF 文件暂不支持内联预览</p>
            <button onClick={downloadFile} className="btn-ghost mt-3 text-xs">
              <Download className="mr-1 inline h-3.5 w-3.5" />
              下载后查看
            </button>
          </div>
        </div>
      )
    }

    // ── Binary files (non-image) ────────────────────────────
    if (content.encoding === 'base64' && !mime.startsWith('image/')) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <FileArchive className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">二进制文件无法内联预览</p>
            <p className="mt-1 text-xs text-slate-600">{mime}</p>
            <button onClick={downloadFile} className="btn-ghost mt-3 text-xs">
              <Download className="mr-1 inline h-3.5 w-3.5" />
              下载文件
            </button>
          </div>
        </div>
      )
    }

    // ── Markdown ────────────────────────────────────────────
    if (path.endsWith('.md')) {
      return <MarkdownPreview content={content.content} />
    }

    // ── CSV / TSV ───────────────────────────────────────────
    if (/\.(csv|tsv)$/i.test(path)) {
      return <CsvTable content={content.content} />
    }

    // ── Code / text with syntax highlighting ────────────────
    const ext = '.' + path.split('.').pop()?.toLowerCase()
    const lang = EXT_TO_LANG[ext]

    if (lang) {
      return (
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={lang}
          showLineNumbers
          showInlineLineNumbers
          wrapLongLines
          customStyle={{
            margin: 0,
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            lineHeight: '1.4',
            maxHeight: 'calc(100vh - 280px)',
          }}
        >
          {content.content}
        </SyntaxHighlighter>
      )
    }

    // ── Plain text fallback ─────────────────────────────────
    const lineCount = content.content.split('\n').length
    return (
      <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs font-mono text-slate-300" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {content.content}
        {lineCount > 1 && (
          <span className="mt-3 block border-t border-slate-800 pt-2 text-[10px] text-slate-600">{lineCount} 行</span>
        )}
      </pre>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* ── File tree ─────────────────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
        <div className="relative border-b border-slate-800">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            placeholder="搜索文件..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-transparent py-2 pl-8 pr-3 text-xs text-slate-300 placeholder-slate-600 outline-none"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {treeLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
            </div>
          ) : tree?.children?.length ? (
            tree.children.map((child) => (
              <FileTreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={loadContent} filter={filter} />
            ))
          ) : (
            <p className="py-8 text-center text-xs text-slate-600">无产物文件</p>
          )}
        </div>
      </div>

      {/* ── Preview panel ────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/30">
        {selectedPath && content && (
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {getFileIcon(selectedPath, 'h-4 w-4 shrink-0')}
              <span className="truncate text-xs font-mono text-slate-400">{selectedPath}</span>
              <ExtensionBadge path={selectedPath} />
            </div>
            <button
              onClick={downloadFile}
              className="btn-ghost text-xs px-2 py-1 shrink-0"
              title="下载文件"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4">
          {renderPreview()}
        </div>
      </div>
    </div>
  )
}
