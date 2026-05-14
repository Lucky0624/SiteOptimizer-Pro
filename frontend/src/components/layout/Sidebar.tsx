import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Link, ListTodo, Gauge, Settings, Wifi, WifiOff, X, Globe } from 'lucide-react'
import clsx from 'clsx'
import { useI18n } from '../../i18n/I18nContext'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navKeys = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
  { to: '/urls', icon: Link, labelKey: 'sidebar.urls' },
  { to: '/websites', icon: Globe, labelKey: 'sidebar.websites' },
  { to: '/tasks', icon: ListTodo, labelKey: 'sidebar.tasks' },
  { to: '/quota', icon: Gauge, labelKey: 'sidebar.quota' },
  { to: '/settings', icon: Settings, labelKey: 'sidebar.settings' },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useI18n()
  const isConnected = !!localStorage.getItem('admin_key')

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#b026ff]">
            <Link size={16} className="text-white dark:text-[#0a0a1a]" />
          </div>
          <span className="text-lg font-bold text-glow-cyan" style={{ color: 'var(--accent-cyan)' }}>
            SiteOptimizer Pro
          </span>
        </div>
        <button onClick={onClose} className="theme-text-secondary hover:theme-text-primary lg:hidden">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navKeys.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'glow-cyan-sm'
                  : 'hover:opacity-80'
              )
            }
            style={({ isActive }) => isActive ? {
              backgroundColor: 'rgba(0, 240, 255, 0.1)',
              color: 'var(--accent-cyan)',
            } : {
              color: 'var(--text-secondary)',
            }}
          >
            <item.icon size={18} />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <>
              <Wifi size={14} style={{ color: 'var(--accent-success)' }} />
              <span style={{ color: 'var(--accent-success)' }}>{t('sidebar.connected')}</span>
            </>
          ) : (
            <>
              <WifiOff size={14} style={{ color: 'var(--accent-error)' }} />
              <span style={{ color: 'var(--accent-error)' }}>{t('sidebar.disconnected')}</span>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
