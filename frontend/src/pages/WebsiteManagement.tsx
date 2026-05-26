import { useEffect, useState } from 'react'
import {
  CheckCircle,
  CircleAlert,
  Edit2,
  Globe,
  Layout,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  TestTube,
  Trash2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, GscSiteEntry, WebsiteResponse, WebsiteUpdatePayload } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../context/ToastContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'

const PAGE_SIZE = 12
const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
}

function formatVerifiedAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : ''
}

function VerificationBadge({ verifiedAt, label }: { verifiedAt: string | null; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]"
      style={{
        color: verifiedAt ? 'var(--accent-success)' : 'var(--accent-warning)',
        backgroundColor: verifiedAt ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
      }}
      title={verifiedAt ? `${label} 最近验证：${formatVerifiedAt(verifiedAt)}` : `${label} 尚未验证`}
    >
      {verifiedAt ? <CheckCircle size={11} /> : <CircleAlert size={11} />}
      {label}{verifiedAt ? ' 已验证' : ' 待测试'}
    </span>
  )
}

function CredentialBadge({ value, label }: { value: string | null | undefined; label: string }) {
  const saved = value === '****'
  const pending = !!value && !saved
  return (
    <span className="rounded-full px-2 py-1 text-[10px] theme-text-secondary" style={{ backgroundColor: 'var(--bg-input)' }}>
      {saved ? `${label}已配置` : pending ? `${label}待保存` : `${label}未配置`}
    </span>
  )
}

