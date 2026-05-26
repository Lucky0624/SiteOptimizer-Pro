import { Globe, CheckCircle, Zap, TrendingDown, MousePointer, Eye, Target } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { useWebsite } from '../context/WebsiteContext'
import { useToast } from '../context/ToastContext'
import StatCard from '../components/ui/StatCard'
import GlassCard from '../components/ui/GlassCard'
import QuotaBar from '../components/ui/QuotaBar'
import TrafficChart from '../components/charts/TrafficChart'
import ConversionChart from '../components/charts/ConversionChart'
import PriorityIndicator from '../components/ui/PriorityIndicator'
import WebsiteSelector from '../components/common/WebsiteSelector'

export default function Dashboard() {
  const { t } = useI18n()
  const { selectedWebsiteId, setSelectedWebsiteId } = useWebsite()
  const { showToast } = useToast()

  const { data: stats } = useApi(() => api.dashboard.getStats(selectedWebsiteId ?? undefined), [selectedWebsiteId])
  const { data: trends } = useApi(() => api.dashboard.getTrends(30, selectedWebsiteId ?? undefined), [selectedWebsiteId])
  const { data: opportunities } = useApi(() => api.dashboard.getTopOpportunities(5, selectedWebsiteId ?? undefined), [selectedWebsiteId])
  const { data: quotaData } = useApi(() => api.quota.getStatus())

  const quotaMap = quotaData?.quotas.reduce((acc, q) => {
    acc[q.api_type] = q
    return acc
  }, {} as Record<string, { used: number; limit: number; remaining: number }>) ?? {}

  const handleRunCycle = async () => {
    if (!confirm(t('dashboard.runCycleConfirm'))) return
    try {
      await api.dashboard.runCycle(selectedWebsiteId ?? undefined)
      showToast(t('dashboard.runCycleSuccess'), 'success')
      window.location.reload()
    } catch (err: any) {
      showToast(`${t('dashboard.runCycleFail')}: ${err.message}`, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold theme-text-primary">{t('dashboard.title')}</h1>
          <WebsiteSelector value={selectedWebsiteId} onChange={setSelectedWebsiteId} />
        </div>
        <button
          onClick={handleRunCycle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--accent-cyan)', color: 'var(--bg-base)' }}
        >
          <Zap size={16} /> {t('dashboard.runCycle')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t('dashboard.totalUrls')} value={stats?.total_urls ?? 0} icon={<Globe size={20} />} color="var(--accent-cyan)" />
        <StatCard title={t('dashboard.indexed')} value={stats?.indexed_count ?? 0} icon={<CheckCircle size={20} />} color="var(--accent-success)" />
        <StatCard title={t('dashboard.opportunities')} value={stats?.opportunity_count ?? 0} icon={<Zap size={20} />} color="var(--accent-purple)" />
        <StatCard title={t('dashboard.decaying')} value={stats?.decaying_count ?? 0} icon={<TrendingDown size={20} />} color="var(--accent-error)" />
      </div>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold theme-text-primary">{t('dashboard.trafficTrends')}</h2>
          <div className="flex items-center gap-4 text-xs theme-text-secondary">
            <span className="flex items-center gap-1"><MousePointer size={12} style={{ color: 'var(--accent-cyan)' }} /> {t('dashboard.clicks')}</span>
            <span className="flex items-center gap-1"><Eye size={12} style={{ color: 'var(--accent-purple)' }} /> {t('dashboard.impressions')}</span>
            <span className="flex items-center gap-1"><Target size={12} style={{ color: 'var(--accent-success)' }} /> {t('dashboard.ctr')}</span>
          </div>
        </div>
        {trends?.data ? (
          <TrafficChart data={trends.data} />
        ) : (
          <div className="flex h-[320px] items-center justify-center theme-text-secondary">{t('dashboard.loadingChart')}</div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="col-span-1 p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('dashboard.topOpportunities')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                  <th className="pb-3 font-medium">URL</th>
                  <th className="pb-3 font-medium">{t('dashboard.priority')}</th>
                  <th className="pb-3 font-medium">{t('dashboard.impressions')}</th>
                  <th className="pb-3 font-medium">{t('dashboard.ctr')}</th>
                </tr>
              </thead>
              <tbody>
                {opportunities?.items.map((item) => (
                  <tr key={item.url_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td className="py-3 pr-4">
                      <p className="max-w-[200px] truncate text-sm font-medium theme-text-primary">{item.url}</p>
                      <p className="text-xs theme-text-secondary">{t('dashboard.position')} {item.position.toFixed(1)}</p>
                    </td>
                    <td className="py-3 pr-4"><PriorityIndicator score={item.priority_score} /></td>
                    <td className="py-3 pr-4 text-sm theme-text-primary">{item.impressions.toLocaleString()}</td>
                    <td className="py-3 text-sm theme-text-primary">{item.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
                {!opportunities?.items.length && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm theme-text-secondary">{t('dashboard.noOpportunities')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('dashboard.conversionTrends')}</h2>
          {trends?.data ? (
            <ConversionChart data={trends.data} />
          ) : (
            <div className="flex h-[240px] items-center justify-center theme-text-secondary">{t('dashboard.loadingChart')}</div>
          )}
          <div className="mt-4 space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider theme-text-secondary">{t('dashboard.quotaUsage')}</h3>
            <QuotaBar used={quotaMap['gsc']?.used ?? 0} limit={quotaMap['gsc']?.limit ?? 100000} label={t('quota.gsc')} color="var(--accent-cyan)" />
            <QuotaBar used={quotaMap['inspection']?.used ?? 0} limit={quotaMap['inspection']?.limit ?? 2000} label={t('quota.inspection')} color="var(--accent-purple)" />
            <QuotaBar used={quotaMap['indexing']?.used ?? 0} limit={quotaMap['indexing']?.limit ?? 200} label={t('quota.indexing')} color="var(--accent-success)" />
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
