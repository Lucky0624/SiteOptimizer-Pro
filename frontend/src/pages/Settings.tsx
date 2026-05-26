import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, Circle, Copy, KeyRound, Trash2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  api,
  GlobalSecretStatus,
  GoogleCredentialImportResponse,
  SecretStatusItem,
  WebsiteResponse,
} from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../context/ToastContext'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'

type EditableSecretKey = 'GOOGLE_PSI_API_KEY' | 'DINGTALK_WEBHOOK_URL' | 'WECOM_WEBHOOK_URL'

interface SecretForm {
  GOOGLE_PSI_API_KEY: string
  DINGTALK_WEBHOOK_URL: string
  WECOM_WEBHOOK_URL: string
}

interface GoogleCredentialState {
  configured: boolean
  clientEmail: string
  projectId: string
}

const emptySecretForm: SecretForm = {
  GOOGLE_PSI_API_KEY: '',
  DINGTALK_WEBHOOK_URL: '',
  WECOM_WEBHOOK_URL: '',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
}

function StatusPill({ configured }: { configured: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        color: configured ? 'var(--accent-success)' : 'var(--text-secondary)',
        backgroundColor: configured ? 'rgba(16,185,129,0.12)' : 'var(--bg-input)',
      }}
    >
      {configured ? '已配置' : '未配置'}
    </span>
  )
}

