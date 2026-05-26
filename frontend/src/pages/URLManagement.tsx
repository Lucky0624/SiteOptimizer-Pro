import { useState, useCallback, useEffect, Fragment } from 'react'
import { Search, Plus, RotateCcw, Archive, ChevronDown, ChevronUp, X, FileDown } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { ContentOptimizationItem, URLItem, URLDetailItem, WebsiteResponse } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { useWebsite } from '../context/WebsiteContext'
import { useToast } from '../context/ToastContext'
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
  const { showToast } = useToast()
  // 修复：使用全局 WebsiteContext，各页面站点选择联动
  const { selectedWebsiteId, setSelectedWebsiteId } = useWebsite()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState('priority_score')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<URLDetailItem | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSitemapModal, setShowSitemapModal] = useState(false)
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [addUrlWebsiteId, setAddUrlWebsiteId] = useState<number | null>(null)
  const [websites, setWebsites] = useState<WebsiteResponse[]>([])

  // 批量操作状态
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchActioning, setBatchActioning] = useState(false)
  const [fetchingKeywords, setFetchingKeywords] = useState(false)
  const [optimizingUrlId, setOptimizingUrlId] = useState<number | null>(null)
  const [optimizationModal, setOptimizationModal] = useState<ContentOptimizationItem | null>(null)
  const [suggestedTitle, setSuggestedTitle] = useState('')
  const [suggestedDescription, setSuggestedDescription] = useState('')

  const { data, loading, refetch } = useApi(
    () => api.urls.list({
      page,
      page_size: 20,
      tag: tagFilter || undefined,
      search: search || undefined,
      sort_by: sort,
      website_id: selectedWebsiteId ?? undefined
    }),
    [page, tagFilter, search, sort, selectedWebsiteId]
  )

  // 当页码或数据改变时，清空已选（或者保留，这取决于具体需求，这里简单处理不跨页选择）
  useEffect(() => {
    setSelectedIds([])
  }, [data])

  useEffect(() => {
    api.websites.listAll().then(setWebsites)
  }, [])

  useEffect(() => {
    setSuggestedTitle(optimizationModal?.suggested_title || '')
    setSuggestedDescription(optimizationModal?.suggested_meta_description || '')
  }, [optimizationModal])

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const handleAddUrl = async () => {
    if (!newUrl) return
    try {
      await api.urls.create({ url: newUrl, title: newTitle || undefined, website_id: addUrlWebsiteId ?? undefined })
      showToast(t('urls.addSuccess') || '添加成功', 'success')
      setShowAddModal(false); setNewUrl(''); setNewTitle(''); setAddUrlWebsiteId(null)
      refetch()
    } catch (err: any) {
      showToast(err.message || t('urls.addError') || '添加失败', 'error')
    }
  }

  const handleImportSitemap = async () => {
    if (!sitemapUrl.trim()) return
    setImporting(true)
    try {
      const res = await api.urls.importSitemap({ sitemap_url: sitemapUrl, website_id: selectedWebsiteId })
      const msg = t('urls.importSuccess')
        .replace('{count}', String(res.imported))
        .replace('{skipped}', String(res.skipped))
      showToast(msg, 'success')
      setShowSitemapModal(false); setSitemapUrl('')
      refetch()
    } catch (err: any) {
      showToast(err.message || t('urls.importError'), 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleRecrawl = async (id: number) => {
    try {
      await api.urls.markRecrawl(id)
      refetch()
      showToast(t('urls.recrawlSuccess') || '已标记重抓取', 'success')
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  const handleArchive = async (id: number) => {
    try {
      await api.urls.update(id, { status: 'archived' })
      refetch()
      showToast(t('urls.archiveSuccess') || '已归档', 'success')
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setDetailData(null); return }
    setExpandedId(id)
    try {
      const detail = await api.urls.get(id)
      setDetailData(detail)
    } catch { setDetailData(null) }
  }

  // 批量操作处理
  const handleToggleSelectAll = () => {
    if (!data?.items) return
    if (selectedIds.length === data.items.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(data.items.map((u: URLItem) => u.id))
    }
  }

  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBatchAction = async (action: string) => {
    if (!selectedIds.length) return
    if (action === 'delete' && !window.confirm(t('urls.deleteConfirm') || '确认删除所选 URL 吗？')) return

    setBatchActioning(true)
    try {
      // @ts-ignore (因为我们在 api.ts 里强行注了 batchAction)
      const res = await api.urls.batchAction(action, selectedIds)
      showToast(t('urls.batchSuccess')?.replace('{count}', String(res.affected)) || `成功操作 ${res.affected} 个网址`, 'success')
      setSelectedIds([])
      refetch()
    } catch (err: any) {
      showToast(err.message || t('urls.batchError') || '批量操作失败', 'error')
    } finally {
      setBatchActioning(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      showToast(t('urls.exporting') || '正在导出...', 'info')
      // @ts-ignore
      await api.urls.exportCsv({ website_id: selectedWebsiteId, tag: tagFilter, status: '' })
    } catch (err: any) {
      showToast(err.message || t('urls.exportError') || '导出失败', 'error')
    }
  }

  const handleFetchKeywords = async (urlId: number) => {
    setFetchingKeywords(true)
    try {
      const res = await api.keywords.fetch(urlId, 30) // 默认抓30天
      showToast(`成功抓取，导入 ${res.imported} 条关键词数据`, 'success')
      // 重新拉取详情
      const detail = await api.urls.get(urlId)
      setDetailData(detail)
    } catch (err: any) {
      showToast(err.message || '抓取关键词失败', 'error')
    } finally {
      setFetchingKeywords(false)
    }
  }

  const handleCreateOptimization = async (url: URLItem) => {
    const websiteId = url.website_id ?? selectedWebsiteId
    if (!websiteId) {
      showToast('请先把该 URL 关联到 Shopify 或 WordPress 站点', 'warning')
      return
    }
    setOptimizingUrlId(url.id)
    try {
      const suggestion = await api.cms.createOptimization(websiteId, url.id)
      setOptimizationModal(suggestion)
      showToast('已生成内容优化建议，等待你审批', 'success')
    } catch (err: any) {
      showToast(err.message || '生成内容优化建议失败', 'error')
    } finally {
      setOptimizingUrlId(null)
    }
  }

  const handleSaveAndApprove = async (item: ContentOptimizationItem) => {
    try {
      const saved = await api.cms.updateOptimization(item.website_id, item.id, {
        suggested_title: suggestedTitle,
        suggested_meta_description: suggestedDescription,
      })
      const approved = await api.cms.approveOptimization(saved.website_id, saved.id)
      setOptimizationModal(approved)
      showToast('建议已批准，请确认后回写 CMS', 'success')
    } catch (err: any) {
      showToast(err.message || '保存/批准失败', 'error')
    }
  }

  const handleApplyOptimization = async (item: ContentOptimizationItem) => {
    try {
      const applied = await api.cms.applyOptimization(item.website_id, item.id)
      setOptimizationModal(applied)
      refetch()
      showToast(applied.status === 'applied' ? '已回写到 CMS' : '回写失败，请查看错误信息', applied.status === 'applied' ? 'success' : 'error')
    } catch (err: any) {
      showToast(err.message || '回写失败', 'error')
    }
  }

  const handleRejectOptimization = async (item: ContentOptimizationItem) => {
    try {
      const rejected = await api.cms.rejectOptimization(item.website_id, item.id)
      setOptimizationModal(rejected)
      showToast('已驳回该建议', 'info')
    } catch (err: any) {
      showToast(err.message || '驳回失败', 'error')
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
          <WebsiteSelector value={selectedWebsiteId} onChange={setSelectedWebsiteId} />
        </div>
        <div className="flex gap-2">
          <GlowButton variant="secondary" onClick={handleExportCsv}>
            <FileDown size={16} /> {t('urls.exportCsv')}
          </GlowButton>
          <GlowButton variant="secondary" onClick={() => setShowSitemapModal(true)}>
            <FileDown size={16} /> {t('urls.importSitemap')}
          </GlowButton>
          <GlowButton onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> {t('urls.addUrl')}
          </GlowButton>
        </div>
      </div>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="text-left text-xs theme-text-secondary">
                <th className="px-4 py-3 font-medium w-10 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-600 bg-transparent text-indigo-500 focus:ring-indigo-500/50"
                    checked={(data?.items?.length ?? 0) > 0 && selectedIds.length === data?.items?.length}
                    onChange={handleToggleSelectAll}
                  />
                </th>
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
                  <td colSpan={6} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('urls.loading')}</td>
                </tr>
              )}
              {!loading && !data?.items.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm theme-text-secondary">{t('urls.noUrls')}</td>
                </tr>
              )}
              {data?.items.map((url: URLItem) => (
                <Fragment key={url.id}>
                  <tr
                    className="group cursor-pointer transition-colors hover:opacity-90"
                    style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: selectedIds.includes(url.id) ? 'var(--bg-hover)' : 'transparent' }}
                    onClick={() => toggleExpand(url.id)}
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-gray-600 bg-transparent text-indigo-500 focus:ring-indigo-500/50"
                        checked={selectedIds.includes(url.id)}
                        onChange={(e) => handleToggleSelect(url.id, e as any)}
                      />
                    </td>
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
                      <td colSpan={6} className="px-8 py-4" style={{ backgroundColor: 'var(--bg-input)' }}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-1">
                          <div className="flex flex-wrap gap-1">
                            {detailData.tags.map((tag) => (
                              <StatusBadge key={tag.id} status={tag.tag_name} type="tag" label={getTagLabel(tag.tag_name, t)} />
                            ))}
                            {!detailData.tags.length && (
                              <span className="text-xs theme-text-secondary">{t('urls.noTags')}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <GlowButton
                              variant="secondary"
                              size="sm"
                              onClick={() => handleFetchKeywords(url.id)}
                              disabled={fetchingKeywords}
                            >
                              <Search size={14} className="mr-1" />
                              {fetchingKeywords ? '抓取中...' : '抓取 GSC 关键词'}
                            </GlowButton>
                            <GlowButton
                              variant="secondary"
                              size="sm"
                              onClick={() => handleCreateOptimization(url)}
                              disabled={optimizingUrlId === url.id}
                            >
                              <FileDown size={14} className="mr-1" />
                              {optimizingUrlId === url.id ? '生成中...' : '生成内容建议'}
                            </GlowButton>
                          </div>
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
      {showSitemapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSitemapModal(false)}>
          <GlassCard className="w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold theme-text-primary">{t('urls.importSitemap')}</h3>
              <button onClick={() => setShowSitemapModal(false)} className="theme-text-secondary hover:theme-text-primary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs theme-text-secondary">{t('urls.sitemapUrl')}</label>
                <input
                  type="url" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)}
                  placeholder={t('urls.sitemapUrlPlaceholder')}
                  className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle}
                />
              </div>
              <p className="text-[10px] theme-text-secondary">支持标准 sitemap.xml 和 sitemap index 格式，最多导入 5000 条 URL。</p>
              <div className="flex justify-end gap-3">
                <GlowButton variant="secondary" onClick={() => setShowSitemapModal(false)}>{t('urls.cancel')}</GlowButton>
                <GlowButton onClick={handleImportSitemap} disabled={importing}>
                  {importing ? t('urls.importing') : t('urls.importSitemap')}
                </GlowButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
      {optimizationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOptimizationModal(null)}>
          <GlassCard className="w-full max-w-3xl p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold theme-text-primary">内容优化审批</h3>
                <p className="mt-1 text-xs theme-text-secondary">
                  {optimizationModal.platform} / {optimizationModal.resource_type} / {optimizationModal.status}
                </p>
              </div>
              <button onClick={() => setOptimizationModal(null)} className="theme-text-secondary hover:theme-text-primary"><X size={20} /></button>
            </div>

            {optimizationModal.error_message && (
              <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.2)', color: 'var(--accent-error)' }}>
                {optimizationModal.error_message}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
                <p className="mb-2 text-xs font-semibold theme-text-secondary">当前标题</p>
                <p className="text-sm theme-text-primary">{optimizationModal.current_title || '-'}</p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.2)' }}>
                <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>建议标题</p>
                {['draft', 'rejected', 'failed'].includes(optimizationModal.status) ? (
                  <input
                    type="text"
                    value={suggestedTitle}
                    maxLength={70}
                    onChange={e => setSuggestedTitle(e.target.value)}
                    className="h-10 w-full rounded-lg px-3 text-sm outline-none"
                    style={inputStyle}
                  />
                ) : (
                  <p className="text-sm font-medium theme-text-primary">{optimizationModal.suggested_title}</p>
                )}
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
                <p className="mb-2 text-xs font-semibold theme-text-secondary">当前描述</p>
                <p className="text-sm theme-text-primary">{optimizationModal.current_meta_description || '-'}</p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(176,38,255,0.08)', border: '1px solid rgba(176,38,255,0.2)' }}>
                <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--accent-purple)' }}>建议描述</p>
                {['draft', 'rejected', 'failed'].includes(optimizationModal.status) ? (
                  <textarea
                    value={suggestedDescription}
                    maxLength={180}
                    onChange={e => setSuggestedDescription(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                ) : (
                  <p className="text-sm font-medium theme-text-primary">{optimizationModal.suggested_meta_description}</p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
              <p className="mb-2 text-xs font-semibold theme-text-secondary">关键词与内容缺口</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {optimizationModal.primary_keyword && (
                  <span className="rounded-full px-2 py-1 text-xs" style={{ backgroundColor: 'rgba(0,240,255,0.12)', color: 'var(--accent-cyan)' }}>
                    主词：{optimizationModal.primary_keyword}
                  </span>
                )}
                {(optimizationModal.missing_keywords || []).map(kw => (
                  <span key={kw} className="rounded-full px-2 py-1 text-xs" style={{ backgroundColor: 'rgba(255,170,0,0.12)', color: 'var(--accent-warning)' }}>
                    待覆盖：{kw}
                  </span>
                ))}
              </div>
              <p className="text-sm theme-text-primary">{optimizationModal.content_gap_summary || '-'}</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {['draft', 'approved'].includes(optimizationModal.status) && (
                <GlowButton variant="secondary" onClick={() => handleRejectOptimization(optimizationModal)}>
                  {optimizationModal.status === 'approved' ? '撤回批准' : '驳回'}
                </GlowButton>
              )}
              {['draft', 'rejected', 'failed'].includes(optimizationModal.status) && (
                <GlowButton onClick={() => handleSaveAndApprove(optimizationModal)}>
                  保存并批准
                </GlowButton>
              )}
              {optimizationModal.status === 'approved' && (
                <GlowButton onClick={() => handleApplyOptimization(optimizationModal)}>
                  确认回写 CMS
                </GlowButton>
              )}
            </div>
            <p className="mt-3 text-[10px] theme-text-secondary">
              Shopify 回写 SEO 标题/描述字段；WordPress 回写标题和 excerpt。正文建议只作为人工参考，不会自动替换整篇内容。
            </p>
          </GlassCard>
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-full px-6 py-3 shadow-2xl shadow-indigo-500/20"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', backdropFilter: 'blur(16px)' }}>
          <span className="text-sm font-medium theme-text-primary">
            {t('urls.selected')?.replace('{count}', String(selectedIds.length)) || `已选中 ${selectedIds.length} 项`}
          </span>
          <div className="h-4 w-px bg-gray-600/50"></div>
          <button onClick={() => handleBatchAction('recrawl')} disabled={batchActioning} className="flex items-center gap-1 text-xs hover:text-indigo-400 theme-text-secondary transition-colors">
            <RotateCcw size={14} /> {t('urls.batchRecrawl')}
          </button>
          <button onClick={() => handleBatchAction('archive')} disabled={batchActioning} className="flex items-center gap-1 text-xs hover:text-amber-400 theme-text-secondary transition-colors">
            <Archive size={14} /> {t('urls.batchArchive')}
          </button>
          <button onClick={() => handleBatchAction('delete')} disabled={batchActioning} className="flex items-center gap-1 text-xs hover:text-red-400 theme-text-secondary transition-colors">
            <X size={14} /> {t('urls.batchDelete')}
          </button>
        </div>
      )}
    </div>
  )
}
