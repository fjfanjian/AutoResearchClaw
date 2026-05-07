import { useState, useEffect } from 'react'
import { Download, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '@/api/client'
import { useRuns } from '@/hooks/useRuns'
import MarkdownPreview from '@/components/MarkdownPreview'
import type { ArtifactNode } from '@/types'

export default function DeliverablesPage() {
  const { runs } = useRuns()
  const [selectedRun, setSelectedRun] = useState('')
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null)
  const [paper, setPaper] = useState('')
  const [verification, setVerification] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!selectedRun) return
    const load = async () => {
      try {
        const tree = await api.listArtifacts(selectedRun)
        const find = (node: ArtifactNode, name: string): string | null => {
          if (node.name === name) return node.path
          for (const child of node.children || []) {
            const found = find(child, name)
            if (found) return found
          }
          return null
        }
        const treeRoot = tree.tree

        const paperPath = find(treeRoot, 'paper_final.md')
        if (paperPath) {
          const content = await api.getArtifact(selectedRun, paperPath)
          setPaper(content.content)
        } else {
          setPaper('')
        }

        const manifestPath = find(treeRoot, 'manifest.json')
        if (manifestPath) {
          const content = await api.getArtifact(selectedRun, manifestPath)
          setManifest(JSON.parse(content.content))
        } else {
          setManifest(null)
        }

        const verifyPath = find(treeRoot, 'verification_report.json')
        if (verifyPath) {
          const content = await api.getArtifact(selectedRun, verifyPath)
          setVerification(JSON.parse(content.content))
        } else {
          setVerification(null)
        }
      } catch {
        setPaper('')
        setManifest(null)
        setVerification(null)
      }
    }
    load()
  }, [selectedRun])

  const completedRuns = runs.filter((r) => r.status === 'completed' || r.status === 'done')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
        <FileText className="h-5 w-5 text-indigo-400" />
        交付物
      </h1>

      <div className="card p-4">
        <label className="text-xs text-slate-500">选择运行</label>
        <select
          value={selectedRun}
          onChange={(e) => setSelectedRun(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">选择一个已完成的运行...</option>
          {completedRuns.map((r) => (
            <option key={r.run_id} value={r.run_id}>{r.run_id} — {r.topic || '无主题'}</option>
          ))}
        </select>
      </div>

      {selectedRun && (
        <div className="space-y-6">
          {manifest && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">清单</h3>
              <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs font-mono text-slate-400">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </div>
          )}

          {paper && (
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-400" />
                  论文
                </h3>
                <button
                  onClick={() => {
                    const blob = new Blob([paper], { type: 'text/markdown' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'paper_final.md'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  <Download className="h-3.5 w-3.5" /> 下载
                </button>
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-800 bg-slate-950/50 p-4">
                <MarkdownPreview content={paper} />
              </div>
            </div>
          )}

          {verification && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2">
                {verification.integrity_score === 1 ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                )}
                验证报告
              </h3>
              <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs font-mono text-slate-400">
                {JSON.stringify(verification, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
