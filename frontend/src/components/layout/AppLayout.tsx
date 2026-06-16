import { FormEvent, useEffect, useState } from 'react'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import GlassCard from '../ui/GlassCard'
import GlowButton from '../ui/GlowButton'
import Sidebar from './Sidebar'
import Header from './Header'

type AccessState = 'checking' | 'locked' | 'unlocked'

export default function AppLayout() {
  const { showToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accessState, setAccessState] = useState<AccessState>(() => (
    localStorage.getItem('admin_key') ? 'checking' : 'locked'
  ))
  const [accessKey, setAccessKey] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  useEffect(() => {
    if (accessState !== 'checking') return
    api.settings.getAll()
      .then(() => setAccessState('unlocked'))
      .catch(() => {
        localStorage.removeItem('admin_key')
        setAccessState('locked')
        showToast('本机访问口令已失效，请重新输入。', 'warning')
      })
  }, [accessState, showToast])

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault()
    const key = accessKey.trim()
    if (!key) {
      showToast('请输入本机访问口令。', 'warning')
      return
    }
    setUnlocking(true)
    localStorage.setItem('admin_key', key)
    try {
      await api.settings.getAll()
      setAccessKey('')
      setAccessState('unlocked')
      showToast('本机访问已解锁。', 'success')
    } catch {
      localStorage.removeItem('admin_key')
      showToast('访问口令不正确，请检查后重试。', 'error')
    } finally {
      setUnlocking(false)
    }
  }

  const handleLock = () => {
    localStorage.removeItem('admin_key')
    setSidebarOpen(false)
    setAccessState('locked')
  }

  if (accessState !== 'unlocked') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 theme-bg-base">
        <GlassCard className="w-full max-w-md p-8" glowColor="cyan">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'rgba(0,240,255,0.12)', color: 'var(--accent-cyan)' }}>
            {accessState === 'checking' ? <KeyRound size={23} /> : <LockKeyhole size={23} />}
          </div>
          <h1 className="text-2xl font-bold theme-text-primary">解锁 SiteOptimizer Pro</h1>
          <p className="mt-2 text-sm theme-text-secondary">
            {accessState === 'checking'
              ? '正在验证本机保存的访问口令...'
              : '输入安装时设置的本机访问口令，进入配置和站点数据。'}
          </p>
          {accessState === 'locked' && (
            <form onSubmit={handleUnlock} className="mt-6 space-y-4">
              <input
                type="password"
                autoFocus
                value={accessKey}
                onChange={event => setAccessKey(event.target.value)}
                placeholder="本机访问口令"
                className="h-11 w-full rounded-xl px-4 text-sm outline-none"
                style={{
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              />
              <GlowButton type="submit" disabled={unlocking}>
                <KeyRound size={15} /> {unlocking ? '验证中...' : '解锁并进入'}
              </GlowButton>
            </form>
          )}
          <p className="mt-6 text-xs theme-text-secondary">访问口令仅保存在当前浏览器本机存储中，用于连接本地后端服务。</p>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden theme-bg-base">
      <Sidebar open={sidebarOpen} connected onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} onLock={handleLock} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
