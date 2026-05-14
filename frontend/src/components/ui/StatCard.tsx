import { type ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import GlassCard from './GlassCard'

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: ReactNode
  color?: string
}

export default function StatCard({ title, value, change, icon, color = '#00f0ff' }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0

  return (
    <GlassCard className="p-5" hoverable glowColor={change !== undefined && change < 0 ? 'purple' : 'cyan'}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider theme-text-secondary">{title}</p>
          <p className="text-3xl font-bold theme-text-primary">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'theme-accent-success' : 'theme-accent-error'}`}>
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{isPositive ? '+' : ''}{change}%</span>
            </div>
          )}
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${color}15`,
            color,
            boxShadow: `0 0 15px ${color}20`,
          }}
        >
          {icon}
        </div>
      </div>
    </GlassCard>
  )
}
