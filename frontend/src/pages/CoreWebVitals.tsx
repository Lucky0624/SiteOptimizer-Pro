import { useState } from 'react'
import { Gauge, RefreshCw, Zap } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { useWebsite } from '../context/WebsiteContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import WebsiteSelector from '../components/common/WebsiteSelector'

// 直接从 /api/urls 列表获取有 PSI 数据的快照（使用快照接口聚合）

function ScoreGauge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs theme-text-secondary">-</span>
  const color = score >= 90 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-error)'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-8 w-8">
        <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${(score / 100) * 94} 94`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

function MetricBadge({ label, value, unit, thresholds }: { label: string; value: number | null; unit: string; thresholds: [number, number] }) {
  if (value === null) return <div className="rounded-lg px-3 py-2 text-center" style={{ backgroundColor: 'var(--bg-input)' }}><p className="text-xs theme-text-secondary">{label}</p><p className="text-sm font-semibold theme-text-secondary">-</p></div>
  const color = value <= thresholds[0] ? 'var(--accent-success)' : value <= thresholds[1] ? 'var(--accent-warning)' : 'var(--accent-error)'
  const display = value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(0)}${unit}`
  return (
    <div className="rounded-lg px-3 py-2 text-center" style={{ backgroundColor: 'var(--bg-input)', border: `1px solid ${color}30` }}>
      <p className="text-xs theme-text-secondary">{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{display}</p>
    </div>
  )
}

export default function CoreWebVitals() {
  const { selectedWebsiteId, setSelectedWebsiteId } = useWebsite()
  const [page, setPage] = useState(1)

  // 从 URL 列表中获取带 PSI 数据的记录（通过快照最新值）
  const { data, loading, refetch } = useApi(
    () => api.urls.list({ page, page_size: 20, website_id: selectedWebsiteId ?? undefined, sort_by: 'priority_score' }),
    [selectedWebsiteId, page]
  )

  // 统计
  const urlsWithPsi = data?.items.filter((u: any) => u.latest_snapshot?.performance_score !== null) ?? []
  const avgScore = urlsWithPsi.length
    ? Math.round(urlsWithPsi.reduce((s: number, u: any) => s + (u.latest_snapshot?.performance_score ?? 0), 0) / urlsWithPsi.length)
    : null

  const statCards = [
    { label: '已分析页面', value: data?.total ?? 0, color: 'var(--accent-cyan)', icon: <Gauge size={16} /> },
    { label: '平均性能分', value: avgScore ?? '-', color: avgScore && avgScore >= 90 ? 'var(--accent-success)' : avgScore && avgScore >= 50 ? 'var(--accent-warning)' : 'var(--accent-error)', icon: <Zap size={16} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold theme-text-primary">Core Web Vitals 速度看板</h1>
        <div className="flex items-center gap-2">
          <WebsiteSelector value={selectedWebsiteId} onChange={setSelectedWebsiteId} />
          <GlowButton variant="secondary" onClick={() => refetch()}><RefreshCw size={14} /> 刷新</GlowButton>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
        <GlassCard className="p-4 col-span-1">
          <p className="text-xs theme-text-secondary mb-1">LCP 标准</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-success)' }}>优秀</span>: &lt; 2.5s</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-warning)' }}>需改进</span>: 2.5-4s</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-error)' }}>差</span>: &gt; 4s</p>
        </GlassCard>
        <GlassCard className="p-4 col-span-1">
          <p className="text-xs theme-text-secondary mb-1">CLS 标准</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-success)' }}>优秀</span>: &lt; 0.1</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-warning)' }}>需改进</span>: 0.1-0.25</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-error)' }}>差</span>: &gt; 0.25</p>
        </GlassCard>
        <GlassCard className="p-4 col-span-1">
          <p className="text-xs theme-text-secondary mb-1">TBT 标准</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-success)' }}>优秀</span>: &lt; 200ms</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-warning)' }}>需改进</span>: 200-600ms</p>
          <p className="text-xs"><span style={{ color: 'var(--accent-error)' }}>差</span>: &gt; 600ms</p>
        </GlassCard>
        {statCards.map(s => (
          <GlassCard key={s.label} className="p-4 col-span-1">
            <div className="flex items-center gap-1 mb-1" style={{ color: s.color }}>{s.icon}<span className="text-xs theme-text-secondary">{s.label}</span></div>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium text-center">Lighthouse 评分</th>
                <th className="px-4 py-3 font-medium text-center">LCP</th>
                <th className="px-4 py-3 font-medium text-center">CLS</th>
                <th className="px-4 py-3 font-medium text-center">TBT</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-4 py-12 text-center theme-text-secondary">加载中...</td></tr>}
              {!loading && !data?.items.length && (
                <tr><td colSpan={5} className="px-4 py-12 text-center theme-text-secondary">
                  暂无速度数据。PSI 数据在每日 SEO 循环中自动采集。
                </td></tr>
              )}
              {data?.items.map((url: any) => {
                const snap = url.latest_snapshot
                return (
                  <tr key={url.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="hover:opacity-90">
                    <td className="px-4 py-3">
                      <p className="max-w-[300px] truncate text-xs theme-text-primary">{url.url}</p>
                      <p className="text-[10px] theme-text-secondary">{url.title || '无标题'}</p>
                    </td>
                    <td className="px-4 py-3 text-center"><ScoreGauge score={snap?.performance_score ?? null} /></td>
                    <td className="px-4 py-3 text-center">
                      <MetricBadge label="LCP" value={snap?.lcp_value ?? null} unit="ms" thresholds={[2500, 4000]} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MetricBadge label="CLS" value={snap?.cls_value ?? null} unit="" thresholds={[0.1, 0.25]} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MetricBadge label="TBT" value={snap?.fid_value ?? null} unit="ms" thresholds={[200, 600]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-xs theme-text-secondary">第 {page} 页 / 共 {Math.ceil(data.total / 20)} 页</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page-1))} disabled={page===1} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>上一页</button>
              <button onClick={() => setPage(page+1)} disabled={page*20>=data.total} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>下一页</button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
