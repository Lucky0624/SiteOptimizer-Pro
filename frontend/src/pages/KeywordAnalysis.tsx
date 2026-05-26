import { useState } from 'react'
import { Search, RefreshCw, TrendingUp, Eye, MousePointerClick, BarChart2 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { KeywordClusterItem, KeywordItem, KeywordPageMapItem } from '../services/api'
import { useWebsite } from '../context/WebsiteContext'
import { useToast } from '../context/ToastContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import WebsiteSelector from '../components/common/WebsiteSelector'

const sortOptions = [
  { value: 'clicks', label: '点击数' },
  { value: 'impressions', label: '曝光量' },
  { value: 'position', label: '平均排名' },
  { value: 'ctr', label: '点击率' },
]

const daysOptions = [7, 14, 30, 60, 90]

function getPositionColor(pos: number): string {
  if (pos <= 3) return 'var(--accent-success)'
  if (pos <= 10) return 'var(--accent-warning)'
  return 'var(--accent-error)'
}

export default function KeywordAnalysis() {
  const { selectedWebsiteId, setSelectedWebsiteId } = useWebsite()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('clicks')
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [collecting, setCollecting] = useState(false)
  const [selectedKeyword, setSelectedKeyword] = useState<string | undefined>(undefined)

  const { data, loading, refetch } = useApi(
    () => api.keywords.list({ website_id: selectedWebsiteId ?? undefined, days, search: search || undefined, sort_by: sortBy, page, page_size: 50 }),
    [selectedWebsiteId, days, search, sortBy, page]
  )
  const { data: pageMap, refetch: refetchPageMap } = useApi(
    () => api.keywords.pageMap({ website_id: selectedWebsiteId ?? undefined, days, limit: 20 }),
    [selectedWebsiteId, days]
  )
  const { data: clusters, refetch: refetchClusters } = useApi(
    () => api.keywords.clusters({ website_id: selectedWebsiteId ?? undefined, days, limit: 12 }),
    [selectedWebsiteId, days]
  )
  const { data: trends, refetch: refetchTrends } = useApi(
    () => api.keywords.trends({ website_id: selectedWebsiteId ?? undefined, keyword: selectedKeyword, days }),
    [selectedWebsiteId, selectedKeyword, days]
  )

  const handleCollect = async () => {
    if (!selectedWebsiteId) {
      showToast('请先选择一个已配置 GSC 的站点', 'warning')
      return
    }
    setCollecting(true)
    try {
      const res = await api.keywords.collect(selectedWebsiteId, days, 20)
      showToast(`已扫描 ${res.urls_scanned} 个页面，导入 ${res.keywords_imported} 条关键词`, 'success')
      refetch()
      refetchPageMap()
      refetchClusters()
      refetchTrends()
    } catch (err: any) {
      showToast(err.message || '关键词采集失败', 'error')
    } finally {
      setCollecting(false)
    }
  }

  const statCards = [
    { label: '关键词总数', value: data?.total ?? 0, icon: <BarChart2 size={18} />, color: 'var(--accent-cyan)' },
    { label: '总点击数', value: data?.items.reduce((s, i) => s + i.clicks, 0) ?? 0, icon: <MousePointerClick size={18} />, color: 'var(--accent-success)' },
    { label: '总曝光量', value: data?.items.reduce((s, i) => s + i.impressions, 0) ?? 0, icon: <Eye size={18} />, color: 'var(--accent-warning)' },
    { label: '平均排名', value: data?.items.length ? (data.items.reduce((s, i) => s + i.position, 0) / data.items.length).toFixed(1) : '-', icon: <TrendingUp size={18} />, color: '#a78bfa' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold theme-text-primary">关键词分析</h1>
        <div className="flex items-center gap-2">
          <WebsiteSelector value={selectedWebsiteId} onChange={setSelectedWebsiteId} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((s) => (
          <GlassCard key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1" style={{ color: s.color }}>{s.icon}<span className="text-xs theme-text-secondary">{s.label}</span></div>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-secondary" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="搜索关键词..." className="h-9 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="h-9 rounded-xl px-3 text-sm outline-none"
          style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}>
          {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}排序</option>)}
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="h-9 rounded-xl px-3 text-sm outline-none"
          style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}>
          {daysOptions.map(d => <option key={d} value={d}>近 {d} 天</option>)}
        </select>
          <GlowButton variant="secondary" onClick={() => refetch()}><RefreshCw size={14} /> 刷新</GlowButton>
          <GlowButton onClick={handleCollect} disabled={collecting}>
            <RefreshCw size={14} className={collecting ? 'animate-spin' : ''} /> {collecting ? '采集中...' : '采集站点关键词'}
          </GlowButton>
      </div>

      <GlassCard className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold theme-text-primary">每日关键词趋势</h2>
            <p className="mt-1 text-xs theme-text-secondary">
              {selectedKeyword ? `当前关键词：${selectedKeyword}` : '全部关键词汇总'}
            </p>
          </div>
          {selectedKeyword && (
            <GlowButton variant="secondary" size="sm" onClick={() => setSelectedKeyword(undefined)}>
              查看全部
            </GlowButton>
          )}
        </div>
        {trends?.length ? (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="keywordClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Area type="monotone" dataKey="clicks" name="点击" stroke="var(--accent-cyan)" fill="url(#keywordClicks)" strokeWidth={2} />
                <Area type="monotone" dataKey="impressions" name="曝光" stroke="var(--accent-warning)" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-16 text-center text-sm theme-text-secondary">采集关键词后可查看每日趋势</p>
        )}
      </GlassCard>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                <th className="px-4 py-3 font-medium">关键词</th>
                <th className="px-4 py-3 font-medium text-right">点击</th>
                <th className="px-4 py-3 font-medium text-right">曝光</th>
                <th className="px-4 py-3 font-medium text-right">CTR</th>
                <th className="px-4 py-3 font-medium text-right">排名</th>
                <th className="px-4 py-3 font-medium text-right">日期</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-12 text-center theme-text-secondary">加载中...</td></tr>}
              {!loading && !data?.items.length && (
                <tr><td colSpan={6} className="px-4 py-12 text-center theme-text-secondary">
                  暂无关键词数据。请先在 URL 管理页面，对指定 URL 触发关键词抓取。
                </td></tr>
              )}
              {data?.items.map((kw: KeywordItem, i: number) => (
                <tr
                  key={`${kw.keyword}-${i}`}
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                  className="cursor-pointer hover:opacity-90"
                  onClick={() => setSelectedKeyword(kw.keyword)}
                >
                  <td className="px-4 py-3 font-medium theme-text-primary max-w-[300px] truncate">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--accent-success)' }}>{kw.clicks.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right theme-text-secondary">{kw.impressions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right theme-text-secondary">{(kw.ctr * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: getPositionColor(kw.position) }}>
                    #{kw.position.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs theme-text-secondary">{kw.snapshot_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > 50 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-xs theme-text-secondary">{(page-1)*50+1}-{Math.min(page*50,data.total)} / {data.total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page-1))} disabled={page===1} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>上一页</button>
              <button onClick={() => setPage(page+1)} disabled={page*50>=data.total} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>下一页</button>
            </div>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <GlassCard>
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-sm font-semibold theme-text-primary">页面-关键词映射</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium text-right">关键词</th>
                  <th className="px-4 py-3 font-medium text-right">曝光</th>
                </tr>
              </thead>
              <tbody>
                {pageMap?.map((item: KeywordPageMapItem) => (
                  <tr key={item.url_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td className="px-4 py-3">
                      <p className="max-w-[320px] truncate text-xs theme-text-primary">{item.url}</p>
                      <p className="mt-1 text-[10px] theme-text-secondary">
                        {item.top_keywords.slice(0, 4).map(k => k.keyword).join(' / ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right theme-text-secondary">{item.keyword_count}</td>
                    <td className="px-4 py-3 text-right theme-text-secondary">{item.impressions.toLocaleString()}</td>
                  </tr>
                ))}
                {!pageMap?.length && (
                  <tr><td colSpan={3} className="px-4 py-10 text-center theme-text-secondary">暂无页面映射数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-sm font-semibold theme-text-primary">关键词聚类</h2>
          </div>
          <div className="space-y-3 p-4">
            {clusters?.map((cluster: KeywordClusterItem) => (
              <div key={cluster.cluster} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold theme-text-primary">{cluster.cluster}</span>
                  <span className="text-xs theme-text-secondary">{cluster.impressions.toLocaleString()} 曝光</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cluster.keywords.slice(0, 8).map(kw => (
                    <span key={kw} className="rounded-full px-2 py-1 text-[10px]" style={{ backgroundColor: 'rgba(0,240,255,0.1)', color: 'var(--accent-cyan)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!clusters?.length && (
              <p className="py-10 text-center text-sm theme-text-secondary">暂无关键词聚类数据</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
