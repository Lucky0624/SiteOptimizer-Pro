import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { TrendDataPoint } from '../../services/api'

interface TrafficChartProps {
  data: TrendDataPoint[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload) return null
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(18,18,42,0.95)] backdrop-blur-xl p-3 shadow-glass">
      <p className="mb-2 text-xs text-[#8888aa]">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function TrafficChart({ data }: TrafficChartProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradientClicks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradientImpressions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#b026ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#b026ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradientCtr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="#8888aa"
          tick={{ fill: '#8888aa', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        />
        <YAxis
          stroke="#8888aa"
          tick={{ fill: '#8888aa', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#8888aa' }}
          formatter={(value: string) => <span style={{ color: '#8888aa' }}>{value}</span>}
        />
        <Area
          type="monotone"
          dataKey="clicks"
          name="Clicks"
          stroke="#00f0ff"
          strokeWidth={2}
          fill="url(#gradientClicks)"
        />
        <Area
          type="monotone"
          dataKey="impressions"
          name="Impressions"
          stroke="#b026ff"
          strokeWidth={2}
          fill="url(#gradientImpressions)"
        />
        <Area
          type="monotone"
          dataKey="ctr"
          name="CTR"
          stroke="#00ff88"
          strokeWidth={2}
          fill="url(#gradientCtr)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
