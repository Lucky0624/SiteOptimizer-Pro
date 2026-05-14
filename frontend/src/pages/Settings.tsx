import { useState, useEffect } from 'react'
import { Save, TestTube, Eye, EyeOff } from 'lucide-react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'

interface SettingsForm {
  adminKey: string
  clientEmail: string
  privateKey: string
  siteUrl: string
  psiApiKey: string
  ga4PropertyId: string
  dingtalkWebhook: string
  wecomWebhook: string
  shopifyUrl: string
  shopifyToken: string
  wpUrl: string
  wpUser: string
  wpPassword: string
}

export default function Settings() {
  const { t } = useI18n()
  const [showKey, setShowKey] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState<SettingsForm>({
    adminKey: localStorage.getItem('admin_key') || '',
    clientEmail: '',
    privateKey: '',
    siteUrl: '',
    psiApiKey: '',
    ga4PropertyId: '',
    dingtalkWebhook: '',
    wecomWebhook: '',
    shopifyUrl: '',
    shopifyToken: '',
    wpUrl: '',
    wpUser: '',
    wpPassword: '',
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.settings.getAll()
        setForm(prev => ({
          ...prev,
          clientEmail: data['GOOGLE_CLIENT_EMAIL'] || '',
          privateKey: data['GOOGLE_PRIVATE_KEY'] || '',
          siteUrl: data['GOOGLE_SITE_URL'] || '',
          psiApiKey: data['GOOGLE_PSI_API_KEY'] || '',
          ga4PropertyId: data['GA4_PROPERTY_ID'] || '',
          dingtalkWebhook: data['DINGTALK_WEBHOOK_URL'] || '',
          wecomWebhook: data['WECOM_WEBHOOK_URL'] || '',
          shopifyUrl: data['SHOPIFY_SHOP_URL'] || '',
          shopifyToken: data['SHOPIFY_ACCESS_TOKEN'] || '',
          wpUrl: data['WP_API_URL'] || '',
          wpUser: data['WP_USERNAME'] || '',
          wpPassword: data['WP_APP_PASSWORD'] || '',
        }))
      } catch (err) {
        console.error('Failed to load settings', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const updateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    localStorage.setItem('admin_key', form.adminKey)
    try {
      await api.settings.update([
        { key: 'GOOGLE_CLIENT_EMAIL', value: form.clientEmail },
        { key: 'GOOGLE_PRIVATE_KEY', value: form.privateKey },
        { key: 'GOOGLE_SITE_URL', value: form.siteUrl },
        { key: 'GOOGLE_PSI_API_KEY', value: form.psiApiKey },
        { key: 'GA4_PROPERTY_ID', value: form.ga4PropertyId },
        { key: 'DINGTALK_WEBHOOK_URL', value: form.dingtalkWebhook },
        { key: 'WECOM_WEBHOOK_URL', value: form.wecomWebhook },
        { key: 'SHOPIFY_SHOP_URL', value: form.shopifyUrl },
        { key: 'SHOPIFY_ACCESS_TOKEN', value: form.shopifyToken },
        { key: 'WP_API_URL', value: form.wpUrl },
        { key: 'WP_USERNAME', value: form.wpUser },
        { key: 'WP_APP_PASSWORD', value: form.wpPassword },
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(t('settings.connectionFailed'))
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.dashboard.getStats()
      if (res) {
        setTestResult({ ok: true, msg: t('settings.connectionSuccess') })
      }
    } catch (err) {
      setTestResult({ ok: false, msg: t('settings.connectionFailed') })
    } finally {
      setTesting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  }

  if (loading) return <div className="p-12 text-center theme-text-secondary">{t('settings.loading')}</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.adminKey')}</h2>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={form.adminKey}
            onChange={(e) => updateField('adminKey', e.target.value)}
            placeholder={t('settings.enterAdminKey')}
            className="h-10 w-full rounded-xl px-4 pr-10 text-sm outline-none"
            style={inputStyle}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-secondary hover:theme-text-primary"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.googleCredentials')}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.clientEmail')}</label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={(e) => updateField('clientEmail', e.target.value)}
              placeholder="your-service@project.iam.gserviceaccount.com"
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.privateKey')}</label>
            <div className="relative">
              <textarea
                value={form.privateKey}
                onChange={(e) => updateField('privateKey', e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                rows={4}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
              <button
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="absolute right-3 top-3 theme-text-secondary hover:theme-text-primary"
              >
                {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <GlowButton variant="secondary" onClick={handleTestConnection} disabled={testing}>
              <TestTube size={14} /> {testing ? t('settings.testing') : t('settings.testConnection')}
            </GlowButton>
            {testResult && (
              <span className="text-xs font-medium" style={{ color: testResult.ok ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                {testResult.msg}
              </span>
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.siteConfig')}</h2>
        <div>
          <label className="mb-1 block text-xs theme-text-secondary">{t('settings.siteUrl')}</label>
          <input
            type="url"
            value={form.siteUrl}
            onChange={(e) => updateField('siteUrl', e.target.value)}
            placeholder="https://your-site.com"
            className="h-10 w-full rounded-xl px-4 text-sm outline-none"
            style={inputStyle}
          />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.psi')}</h2>
        <div>
          <label className="mb-1 block text-xs theme-text-secondary">{t('settings.psiApiKey')}</label>
          <input
            type="password"
            value={form.psiApiKey}
            onChange={(e) => updateField('psiApiKey', e.target.value)}
            placeholder={t('settings.enterPsiKey')}
            className="h-10 w-full rounded-xl px-4 text-sm outline-none"
            style={inputStyle}
          />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.ga4')}</h2>
        <div>
          <label className="mb-1 block text-xs theme-text-secondary">{t('settings.ga4PropertyId')}</label>
          <input
            type="text"
            value={form.ga4PropertyId}
            onChange={(e) => updateField('ga4PropertyId', e.target.value)}
            placeholder="e.g. 123456789"
            className="h-10 w-full rounded-xl px-4 text-sm outline-none"
            style={inputStyle}
          />
          <p className="mt-2 text-[10px] theme-text-secondary">{t('settings.ga4PropertyHint')}</p>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.notifications')}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.dingtalkWebhook')}</label>
            <input
              type="url"
              value={form.dingtalkWebhook}
              onChange={(e) => updateField('dingtalkWebhook', e.target.value)}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.wecomWebhook')}</label>
            <input
              type="url"
              value={form.wecomWebhook}
              onChange={(e) => updateField('wecomWebhook', e.target.value)}
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.shopify')}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.shopifyUrl')}</label>
            <input
              type="text"
              value={form.shopifyUrl}
              onChange={(e) => updateField('shopifyUrl', e.target.value)}
              placeholder="your-shop.myshopify.com"
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.shopifyToken')}</label>
            <input
              type="password"
              value={form.shopifyToken}
              onChange={(e) => updateField('shopifyToken', e.target.value)}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-4 text-lg font-semibold theme-text-primary">{t('settings.wp')}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs theme-text-secondary">{t('settings.wpUrl')}</label>
            <input
              type="url"
              value={form.wpUrl}
              onChange={(e) => updateField('wpUrl', e.target.value)}
              placeholder="https://your-wp-site.com/wp-json"
              className="h-10 w-full rounded-xl px-4 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs theme-text-secondary">{t('settings.wpUser')}</label>
              <input
                type="text"
                value={form.wpUser}
                onChange={(e) => updateField('wpUser', e.target.value)}
                placeholder="admin"
                className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs theme-text-secondary">{t('settings.wpPassword')}</label>
              <input
                type="password"
                value={form.wpPassword}
                onChange={(e) => updateField('wpPassword', e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                className="h-10 w-full rounded-xl px-4 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex items-center justify-between">
        <p className="text-xs theme-text-secondary">
          {t('settings.saveNote')}
        </p>
        <GlowButton onClick={handleSave}>
          <Save size={14} /> {saved ? t('settings.saved') : t('settings.save')}
        </GlowButton>
      </div>
    </div>
  )
}
