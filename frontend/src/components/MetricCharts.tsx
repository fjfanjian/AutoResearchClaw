import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface MetricEntry {
  step: number
  [key: string]: number
}

interface Props {
  data: Record<string, unknown>
}

function parseMetrics(raw: Record<string, unknown>): {
  series: string[]
  data: MetricEntry[]
} {
  // Try to find numeric series in the metrics dict
  const series: string[] = []
  const dataMap: Record<number, MetricEntry> = {}

  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'number') {
      series.push(key)
      if (!dataMap[0]) dataMap[0] = { step: 0 }
      dataMap[0][key] = val
    } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
      series.push(key)
      ;(val as number[]).forEach((v, i) => {
        if (!dataMap[i]) dataMap[i] = { step: i }
        dataMap[i][key] = v
      })
    }
  }

  return { series, data: Object.values(dataMap) }
}

const COLORS = ['#58a6ff', '#3fb950', '#a371f7', '#d29922', '#f0883e', '#f85149']

export function MetricCharts({ data }: Props) {
  const { series, data: chartData } = parseMetrics(data)

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted text-sm">
        No metric data available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="step" stroke="#8b949e" tick={{ fontSize: 11 }} />
            <YAxis stroke="#8b949e" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: '#1c2333',
                border: '1px solid #30363d',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        /* Single-step: show as stat cards */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {series.map((s, i) => (
            <div
              key={s}
              className="bg-surface-overlay border border-surface-border rounded-lg p-3"
            >
              <p className="text-xs text-muted truncate">{s}</p>
              <p
                className="text-xl font-mono mt-1"
                style={{ color: COLORS[i % COLORS.length] }}
              >
                {typeof chartData[0]?.[s] === 'number'
                  ? (chartData[0][s] as number).toFixed(4)
                  : '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