export default function WebsiteManagement() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [websites, setWebsites] = useState<WebsiteResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSite, setEditingSite] = useState<Partial<WebsiteResponse> | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingSavedSite, setTestingSavedSite] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [testingCmsId, setTestingCmsId] = useState<number | null>(null)
  const [testingGscId, setTestingGscId] = useState<number | null>(null)
  const [gscProperties, setGscProperties] = useState<GscSiteEntry[]>([])
  const [loadingGscProperties, setLoadingGscProperties] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')

  const fetchWebsites = async () => {
    try {
      const result = await api.websites.list({ page, page_size: PAGE_SIZE, search: search || undefined })
      setWebsites(result.items)
      setTotal(result.total)
    } catch (error: any) {
      showToast(error.message || t('websites.fetchError'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWebsites()
  }, [page, search])

  const openEditor = (site: Partial<WebsiteResponse>) => {
    setEditingSite(site)
    setGscProperties([])
    setIsModalOpen(true)
  }

  const handleAddNew = () => {
    openEditor({
      name: '',
      domain: '',
      site_type: 'generic',
      gsc_site_url: '',
      shopify_access_token: '',
      wp_username: '',
      wp_app_password: '',
      wp_api_url: '',
      ga4_property_id: '',
      is_active: false,
      gsc_verified_at: null,
      cms_verified_at: null,
    })
  }

  const changeSite = (patch: Partial<WebsiteResponse>) => {
    setEditingSite(previous => previous ? { ...previous, ...patch } : previous)
  }

  const changeGscProperty = (value: string) => {
    changeSite({ gsc_site_url: value, gsc_verified_at: null, is_active: false })
  }

  const changeCmsConnection = (patch: Partial<WebsiteResponse>) => {
    changeSite({ ...patch, cms_verified_at: null, is_active: false })
  }

  const loadGscProperties = async () => {
    setLoadingGscProperties(true)
    try {
      const properties = await api.settings.listGscSites()
      setGscProperties(properties)
      if (properties.length === 0) {
        showToast('服务账号暂无可访问的 Search Console 属性。', 'warning')
      } else {
        showToast(`已读取 ${properties.length} 个可访问属性。`, 'success')
      }
    } catch (error: any) {
      showToast(error.message || '无法读取 Search Console 属性。', 'error')
    } finally {
      setLoadingGscProperties(false)
    }
  }

  const buildPayload = (site: Partial<WebsiteResponse>): WebsiteUpdatePayload => ({
    name: site.name?.trim(),
    domain: site.domain?.trim(),
    site_type: site.site_type || 'generic',
    gsc_site_url: site.gsc_site_url || undefined,
    shopify_access_token: site.shopify_access_token || null,
    wp_username: site.wp_username || undefined,
    wp_app_password: site.wp_app_password || null,
    wp_api_url: site.wp_api_url || undefined,
    ga4_property_id: site.ga4_property_id || undefined,
    is_active: !!site.is_active,
  })

  const persistSite = async (): Promise<WebsiteResponse | null> => {
    if (!editingSite) return null
    if (!editingSite.name?.trim() || !editingSite.domain?.trim()) {
      showToast(t('websites.validationError'), 'warning')
      return null
    }
    const payload = buildPayload(editingSite)
    if (payload.is_active && !editingSite.gsc_verified_at) {
      showToast('启用站点前请先通过 GSC 连接测试。', 'warning')
      return null
    }
    if (payload.is_active && payload.site_type !== 'generic' && !editingSite.cms_verified_at) {
      showToast('启用站点前请先通过 CMS 连接测试。', 'warning')
      return null
    }
    setSaving(true)
    try {
      const saved = editingSite.id
        ? await api.websites.update(editingSite.id, payload)
        : await api.websites.create(payload as any)
      setEditingSite(saved)
      showToast(t('websites.saveSuccess'), 'success')
      return saved
    } catch (error: any) {
      showToast(error.message || t('websites.saveError'), 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const saved = await persistSite()
    if (!saved) return
    setIsModalOpen(false)
    if (page !== 1) setPage(1)
    else fetchWebsites()
  }

  const handleSaveAndTest = async () => {
    const saved = await persistSite()
    if (!saved) return
    if (!saved.gsc_site_url) {
      showToast('请先选择或填写 GSC 属性。', 'warning')
      return
    }
    setTestingSavedSite(true)
    try {
      await api.websites.testGsc(saved.id)
      if (saved.site_type !== 'generic') {
        const cmsResult = await api.cms.test(saved.id)
        if (!cmsResult.ok) throw new Error(cmsResult.error || t('cms.testError'))
      }
      const verified = await api.websites.get(saved.id)
      setEditingSite(verified)
      showToast('连接验证通过，现在可以启用该站点。', 'success')
      fetchWebsites()
    } catch (error: any) {
      showToast(error.message || '连接测试失败。', 'error')
    } finally {
      setTestingSavedSite(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('websites.deleteConfirm'))) return
    try {
      await api.websites.delete(id)
      showToast(t('websites.deleteSuccess'), 'success')
      if (websites.length === 1 && page > 1) setPage(page - 1)
      else fetchWebsites()
    } catch (error: any) {
      showToast(error.message || t('websites.saveError'), 'error')
    }
  }

  const handleCmsSync = async (site: WebsiteResponse) => {
    if (site.site_type === 'generic') return
    setSyncingId(site.id)
    try {
      const result = await api.cms.sync(site.id)
      showToast(t('cms.syncSuccess').replace('{count}', String(result.imported)), 'success')
      fetchWebsites()
    } catch (error: any) {
      showToast(error.message || t('cms.syncError'), 'error')
    } finally {
      setSyncingId(null)
    }
  }

  const handleCmsTest = async (site: WebsiteResponse) => {
    setTestingCmsId(site.id)
    try {
      const result = await api.cms.test(site.id)
      if (!result.ok) throw new Error(result.error || t('cms.testError'))
      showToast(`${site.name}: ${t('cms.testSuccess')}`, 'success')
      fetchWebsites()
    } catch (error: any) {
      showToast(error.message || t('cms.testError'), 'error')
    } finally {
      setTestingCmsId(null)
    }
  }

  const handleGscTest = async (site: WebsiteResponse) => {
    setTestingGscId(site.id)
    try {
      const result = await api.websites.testGsc(site.id)
      showToast(`${site.name}: ${result.message}`, 'success')
      fetchWebsites()
    } catch (error: any) {
      showToast(error.message || 'GSC 连接失败', 'error')
    } finally {
      setTestingGscId(null)
    }
  }

  const getIcon = (type: string) => {
    if (type === 'shopify') return <ShoppingBag size={20} className="text-emerald-400" />
    if (type === 'wordpress') return <Layout size={20} className="text-blue-400" />
    return <Globe size={20} className="text-indigo-400" />
  }

  const requiresCmsTest = editingSite?.site_type === 'shopify' || editingSite?.site_type === 'wordpress'
  const canActivate = !!editingSite?.gsc_verified_at && (!requiresCmsTest || !!editingSite?.cms_verified_at)

  if (loading) return <div className="p-12 text-center theme-text-secondary">{t('urls.loading')}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold theme-text-primary">{t('websites.title')}</h1>
          <p className="mt-1 text-sm theme-text-secondary">站点级的 GSC、GA4 与 CMS 配置统一在此维护。</p>
        </div>
        <GlowButton onClick={handleAddNew}><Plus size={18} /> {t('websites.addSite')}</GlowButton>
      </div>

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }}
          placeholder="搜索站点名称或域名..."
          className="h-10 w-full rounded-xl pl-9 pr-4 text-sm outline-none"
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {websites.map(site => (
          <GlassCard key={site.id} className="group relative p-6 transition-all hover:border-indigo-500/50">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">{getIcon(site.site_type)}</div>
                <div>
                  <h3 className="font-semibold theme-text-primary">{site.name}</h3>
                  <p className="text-xs theme-text-secondary">{site.domain}</p>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${site.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {site.is_active ? t('websites.active') : t('websites.inactive')}
              </span>
            </div>
            <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="flex flex-wrap gap-2">
                <VerificationBadge label="GSC" verifiedAt={site.gsc_verified_at} />
                {site.site_type !== 'generic' && <VerificationBadge label="CMS" verifiedAt={site.cms_verified_at} />}
              </div>
              <p className="truncate text-xs theme-text-secondary">
                {site.gsc_site_url || '尚未选择 GSC 属性'}
              </p>
              {site.ga4_property_id && <p className="text-xs theme-text-secondary">GA4：{site.ga4_property_id}</p>}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {site.gsc_site_url && (
                <button onClick={() => handleGscTest(site)} disabled={testingGscId === site.id} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs" style={inputStyle}>
                  <TestTube size={12} /> {testingGscId === site.id ? '测试中...' : '测试 GSC'}
                </button>
              )}
              {site.site_type !== 'generic' && (
                <button onClick={() => handleCmsTest(site)} disabled={testingCmsId === site.id} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs" style={inputStyle}>
                  <TestTube size={12} /> {testingCmsId === site.id ? '测试中...' : t('cms.test')}
                </button>
              )}
              {site.site_type !== 'generic' && (
                <button onClick={() => handleCmsSync(site)} disabled={syncingId === site.id} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs" style={{ ...inputStyle, color: 'var(--accent-cyan)' }}>
                  <RefreshCw size={12} className={syncingId === site.id ? 'animate-spin' : ''} />
                  {syncingId === site.id ? t('cms.syncing') : t('cms.sync')}
                </button>
              )}
              <button onClick={() => openEditor(site)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs" style={inputStyle}>
                <Edit2 size={12} /> {t('websites.editSite')}
              </button>
              <button onClick={() => handleDelete(site.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                <Trash2 size={14} />
              </button>
            </div>
          </GlassCard>
        ))}
        {websites.length === 0 && (
          <GlassCard className="col-span-full flex flex-col items-center gap-4 p-12 text-center">
            <Globe size={36} className="theme-text-secondary" />
            <div>
              <h2 className="font-semibold theme-text-primary">开始接入第一个站点</h2>
              <p className="mt-1 text-sm theme-text-secondary">先导入 Google 密钥，再创建站点并进行连接测试。</p>
            </div>
            <div className="flex gap-3">
              <Link to="/settings" className="rounded-xl px-4 py-2 text-sm theme-text-primary" style={{ border: '1px solid var(--border-color)' }}>前往系统设置</Link>
              <GlowButton size="sm" onClick={handleAddNew}><Plus size={14} /> 创建站点</GlowButton>
            </div>
          </GlassCard>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-color)' }}>
          <span className="text-xs theme-text-secondary">
            {t('urls.showing')} {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} {t('urls.of')} {total}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={inputStyle}>{t('urls.previous')}</button>
            <button onClick={() => setPage(page + 1)} disabled={page * PAGE_SIZE >= total} className="rounded-lg px-3 py-1 text-xs theme-text-primary disabled:opacity-30" style={inputStyle}>{t('urls.next')}</button>
          </div>
        </div>
      )}

      {isModalOpen && editingSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-xl font-bold theme-text-primary">{editingSite.id ? t('websites.editSite') : t('websites.addSite')}</h2>
              <button onClick={() => setIsModalOpen(false)} className="theme-text-secondary hover:theme-text-primary"><X size={20} /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-xs theme-text-secondary">{t('websites.name')} *</span>
                  <input type="text" value={editingSite.name || ''} onChange={event => changeSite({ name: event.target.value })} className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                </label>
                <label>
                  <span className="mb-1 block text-xs theme-text-secondary">{t('websites.domain')} *</span>
                  <input type="text" value={editingSite.domain || ''} onChange={event => changeCmsConnection({ domain: event.target.value })} placeholder="example.com" className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                </label>
                <label>
                  <span className="mb-1 block text-xs theme-text-secondary">{t('websites.type')}</span>
                  <select value={editingSite.site_type || 'generic'} onChange={event => changeCmsConnection({ site_type: event.target.value })} className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle}>
                    <option value="generic">{t('websites.generic')}</option>
                    <option value="shopify">Shopify</option>
                    <option value="wordpress">WordPress</option>
                  </select>
                </label>

                <section className="space-y-4 sm:col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold theme-text-primary">Google 数据连接</h3>
                    <VerificationBadge label="GSC" verifiedAt={editingSite.gsc_verified_at || null} />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[250px] flex-1">
                      <span className="mb-1 block text-xs theme-text-secondary">{t('websites.gscUrl')}</span>
                      <select value={editingSite.gsc_site_url || ''} onChange={event => changeGscProperty(event.target.value)} className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle}>
                        <option value="">选择属性或在下方手动输入</option>
                        {gscProperties.map(property => (
                          <option key={property.site_url} value={property.site_url}>{property.site_url} ({property.permission_level})</option>
                        ))}
                        {editingSite.gsc_site_url && !gscProperties.some(property => property.site_url === editingSite.gsc_site_url) && (
                          <option value={editingSite.gsc_site_url}>{editingSite.gsc_site_url}</option>
                        )}
                      </select>
                    </label>
                    <GlowButton size="sm" variant="secondary" onClick={loadGscProperties} disabled={loadingGscProperties}>
                      <RefreshCw size={13} className={loadingGscProperties ? 'animate-spin' : ''} />
                      {loadingGscProperties ? '读取中...' : '读取 GSC 属性'}
                    </GlowButton>
                  </div>
                  <input type="text" value={editingSite.gsc_site_url || ''} onChange={event => changeGscProperty(event.target.value)} placeholder="手动输入：sc-domain:example.com 或 https://www.example.com/" className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                  <label className="block">
                    <span className="mb-1 block text-xs theme-text-secondary">{t('websites.ga4Id')}</span>
                    <input type="text" value={editingSite.ga4_property_id || ''} onChange={event => changeSite({ ga4_property_id: event.target.value })} placeholder="123456789" className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                  </label>
                </section>

                {editingSite.site_type === 'shopify' && (
                  <section className="space-y-3 sm:col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-emerald-400">Shopify 连接</h3>
                      <div className="flex gap-2">
                        <CredentialBadge label="令牌" value={editingSite.shopify_access_token} />
                        <VerificationBadge label="CMS" verifiedAt={editingSite.cms_verified_at || null} />
                      </div>
                    </div>
                    <label>
                      <span className="mb-1 block text-xs theme-text-secondary">{t('websites.shopifyToken')}</span>
                      <input type="password" value={editingSite.shopify_access_token === '****' ? '' : (editingSite.shopify_access_token || '')} onChange={event => changeCmsConnection({ shopify_access_token: event.target.value })} placeholder={editingSite.shopify_access_token === '****' ? '已配置；输入新令牌以替换' : 'shpat_xxxxxxxxxxxx'} className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                    </label>
                    {editingSite.shopify_access_token === '****' && (
                      <button type="button" onClick={() => changeCmsConnection({ shopify_access_token: null })} className="text-xs text-red-400">清除已保存的令牌</button>
                    )}
                  </section>
                )}

                {editingSite.site_type === 'wordpress' && (
                  <section className="space-y-4 sm:col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-400">WordPress 连接</h3>
                      <div className="flex gap-2">
                        <CredentialBadge label="密码" value={editingSite.wp_app_password} />
                        <VerificationBadge label="CMS" verifiedAt={editingSite.cms_verified_at || null} />
                      </div>
                    </div>
                    <input type="url" value={editingSite.wp_api_url || ''} onChange={event => changeCmsConnection({ wp_api_url: event.target.value })} placeholder="https://site.com/wp-json" className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input type="text" value={editingSite.wp_username || ''} onChange={event => changeCmsConnection({ wp_username: event.target.value })} placeholder="WordPress 用户名" className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                      <input type="password" value={editingSite.wp_app_password === '****' ? '' : (editingSite.wp_app_password || '')} onChange={event => changeCmsConnection({ wp_app_password: event.target.value })} placeholder={editingSite.wp_app_password === '****' ? '已配置；输入新密码以替换' : '应用程序密码'} className="h-10 w-full rounded-xl px-4 text-sm outline-none" style={inputStyle} />
                    </div>
                    {editingSite.wp_app_password === '****' && (
                      <button type="button" onClick={() => changeCmsConnection({ wp_app_password: null })} className="text-xs text-red-400">清除已保存的应用程序密码</button>
                    )}
                  </section>
                )}

                <div className="sm:col-span-2 mt-4 flex items-start gap-2">
                  <input type="checkbox" id="is_active" checked={!!editingSite.is_active} disabled={!canActivate} onChange={event => changeSite({ is_active: event.target.checked })} className="mt-0.5 h-4 w-4 rounded" style={{ accentColor: 'var(--accent-cyan)' }} />
                  <label htmlFor="is_active" className="text-sm theme-text-primary">
                    {t('websites.active')}
                    {!canActivate && <span className="ml-2 text-xs theme-text-secondary">连接测试通过后可启用</span>}
                  </label>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 p-6" style={{ borderTop: '1px solid var(--border-color)' }}>
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm theme-text-secondary hover:theme-text-primary">{t('urls.cancel')}</button>
              <GlowButton variant="secondary" onClick={handleSave} disabled={saving || testingSavedSite}>
                <Save size={15} /> {saving ? '保存中...' : t('websites.save')}
              </GlowButton>
              <GlowButton onClick={handleSaveAndTest} disabled={saving || testingSavedSite}>
                <TestTube size={15} /> {testingSavedSite ? '测试中...' : '保存并测试连接'}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
