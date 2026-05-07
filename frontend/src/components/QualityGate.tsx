import { Award } from 'lucide-react'

interface Props {
  scores?: Record<string, number>
  overall?: number
}

const DIM_LABELS: Record<string, string> = {
  novelty: 'Novelty',
  clarity: 'Clarity',
  rigor: 'Rigor',
  reproducibility: 'Reproducibility',
  impact: 'Impact',
  completeness: 'Completeness',
  citations: 'Citations',
}

export function QualityGate({ scores = {}, overall }: Props) {
  const entries = Object.entries(scores).filter(([k]) => k in DIM_LABELS)

  return (
    <div className="bg-surface-overlay border border-surface-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Award size={15} className="text-accent" />
        Quality Score
      </div>

      {overall != null && (
        <div className="flex items-end gap-2">
          <span
            className={`text-2xl font-mono ${
              overall >= 0.8
                ? 'text-success'
                : overall >= 0.6
                ? 'text-warning'
                : 'text-danger'
            }`}
          >
            {(overall * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-muted mb-0.5">overall</span>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-surface-border">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-muted">{DIM_LABELS[k] ?? k}</span>
                <span className="font-mono">{(v * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1 bg-surface-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    v >= 0.8 ? 'bg-success' : v >= 0.6 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${v * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
