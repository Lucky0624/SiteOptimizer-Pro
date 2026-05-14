import { useState, useEffect, useMemo } from 'react'
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
import { Timer } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { QuotaHistoryItem } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import GlassCard from '../components/ui/GlassCard'
import QuotaBar from '../components/ui/QuotaBar'
import QuotaDonut from '../components/charts/QuotaDonut'

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload) return null
  return (
    <div className="rounded-xl backdrop-blur-xl p-3" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-glass)' }}>
      <p className="mb-2 text-xs theme-text-secondary">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

function ResetCountdown() {
  const { t } = useI18n()
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setHours(24, 0, 0, 0)
      const diff = tomorrow.getTime() - now.getTime()
      if (diff <= 0) {
        setRemaining(t('quota.resetPending'))
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${h}h ${m}m ${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [t])

  return <span className="font-mono text-sm" style={{ color: 'var(--accent-cyan)' }}>{remaining}</span>
}

export default function QuotaMonitor() {
  const { t } = useI18n()
  const { data: quotaData } = useApi(() => api.quota.getStatus())
  const { data: history } = useApi(() => api.quota.getHistory(30))

  const quotaMap = quotaData?.quotas.reduce((acc, q) => {
    acc[q.api_type] = q
    return acc
  }, {} as Record<string, { used: number; limit: number; remaining: number }>) ?? {}

  const chartData = useMemo(() => {
    if (!history) return []
    const grouped: Record<string, { date: string; gsc?: number; inspection?: number; indexing?: number }> = {}
    for (const item of history) {
      const dateKey = item.usage_date
      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: dateKey }
      }
      if (item.api_type === 'gsc') grouped[dateKey].gsc = item.used_count
      else if (item.api_type === 'inspection') grouped[dateKey].inspection = item.used_count
      else if (item.api_type === 'indexing') grouped[dateKey].indexing = item.used_count
    }
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
  }, [history])

  const consumptionLog = useMemo(() => {
    if (!history) return []
    return history.slice(-10).reverse().map((point: QuotaHistoryItem) => ({
      date: point.usage_date,
      api_type: point.api_type,
      used: point.used_count,
      limit: point.limit_count,
    }))
  }, [history])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-6" glowColor="cyan">
          <QuotaDonut
            used={quotaMap['gsc']?.used ?? 0}
            limit={quotaMap['gsc']?.limit ?? 100000}
            label={t('quota.gsc')}
            color="#00f0ff"
          />
          <div className="mt-4">
            <QuotaBar
              used={quotaMap['gsc']?.used ?? 0}
              limit={quotaMap['gsc']?.limit ?? 100000}
              label={t('quota.gscDaily')}
              color="var(--accent-cyan)"
            />
          </div>
        </GlassCard>

        <GlassCard className="p-6" glowColor="purple">
          <QuotaDonut
            used={quotaMap['inspection']?.used ?? 0}
            limit={quotaMap['inspection']?.limit ?? 2000}
            label={t('quota.inspection')}
            color="#b026ff"
          />
          <div className="mt-4">
            <QuotaBar
              used={quotaMap['inspection']?.used ?? 0}
              limit={quotaMap['inspection']?.limit ?? 2000}
              label={t('quota.inspectionDaily')}
              color="var(--accent-purple)"
            />
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <QuotaDonut
            used={quotaMap['indexing']?.used ?? 0}
            limit={quotaMap['indexing']?.limit ?? 200}
            label={t('quota.indexing')}
            color="#00ff88"
          />
          <div className="mt-4">
            <QuotaBar
              used={quotaMap['indexing']?.used ?? 0}
              limit={quotaMap['indexing']?.limit ?? 200}
              label={t('quota.indexingDaily')}
              color="var(--accent-success)"
            />
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('quota.usageHistory')}</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="qGsc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="qInsp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b026ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#b026ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="qIdx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="#8888aa" tick={{ fill: '#8888aa', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <YAxis stroke="#8888aa" tick={{ fill: '#8888aa', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>} />
              <Area type="monotone" dataKey="gsc" name="GSC" stroke="#00f0ff" strokeWidth={2} fill="url(#qGsc)" />
              <Area type="monotone" dataKey="inspection" name="Inspection" stroke="#b026ff" strokeWidth={2} fill="url(#qInsp)" />
              <Area type="monotone" dataKey="indexing" name="Indexing" stroke="#00ff88" strokeWidth={2} fill="url(#qIdx)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center theme-text-secondary">{t('quota.noHistory')}</div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-6">
          <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('quota.resetCountdown')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)' }}>
              <span className="text-sm theme-text-secondary">{t('quota.dailyReset')}</span>
              <div className="flex items-center gap-2">
                <Timer size={14} style={{ color: 'var(--accent-cyan)' }} />
                <ResetCountdown />
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('quota.recentConsumption')}</h2>
          <div className="space-y-2">
            {consumptionLog.map((entry, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <span className="text-xs theme-text-secondary">{entry.date}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="theme-text-secondary">{entry.api_type}</span>
                  <span className="theme-text-primary">{entry.used} / {entry.limit}</span>
                </div>
              </div>
            ))}
            {!consumptionLog.length && (
              <p className="py-4 text-center text-sm theme-text-secondary">{t('quota.noConsumption')}</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
