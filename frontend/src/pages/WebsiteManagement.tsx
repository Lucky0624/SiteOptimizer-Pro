import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Globe, ShoppingBag, Layout, Save, X } from 'lucide-react'
import { api, WebsiteResponse } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'

export default function WebsiteManagement() {
  const { t } = useI18n()
  const [websites, setWebsites] = useState<WebsiteResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSite, setEditingSite] = useState<Partial<WebsiteResponse> | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  }

  const fetchWebsites = async () => {
    try {
      const res = await api.websites.list()
      setWebsites(res.items)
    } catch (err) {
      console.error('Failed to fetch websites', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWebsites()
  }, [])

  const handleEdit = (site: WebsiteResponse) => {
    setEditingSite(site)
    setIsModalOpen(true)
  }

  const handleAddNew = () => {
    setEditingSite({
      name: '',
      domain: '',
      site_type: 'generic',
      gsc_site_url: '',
      shopify_access_token: '',
      wp_username: '',
      wp_app_password: '',
      wp_api_url: '',
      ga4_property_id: '',
      is_active: true,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (window.confirm(t('websites.deleteConfirm'))) {
      try {
        await api.websites.delete(id)
        fetchWebsites()
      } catch (err) {
        alert(t('dashboard.runCycleFail'))
      }
    }
  }

  const handleSave = async () => {
    if (!editingSite) return
    try {
      if (editingSite.id) {
        await api.websites.update(editingSite.id, editingSite)
      } else {
        await api.websites.create(editingSite as any)
      }
      setIsModalOpen(false)
      fetchWebsites()
    } catch (err) {
      alert(t('dashboard.runCycleFail'))
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'shopify': return <ShoppingBag size={20} className="text-emerald-400" />
      case 'wordpress': return <Layout size={20} className="text-blue-400" />
      default: return <Globe size={20} className="text-indigo-400" />
    }
  }

  if (loading) return <div className="p-12 text-center theme-text-secondary">{t('urls.loading')}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold theme-text-primary">{t('websites.title')}</h1>
        <GlowButton onClick={handleAddNew}>
          <Plus size={18} /> {t('websites.addSite')}
        </GlowButton>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {websites.map((site) => (
          <GlassCard key={site.id} className="group relative p-6 transition-all hover:border-indigo-500/50">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
                  {getIcon(site.site_type)}
                </div>
                <div>
                  <h3 className="font-semibold theme-text-primary">{site.name}</h3>
                  <p className="text-xs theme-text-secondary">{site.domain}</p>
                </div>
              </div>
              <div className={`rounded-full px-2 py-0.5 text-[10px] ${site.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {site.is_active ? t('websites.active') : t('websites.inactive')}
              </div>
            </div>

            <div className="space-y-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="flex justify-between text-xs">
                <span className="theme-text-secondary">{t('websites.type')}</span>
                <span className="theme-text-primary capitalize">{site.site_type}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="theme-text-secondary">{t('websites.ga4Id')}</span>
                <span className="theme-text-primary">{site.ga4_property_id || '-'}</span>
              </div>
            </div>

            <div className="mt-6 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => handleEdit(site)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs theme-text-primary transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-input)' }}
              >
                <Edit2 size={12} /> {t('websites.editSite')}
              </button>
              <button
                onClick={() => handleDelete(site.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </GlassCard>
        ))}

        {websites.length === 0 && (
          <div className="col-span-full py-20 text-center theme-text-secondary">
            {t('websites.noSites')}
          </div>
        )}
      </div>

      {isModalOpen && editingSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-xl font-bold theme-text-primary">
                {editingSite.id ? t('websites.editSite') : t('websites.addSite')}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="theme-text-secondary hover:theme-text-primary">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6 scrollbar-hide">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs theme-text-secondary">{t('websites.name')}</label>
                  <input
                    type="text"
                    value={editingSite.name}
                    onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                    className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs theme-text-secondary">{t('websites.domain')}</label>
                  <input
                    type="text"
                    value={editingSite.domain}
                    onChange={(e) => setEditingSite({ ...editingSite, domain: e.target.value })}
                    placeholder="example.com"
                    className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs theme-text-secondary">{t('websites.type')}</label>
                  <select
                    value={editingSite.site_type}
                    onChange={(e) => setEditingSite({ ...editingSite, site_type: e.target.value })}
                    className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                    style={inputStyle}
                  >
                    <option value="generic">{t('websites.generic')}</option>
                    <option value="shopify">Shopify</option>
                    <option value="wordpress">WordPress</option>
                  </select>
                </div>

                <div className="col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <h4 className="mb-4 text-sm font-semibold theme-text-primary">{t('settings.googleCredentials')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs theme-text-secondary">{t('websites.gscUrl')}</label>
                      <input
                        type="text"
                        value={editingSite.gsc_site_url || ''}
                        onChange={(e) => setEditingSite({ ...editingSite, gsc_site_url: e.target.value })}
                        placeholder="sc-domain:example.com"
                        className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs theme-text-secondary">{t('websites.ga4Id')}</label>
                      <input
                        type="text"
                        value={editingSite.ga4_property_id || ''}
                        onChange={(e) => setEditingSite({ ...editingSite, ga4_property_id: e.target.value })}
                        placeholder="123456789"
                        className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {editingSite.site_type === 'shopify' && (
                  <div className="col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <h4 className="mb-4 text-sm font-semibold text-emerald-400">{t('settings.shopify')}</h4>
                    <label className="mb-1 block text-xs theme-text-secondary">{t('websites.shopifyToken')}</label>
                    <input
                      type="password"
                      value={editingSite.shopify_access_token || ''}
                      onChange={(e) => setEditingSite({ ...editingSite, shopify_access_token: e.target.value })}
                      className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                )}

                {editingSite.site_type === 'wordpress' && (
                  <div className="col-span-2 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <h4 className="mb-4 text-sm font-semibold text-blue-400">{t('settings.wp')}</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs theme-text-secondary">{t('websites.wpApi')}</label>
                        <input
                          type="url"
                          value={editingSite.wp_api_url || ''}
                          onChange={(e) => setEditingSite({ ...editingSite, wp_api_url: e.target.value })}
                          placeholder="https://site.com/wp-json"
                          className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs theme-text-secondary">{t('websites.wpUser')}</label>
                        <input
                          type="text"
                          value={editingSite.wp_username || ''}
                          onChange={(e) => setEditingSite({ ...editingSite, wp_username: e.target.value })}
                          className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs theme-text-secondary">{t('websites.wpPassword')}</label>
                        <input
                          type="password"
                          value={editingSite.wp_app_password || ''}
                          onChange={(e) => setEditingSite({ ...editingSite, wp_app_password: e.target.value })}
                          className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="col-span-2 flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editingSite.is_active}
                    onChange={(e) => setEditingSite({ ...editingSite, is_active: e.target.checked })}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <label htmlFor="is_active" className="text-sm theme-text-primary">{t('websites.active')}</label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6" style={{ borderTop: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 text-sm theme-text-secondary hover:theme-text-primary"
              >
                {t('urls.cancel')}
              </button>
              <GlowButton onClick={handleSave}>
                <Save size={16} /> {t('websites.save')}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
