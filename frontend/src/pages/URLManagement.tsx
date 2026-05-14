import { useState, useCallback, useEffect, Fragment } from 'react'
import { Search, Plus, RotateCcw, Archive, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { URLItem, URLDetailItem, WebsiteResponse } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import StatusBadge from '../components/ui/StatusBadge'
import PriorityIndicator from '../components/ui/PriorityIndicator'
import WebsiteSelector from '../components/common/WebsiteSelector'

const tagFilterOptions = [
  { value: '', labelKey: 'urls.allTags' },
  { value: 'Indexed', labelKey: 'tags.indexed' },
  { value: 'Excluded', labelKey: 'tags.excluded' },
  { value: 'Opportunity', labelKey: 'tags.opportunity' },
  { value: 'Decaying', labelKey: 'tags.decaying' },
  { value: 'Need_Recrawl', labelKey: 'tags.need_recrawl' },
  { value: 'High_Impression', labelKey: 'tags.high_impression' },
]

const sortOptions = [
  { value: 'priority_score', labelKey: 'urls.sortPriority' },
  { value: 'created_at', labelKey: 'urls.sortNewest' },
]

function getTagLabel(tagName: string, t: (key: string) => string): string {
  const key = `tags.${tagName.toLowerCase().replace(/-/g, '_')}`
  const translated = t(key)
  return translated === key ? tagName : translated
}

function getScoreColor(score: number): React.CSSProperties {
  if (score >= 90) return { color: 'var(--accent-success)' }
  if (score >= 50) return { color: 'var(--accent-warning)' }
  return { color: 'var(--accent-error)' }
}

export default function URLManagement() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState('priority_score')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<URLDetailItem | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [selectedWebsite, setSelectedWebsite] = useState<number | null>(null)
  const [addUrlWebsiteId, setAddUrlWebsiteId] = useState<number | null>(null)
  const [websites, setWebsites] = useState<WebsiteResponse[]>([])

  const { data, loading, refetch } = useApi(
    () => api.urls.list({
      page,
      page_size: 20,
      tag: tagFilter || undefined,
      search: search || undefined,
      sort_by: sort,
      website_id: selectedWebsite ?? undefined
    }),
    [page, tagFilter, search, sort, selectedWebsite]
  )

  useEffect(() => {
    api.websites.list().then(res => setWebsites(res.items))
  }, [])

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const handleAddUrl = async () => {
    if (!newUrl) return
    try {
      await api.urls.create({
        url: newUrl,
        title: newTitle || undefined,
        website_id: addUrlWebsiteId ?? undefined
      })
      setShowAddModal(false)
      setNewUrl('')
      setNewTitle('')
      setAddUrlWebsiteId(null)
      refetch()
    } catch {}
  }

  const handleRecrawl = async (id: number) => {
    try {
      await api.urls.markRecrawl(id)
      refetch()
    } catch {}
  }

  const handleArchive = async (id: number) => {
    try {
      await api.urls.update(id, { status: 'archived' })
      refetch()
    } catch {}
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetailData(null)
      return
    }
    setExpandedId(id)
    try {
      const detail = await api.urls.get(id)
      setDetailData(detail)
    } catch {
      setDetailData(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t('urls.search')}
              className="h-10 w-full rounded-xl pl-10 pr-4 text-sm outline-none backdrop-blur-sm"
              style={inputStyle}
            />
          </div>
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(1) }}
            className="h-10 rounded-xl px-3 text-sm outline-none backdrop-blur-sm"
            style={inputStyle}
          >
            {tagFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-xl px-3 text-sm outline-none backdrop-blur-sm"
            style={inputStyle}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
          <WebsiteSelector value={selectedWebsite} onChange={setSelectedWebsite} />
        </div>
        <GlowButton onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> {t('urls.addUrl')}
        </GlowButton>
      </div>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                <th className="px-4 py-3 font-medium">{t('urls.url')}</th>
                <th className="px-4 py-3 font-medium">{t('urls.priority')}</th>
                <th className="px-4 py-3 font-medium">{t('urls.status')}</th>
                <th className="px-4 py-3 font-medium">{t('urls.lastCrawled')}</th>
                <th className="px-4 py-3 font-medium">{t('urls.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('urls.loading')}</td>
                </tr>
              )}
              {!loading && !data?.items.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('urls.noUrls')}</td>
                </tr>
              )}
              {data?.items.map((url: URLItem) => (
                <Fragment key={url.id}>
                  <tr
                    className="group cursor-pointer transition-colors hover:opacity-90"
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                    onClick={() => toggleExpand(url.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {expandedId === url.id ? <ChevronUp size={14} className="theme-text-secondary" /> : <ChevronDown size={14} className="theme-text-secondary" />}
                        <div>
                          <p className="max-w-[300px] truncate text-sm font-medium theme-text-primary">{url.url}</p>
                          <p className="text-xs theme-text-secondary">{url.title || t('urls.noTitle')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityIndicator score={url.priority_score} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={url.status} type="tag" label={getTagLabel(url.status, t)} />
                    </td>
                    <td className="px-4 py-3 text-xs theme-text-secondary">
                      {url.last_crawled_at ? new Date(url.last_crawled_at).toLocaleDateString() : t('urls.never')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRecrawl(url.id) }}
                          className="rounded-lg p-1.5 theme-text-secondary transition-colors hover:opacity-80"
                          title={t('urls.markRecrawl')}
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleArchive(url.id) }}
                          className="rounded-lg p-1.5 theme-text-secondary transition-colors hover:opacity-80"
                          title={t('urls.archive')}
                        >
                          <Archive size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === url.id && detailData && (
                    <tr key={`${url.id}-detail`}>
                      <td colSpan={5} className="px-8 py-4" style={{ backgroundColor: 'var(--bg-input)' }}>
                        <div className="mb-4 flex flex-wrap gap-1">
                          {detailData.tags.map((tag) => (
                            <StatusBadge key={tag.id} status={tag.tag_name} type="tag" label={getTagLabel(tag.tag_name, t)} />
                          ))}
                          {!detailData.tags.length && (
                            <span className="text-xs theme-text-secondary">{t('urls.noTags')}</span>
                          )}
                        </div>
                        {detailData.snapshots.length > 0 && (
                          <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                            {(() => {
                              const latest = detailData.snapshots[0]
                              return (
                                <>
                                  <div>
                                    <span className="text-xs theme-text-secondary">{t('urls.clicks')}</span>
                                    <p className="font-medium theme-text-primary">{latest.clicks.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs theme-text-secondary">{t('urls.impressions')}</span>
                                    <p className="font-medium theme-text-primary">{latest.impressions.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs theme-text-secondary">{t('urls.ctr')}</span>
                                    <p className="font-medium theme-text-primary">{latest.ctr.toFixed(2)}%</p>
                                  </div>
                                  <div>
                                    <span className="text-xs theme-text-secondary">{t('urls.position')}</span>
                                    <p className="font-medium theme-text-primary">{latest.position.toFixed(1)}</p>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        )}

                        {detailData.snapshots.length > 0 && detailData.snapshots[0].performance_score !== null && (
                          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-cyan)' }}>{t('urls.psi')}</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                              {(() => {
                                const latest = detailData.snapshots[0]
                                return (
                                  <>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.lighthouseScore')}</span>
                                      <p className="font-bold" style={getScoreColor(latest.performance_score || 0)}>{latest.performance_score}</p>
                                    </div>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.lcp')}</span>
                                      <p className="font-medium theme-text-primary">{(latest.lcp_value || 0) / 1000}s</p>
                                    </div>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.cls')}</span>
                                      <p className="font-medium theme-text-primary">{latest.cls_value?.toFixed(3) || '0.000'}</p>
                                    </div>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.tbt')}</span>
                                      <p className="font-medium theme-text-primary">{latest.fid_value || 0}ms</p>
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                        {detailData.snapshots.length > 0 && detailData.snapshots[0].conversions !== null && (
                          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-purple)' }}>{t('urls.conversionRoi')}</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                              {(() => {
                                const latest = detailData.snapshots[0]
                                return (
                                  <>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.conversions')}</span>
                                      <p className="font-bold" style={{ color: 'var(--accent-success)' }}>{latest.conversions}</p>
                                    </div>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.bounceRate')}</span>
                                      <p className="font-medium theme-text-primary">{(latest.bounce_rate || 0).toFixed(2)}%</p>
                                    </div>
                                    <div>
                                      <span className="text-xs theme-text-secondary">{t('urls.trafficConversionRate')}</span>
                                      <p className="font-medium theme-text-primary">
                                        {latest.clicks > 0 ? ((latest.conversions || 0) / latest.clicks * 100).toFixed(2) : 0}%
                                      </p>
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                          <div>
                            <span className="text-xs theme-text-secondary">{t('urls.lastModified')}</span>
                            <p className="font-medium theme-text-primary">{url.last_modified_at ? new Date(url.last_modified_at).toLocaleDateString() : t('urls.na')}</p>
                          </div>
                          <div>
                            <span className="text-xs theme-text-secondary">{t('urls.created')}</span>
                            <p className="font-medium theme-text-primary">{new Date(url.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-xs theme-text-secondary">
              {t('urls.showing')} {(page - 1) * 20 + 1}-{Math.min(page * 20, data.total)} {t('urls.of')} {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30"
                style={{ border: '1px solid var(--border-color)' }}
              >
                {t('urls.previous')}
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * 20 >= data.total}
                className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30"
                style={{ border: '1px solid var(--border-color)' }}
              >
                {t('urls.next')}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <GlassCard className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold theme-text-primary">{t('urls.addUrlTitle')}</h3>
              <button onClick={() => setShowAddModal(false)} className="theme-text-secondary hover:theme-text-primary">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs theme-text-secondary">{t('urls.urlLabel')}</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={t('urls.urlPlaceholder')}
                  className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs theme-text-secondary">{t('urls.titleLabel')}</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('urls.titlePlaceholder')}
                  className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs theme-text-secondary">{t('urls.selectWebsite')}</label>
                <select
                  value={addUrlWebsiteId ?? ''}
                  onChange={(e) => setAddUrlWebsiteId(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">{t('websites.generic')}</option>
                  {websites.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <GlowButton variant="secondary" onClick={() => setShowAddModal(false)}>{t('urls.cancel')}</GlowButton>
                <GlowButton onClick={handleAddUrl}>{t('urls.addUrl')}</GlowButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
