import { DollarSign, TrendingUp } from 'lucide-react'

interface Props {
  totalCost?: number
  breakdown?: Record<string, number>
  budget?: number
}

export function CostTracker({ totalCost = 0, breakdown = {}, budget }: Props) {
  const pct = budget ? Math.min((totalCost / budget) * 100, 100) : null

  return (
    <div className="bg-surface-overlay border border-surface-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <DollarSign size={15} className="text-warning" />
        Cost Tracker
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl font-mono text-warning">
          ${totalCost.toFixed(4)}
        </span>
        {budget != null && (
          <span className="text-sm text-muted mb-0.5">/ ${budget.toFixed(2)} budget</span>
        )}
      </div>

      {pct !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted">
            <span>Budget used</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct > 80 ? 'bg-danger' : pct > 50 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {Object.keys(breakdown).length > 0 && (
        <div className="space-y-1 pt-1 border-t border-surface-border">
          <p className="text-xs text-muted flex items-center gap-1">
            <TrendingUp size={11} /> Breakdown
          </p>
          {Object.entries(breakdown).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-muted capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="font-mono">${v.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
