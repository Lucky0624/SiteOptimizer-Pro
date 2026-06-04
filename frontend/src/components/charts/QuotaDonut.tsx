import { PieChart, Pie, Cell } from 'recharts'

interface QuotaDonutProps {
  used: number
  limit: number
  label: string
  color?: string
}

export default function QuotaDonut({ used, limit, label, color = '#00f0ff' }: QuotaDonutProps) {
  const remaining = Math.max(limit - used, 0)
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0
  const data = [
    { name: 'Used', value: used },
    { name: 'Remaining', value: remaining },
  ]

  return (
    <div className="relative flex flex-col items-center">
      <PieChart width={160} height={160}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={70}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          strokeWidth={0}
        >
          <Cell fill={color} stroke="none" />
          <Cell fill="rgba(255,255,255,0.05)" stroke="none" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#e0e0ff]">{percentage}%</span>
        <span className="text-[10px] text-[#8888aa]">{used}/{limit}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-[#8888aa]">{label}</p>
    </div>
  )
}
