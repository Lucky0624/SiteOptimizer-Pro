import { useLocation } from 'react-router-dom'
import { KeyRound, Languages, Menu, Moon, RefreshCw, Sun } from 'lucide-react'
import { useI18n } from '../../i18n/I18nContext'
import { useTheme } from '../../theme/ThemeContext'

interface HeaderProps {
  onMenuToggle: () => void
  onLock: () => void
}

const pageTitleKeys: Record<string, string> = {
  '/guide': 'sidebar.guide',
  '/dashboard': 'dashboard.title',
  '/urls': 'urls.title',
  '/keywords': 'sidebar.keywords',
  '/vitals': 'sidebar.vitals',
  '/websites': 'websites.title',
  '/tasks': 'tasks.title',
  '/quota': 'quota.title',
  '/settings': 'settings.title',
}

export default function Header({ onMenuToggle, onLock }: HeaderProps) {
  const location = useLocation()
  const { t, locale, setLocale } = useI18n()
  const { toggleTheme, isDark } = useTheme()
  const titleKey = pageTitleKeys[location.pathname] || 'dashboard.title'

  return (
    <header
      className="flex h-16 items-center justify-between backdrop-blur-xl px-6"
      style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="theme-text-secondary hover:theme-text-primary lg:hidden">
          <Menu size={22} />
        </button>
        <h1 className="text-xl font-bold theme-text-primary">{t(titleKey)}</h1>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onLock} className="flex items-center gap-1.5 text-xs theme-text-secondary hover:theme-text-primary" title="更换本机访问口令">
          <KeyRound size={14} /> 本机已解锁
        </button>
        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80"
          title={locale === 'zh' ? 'English' : '中文'}
        >
          <Languages size={16} />
        </button>
        <button onClick={toggleTheme} className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80" title={isDark ? t('theme.light') : t('theme.dark')}>
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => window.location.reload()} className="flex h-8 w-8 items-center justify-center rounded-lg theme-text-secondary transition-colors hover:opacity-80" title="刷新">
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  )
}