function formatTime(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function SecretCard({
  title,
  label,
  secretKey,
  placeholder,
  value,
  status,
  saving,
  onChange,
  onSave,
  onClear,
}: {
  title: string
  label: string
  secretKey: EditableSecretKey
  placeholder: string
  value: string
  status: SecretStatusItem | undefined
  saving: boolean
  onChange: (key: EditableSecretKey, value: string) => void
  onSave: (key: EditableSecretKey) => void
  onClear: (key: EditableSecretKey) => void
}) {
  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold theme-text-primary">{title}</h2>
        <StatusPill configured={!!status?.configured} />
      </div>
      <label className="mb-1 block text-xs theme-text-secondary">{label}</label>
      <input
        type="password"
        value={value}
        onChange={event => onChange(secretKey, event.target.value)}
        placeholder={status?.configured ? '输入新值以替换现有配置' : placeholder}
        className="h-10 w-full rounded-xl px-4 text-sm outline-none"
        style={inputStyle}
      />
      {status?.configured && status.updated_at && (
        <p className="mt-2 text-[11px] theme-text-secondary">最近更新：{formatTime(status.updated_at)}</p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <GlowButton size="sm" onClick={() => onSave(secretKey)} disabled={saving}>
          {saving ? '保存中...' : status?.configured ? '替换' : '保存'}
        </GlowButton>
        {status?.configured && (
          <GlowButton size="sm" variant="secondary" onClick={() => onClear(secretKey)} disabled={saving}>
            <Trash2 size={13} /> 清除
          </GlowButton>
        )}
      </div>
    </GlassCard>
  )
}

export default function Settings() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<EditableSecretKey | null>(null)
  const [importing, setImporting] = useState(false)
  const [clearingGoogle, setClearingGoogle] = useState(false)
  const [credential, setCredential] = useState<GoogleCredentialState>({
    configured: false,
    clientEmail: '',
    projectId: '',
  })
  const [statuses, setStatuses] = useState<GlobalSecretStatus | null>(null)
  const [sites, setSites] = useState<WebsiteResponse[]>([])
  const [secretForm, setSecretForm] = useState<SecretForm>(emptySecretForm)

  const loadSettings = useCallback(async () => {
    try {
      const [settings, status, websiteList] = await Promise.all([
        api.settings.getAll(),
        api.settings.getSecretStatus(),
        api.websites.listAll(),
      ])
      setCredential({
        configured: status.GOOGLE_PRIVATE_KEY.configured,
        clientEmail: settings.GOOGLE_CLIENT_EMAIL || '',
        projectId: settings.GOOGLE_PROJECT_ID || '',
      })
      setStatuses(status)
      setSites(websiteList)
    } catch (error: any) {
      showToast(error.message || t('settings.connectionFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, t])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateSecret = (key: EditableSecretKey, value: string) => {
    setSecretForm(previous => ({ ...previous, [key]: value }))
  }

  const saveSecret = async (key: EditableSecretKey) => {
    const value = secretForm[key].trim()
    if (!value) {
      showToast('请先输入新的密钥或 Webhook 地址。', 'warning')
      return
    }
    setSavingKey(key)
    try {
      await api.settings.update([{ key, value }])
      updateSecret(key, '')
      const status = await api.settings.getSecretStatus()
      setStatuses(status)
      showToast('已加密保存。', 'success')
    } catch (error: any) {
      showToast(error.message || t('settings.connectionFailed'), 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const clearSecret = async (key: EditableSecretKey) => {
    if (!window.confirm('确认清除当前已保存的配置吗？')) return
    setSavingKey(key)
    try {
      await api.settings.clearSecret(key)
      const status = await api.settings.getSecretStatus()
      setStatuses(status)
      showToast('已清除配置。', 'success')
    } catch (error: any) {
      showToast(error.message || t('settings.connectionFailed'), 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const importCredentials = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 65536) {
      showToast(t('settings.credentialFileTooLarge'), 'error')
      return
    }
    setImporting(true)
    try {
      const result: GoogleCredentialImportResponse = await api.settings.importGoogleCredentials(await file.text())
      setCredential({
        configured: result.configured,
        clientEmail: result.client_email,
        projectId: result.project_id,
      })
      setStatuses(await api.settings.getSecretStatus())
      showToast(t('settings.credentialsImported'), 'success')
    } catch (error: any) {
      showToast(error.message || t('settings.credentialsImportFailed'), 'error')
    } finally {
      setImporting(false)
    }
  }

  const clearCredentials = async () => {
    if (!window.confirm('确认移除本机保存的 Google 服务账号密钥吗？')) return
    setClearingGoogle(true)
    try {
      await api.settings.clearGoogleCredentials()
      setCredential({ configured: false, clientEmail: '', projectId: '' })
      setStatuses(await api.settings.getSecretStatus())
      showToast('Google 服务账号密钥已移除。', 'success')
    } catch (error: any) {
      showToast(error.message || t('settings.connectionFailed'), 'error')
    } finally {
      setClearingGoogle(false)
    }
  }

  const copyEmail = async () => {
    if (!credential.clientEmail) return
    await navigator.clipboard.writeText(credential.clientEmail)
    showToast('服务账号邮箱已复制。', 'success')
  }

  if (loading) return <div className="p-12 text-center theme-text-secondary">{t('settings.loading')}</div>

  const verifiedSite = sites.some(site => !!site.gsc_verified_at)
  const setupSteps = [
    { label: '导入 Google 服务账号 JSON 密钥', complete: credential.configured },
    { label: '在 Search Console 中添加服务账号邮箱权限', complete: verifiedSite },
    { label: '创建站点并选择 GSC 属性', complete: sites.some(site => !!site.gsc_site_url) },
    { label: '通过站点的 GSC 连接测试', complete: verifiedSite },
    { label: '启用需要执行任务的站点', complete: sites.some(site => site.is_active) },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <GlassCard className="p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold theme-text-primary">首次接入清单</h2>
            <p className="mt-1 text-sm theme-text-secondary">全局密钥在这里管理；GSC、GA4 与 CMS 连接在各站点中设置和测试。</p>
          </div>
          <Link
            to="/websites"
            className="rounded-xl px-4 py-2 text-sm font-medium"
            style={{ border: '1px solid var(--border-color)', color: 'var(--accent-cyan)' }}
          >
            前往站点管理
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {setupSteps.map(step => (
            <div key={step.label} className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)' }}>
              {step.complete
                ? <CheckCircle size={17} style={{ color: 'var(--accent-success)' }} />
                : <Circle size={17} className="theme-text-secondary" />}
              <span className="text-sm theme-text-primary">{step.label}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold theme-text-primary">{t('settings.googleCredentials')}</h2>
          <StatusPill configured={credential.configured} />
        </div>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)' }}>
          {credential.configured ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <KeyRound size={15} style={{ color: 'var(--accent-success)' }} />
                <span className="theme-text-primary">{credential.clientEmail}</span>
                <button type="button" onClick={copyEmail} className="theme-text-secondary hover:theme-text-primary" title="复制邮箱">
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-xs theme-text-secondary">Cloud 项目 ID：{credential.projectId}</p>
              <p className="text-xs theme-text-secondary">将上面的邮箱添加到 Search Console 属性后，到站点管理中读取属性并测试权限。</p>
            </div>
          ) : (
            <p className="text-sm theme-text-secondary">导入 Google Cloud 下载的服务账号 JSON 密钥后，才能读取 Search Console 属性。</p>
          )}
        </div>
        <input ref={fileInputRef} type="file" className="hidden" accept=".json,application/json" onChange={importCredentials} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <GlowButton variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload size={14} /> {importing ? t('settings.importingCredentials') : credential.configured ? '替换 Google JSON 密钥' : t('settings.importCredentials')}
          </GlowButton>
          {credential.configured && (
            <GlowButton variant="secondary" onClick={clearCredentials} disabled={clearingGoogle}>
              <Trash2 size={14} /> {clearingGoogle ? '移除中...' : '移除'}
            </GlowButton>
          )}
          <p className="text-xs theme-text-secondary">{t('settings.credentialStorageHint')}</p>
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecretCard
          title={t('settings.psi')}
          label={t('settings.psiApiKey')}
          secretKey="GOOGLE_PSI_API_KEY"
          placeholder={t('settings.enterPsiKey')}
          value={secretForm.GOOGLE_PSI_API_KEY}
          status={statuses?.GOOGLE_PSI_API_KEY}
          saving={savingKey === 'GOOGLE_PSI_API_KEY'}
          onChange={updateSecret}
          onSave={saveSecret}
          onClear={clearSecret}
        />
        <SecretCard
          title="钉钉通知"
          label={t('settings.dingtalkWebhook')}
          secretKey="DINGTALK_WEBHOOK_URL"
          placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
          value={secretForm.DINGTALK_WEBHOOK_URL}
          status={statuses?.DINGTALK_WEBHOOK_URL}
          saving={savingKey === 'DINGTALK_WEBHOOK_URL'}
          onChange={updateSecret}
          onSave={saveSecret}
          onClear={clearSecret}
        />
        <SecretCard
          title="企业微信通知"
          label={t('settings.wecomWebhook')}
          secretKey="WECOM_WEBHOOK_URL"
          placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
          value={secretForm.WECOM_WEBHOOK_URL}
          status={statuses?.WECOM_WEBHOOK_URL}
          saving={savingKey === 'WECOM_WEBHOOK_URL'}
          onChange={updateSecret}
          onSave={saveSecret}
          onClear={clearSecret}
        />
      </div>

      <p className="text-xs theme-text-secondary">敏感值仅在本机加密保存，不会在页面中重新显示；站点专属集成统一在站点管理中维护。</p>
    </div>
  )
}
