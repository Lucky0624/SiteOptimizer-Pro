import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, RefreshCw, Key, Sun, Moon, Languages } from 'lucide-react'
import { useI18n } from '../../i18n/I18nContext'
import { useTheme } from '../../theme/ThemeContext'

interface HeaderProps {
  onMenuToggle: () => void
}

const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'dashboard.title',
  '/urls': 'urls.title',
  '/tasks': 'tasks.title',
  '/quota': 'quota.title',
  '/settings': 'settings.title',
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const location = useLocation()
  const { t, locale, setLocale } = useI18n()
  const { toggleTheme, isDark } = useTheme()
  const titleKey = pageTitleKeys[location.pathname] || 'dashboard.title'
  const [adminKey, setAdminKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')

  useEffect(() => {
    const stored = localStorage.getItem('admin_key')
    if (stored) {
      setAdminKey(stored)
    } else {
      setShowKeyInput(true)
    }
    setLastSync(new Date().toLocaleTimeString())
  }, [])

  const handleKeySave = () => {
    localStorage.setItem('admin_key', adminKey)
    setShowKeyInput(false)
    setLastSync(new Date().toLocaleTimeString())
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  const toggleLocale = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh')
  }

  return (
    <header
      className="flex h-16 items-center justify-between backdrop-blur-xl px-6"
      style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="theme-text-secondary hover:theme-text-primary lg:hidden"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-xl font-bold theme-text-primary">{t(titleKey)}</h1>
      </div>

      <div className="flex items-center gap-3">
        {showKeyInput ? (
          <div className="flex items-center gap-2">
            <Key size={14} style={{ color: 'var(--accent-warning)' }} />
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder={t('header.adminKey')}
              className="h-8 w-40 rounded-lg px-3 text-xs outline-none"
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleKeySave()}
            />
            <button
              onClick={handleKeySave}
              className="h-8 rounded-lg px-3 text-xs font-medium"
              style={{ backgroundColor: 'rgba(0,240,255,0.15)', color: 'var(--accent-cyan)' }}
            >
              {t('header.save')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowKeyInput(true)}
            className="flex items-center gap-1.5 text-xs theme-text-secondary hover:theme-text-primary"
          >
            <Key size={14} />
            {t('header.keySet')}
          </button>
        )}

        <button
          onClick={toggleLocale}
          className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80"
          title={locale === 'zh' ? 'English' : '中文'}
        >
          <Languages size={16} />
        </button>

        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80"
          title={isDark ? t('theme.light') : t('theme.dark')}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          onClick={handleRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80"
        >
          <RefreshCw size={16} />
        </button>

        {lastSync && (
          <span className="text-[10px] theme-text-secondary">
            {t('header.lastSync')}: {lastSync}
          </span>
        )}
      </div>
    </header>
  )
}
