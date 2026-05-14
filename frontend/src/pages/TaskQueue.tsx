import { useState, useEffect } from 'react'
import { RotateCcw, Eye, Play, Shuffle } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import type { TaskItem } from '../services/api'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import StatusBadge from '../components/ui/StatusBadge'
import PriorityIndicator from '../components/ui/PriorityIndicator'

type FilterTab = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'deferred'

const tabKeys: { key: FilterTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'tasks.all' },
  { key: 'pending', labelKey: 'tasks.pending' },
  { key: 'running', labelKey: 'tasks.running' },
  { key: 'completed', labelKey: 'tasks.completed' },
  { key: 'failed', labelKey: 'tasks.failed' },
  { key: 'deferred', labelKey: 'tasks.deferred' },
]

export default function TaskQueue() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [page, setPage] = useState(1)
  const [resultModal, setResultModal] = useState<TaskItem | null>(null)

  const { data: stats } = useApi(() => api.tasks.getStats())
  const { data, loading, refetch } = useApi(
    () => api.tasks.list({ page, page_size: 20, status: activeTab === 'all' ? undefined : activeTab }),
    [page, activeTab]
  )

  useEffect(() => {
    const interval = setInterval(() => refetch(), 30000)
    return () => clearInterval(interval)
  }, [refetch])

  const handleRetry = async (id: number) => { try { await api.tasks.retry(id); refetch() } catch {} }
  const handleAllocate = async () => { try { await api.tasks.allocate(); refetch() } catch {} }
  const handleProcess = async () => { try { await api.tasks.process(); refetch() } catch {} }

  const statItems = [
    { labelKey: 'tasks.pending', value: stats?.pending ?? 0, color: 'var(--accent-warning)' },
    { labelKey: 'tasks.running', value: stats?.running ?? 0, color: 'var(--accent-cyan)' },
    { labelKey: 'tasks.completed', value: stats?.completed ?? 0, color: 'var(--accent-success)' },
    { labelKey: 'tasks.failed', value: stats?.failed ?? 0, color: 'var(--accent-error)' },
  ]

  const getTaskTypeLabel = (taskType: string): string => {
    const key = `task.${taskType}`
    const translated = t(key)
    return translated === key ? taskType : translated
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statItems.map((s) => (
          <GlassCard key={s.labelKey} className="p-4">
            <p className="text-xs theme-text-secondary">{t(s.labelKey)}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl p-1" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)' }}>
          {tabKeys.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1) }}
              className="rounded-lg px-4 py-1.5 text-xs font-medium transition-all"
              style={activeTab === tab.key ? {
                backgroundColor: 'rgba(0,240,255,0.15)',
                color: 'var(--accent-cyan)',
                boxShadow: '0 0 10px rgba(0,200,230,0.2)',
              } : { color: 'var(--text-secondary)' }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <GlowButton variant="secondary" onClick={handleAllocate}><Shuffle size={14} /> {t('tasks.allocate')}</GlowButton>
          <GlowButton onClick={handleProcess}><Play size={14} /> {t('tasks.process')}</GlowButton>
        </div>
      </div>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                <th className="px-4 py-3 font-medium">{t('tasks.taskId')}</th>
                <th className="px-4 py-3 font-medium">{t('tasks.type')}</th>
                <th className="px-4 py-3 font-medium">{t('tasks.priority')}</th>
                <th className="px-4 py-3 font-medium">{t('tasks.status')}</th>
                <th className="px-4 py-3 font-medium">{t('tasks.scheduled')}</th>
                <th className="px-4 py-3 font-medium">{t('tasks.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('tasks.loading')}</td></tr>}
              {!loading && !data?.items.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('tasks.noTasks')}</td></tr>}
              {data?.items.map((task: TaskItem) => (
                <tr key={task.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="transition-colors hover:opacity-90">
                  <td className="px-4 py-3">
                    <p className="text-sm theme-text-primary">#{task.id}</p>
                    <p className="text-xs theme-text-secondary">URL ID: {task.url_id}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={task.task_type} type="tag" label={getTaskTypeLabel(task.task_type)} /></td>
                  <td className="px-4 py-3"><PriorityIndicator score={task.priority_score} /></td>
                  <td className="px-4 py-3"><StatusBadge status={task.status} type="task" label={t(`tasks.${task.status}`)} /></td>
                  <td className="px-4 py-3 text-xs theme-text-secondary">{new Date(task.scheduled_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(task.status === 'failed' || task.status === 'deferred') && (
                        <button onClick={() => handleRetry(task.id)} className="rounded-lg p-1.5 theme-text-secondary transition-colors hover:opacity-80" title={t('tasks.retry')}><RotateCcw size={14} /></button>
                      )}
                      {task.result_summary && (
                        <button onClick={() => setResultModal(task)} className="rounded-lg p-1.5 theme-text-secondary transition-colors hover:opacity-80" title={t('tasks.viewResult')}><Eye size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-xs theme-text-secondary">{t('urls.showing')} {(page - 1) * 20 + 1}-{Math.min(page * 20, data.total)} {t('urls.of')} {data.total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>{t('urls.previous')}</button>
              <button onClick={() => setPage(page + 1)} disabled={page * 20 >= data.total} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={{ border: '1px solid var(--border-color)' }}>{t('urls.next')}</button>
            </div>
          </div>
        )}
      </GlassCard>

      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setResultModal(null)}>
          <GlassCard className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold theme-text-primary">{t('tasks.taskResult')}</h3>
              <button onClick={() => setResultModal(null)} className="theme-text-secondary hover:theme-text-primary">✕</button>
            </div>
            {resultModal.error_message && (
              <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.2)', color: 'var(--accent-error)' }}>
                {resultModal.error_message}
              </div>
            )}
            <pre className="max-h-80 overflow-auto rounded-xl p-4 text-xs theme-text-primary" style={{ backgroundColor: 'var(--bg-input)' }}>
              {resultModal.result_summary ?? t('tasks.noResultData')}
            </pre>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
