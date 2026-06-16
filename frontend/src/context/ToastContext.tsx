import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

let _counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_counter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const iconMap: Record<ToastType, string> = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
  }

  const colorMap: Record<ToastType, string> = {
    success: 'var(--accent-success)',
    error: 'var(--accent-error)',
    warning: 'var(--accent-warning)',
    info: 'var(--accent-cyan)',
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast 容器 */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${colorMap[toast.type]}40`,
              boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px ${colorMap[toast.type]}20`,
              backdropFilter: 'blur(12px)',
              minWidth: '280px',
              maxWidth: '420px',
              animation: 'slideInRight 0.3s ease',
              pointerEvents: 'auto',
            }}
          >
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: `${colorMap[toast.type]}20`,
                color: colorMap[toast.type],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              {iconMap[toast.type]}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {toast.message}
            </span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
