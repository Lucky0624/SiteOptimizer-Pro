import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TrendDataPoint } from '../../services/api'

interface ConversionChartProps {
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

export default function ConversionChart({ data }: ConversionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradientConversions" x1="0" y1="0" x2="0" y2="1">
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
        <Area
          type="monotone"
          dataKey="conversions"
          name="Conversions"
          stroke="#00ff88"
          strokeWidth={2}
          fill="url(#gradientConversions)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
