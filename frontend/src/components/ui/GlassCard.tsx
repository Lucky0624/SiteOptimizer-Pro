import { type ReactNode } from 'react'
import clsx from 'clsx'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hoverable?: boolean
  glowColor?: 'cyan' | 'purple'
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

export default function GlassCard({ children, className, hoverable = false, glowColor, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-2xl backdrop-blur-xl transition-all duration-300',
        hoverable && 'hover:scale-[1.02] cursor-pointer',
        glowColor === 'cyan' && 'glow-cyan',
        glowColor === 'purple' && 'glow-purple',
        hoverable && glowColor === 'cyan' && 'hover:glow-cyan',
        hoverable && glowColor === 'purple' && 'hover:glow-purple',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: glowColor === 'cyan' ? 'var(--shadow-glow-cyan)' : glowColor === 'purple' ? 'var(--shadow-glow-purple)' : 'var(--shadow-glass)',
      }}
    >
      {children}
    </div>
  )
}
