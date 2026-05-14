import { type ReactNode } from 'react'
import clsx from 'clsx'

interface GlowButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit'
}

export default function GlowButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
}: GlowButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-300 active:scale-95',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-7 py-3.5 text-base',
        variant === 'primary' && 'text-white dark:text-[#0a0a1a]',
        variant === 'secondary' && 'bg-transparent theme-text-primary',
        variant === 'danger' && 'text-white',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
      style={variant === 'primary' ? {
        background: 'linear-gradient(to right, var(--accent-cyan), #0088cc)',
        boxShadow: 'var(--shadow-glow-cyan)',
      } : variant === 'secondary' ? {
        border: '1px solid var(--border-color)',
      } : variant === 'danger' ? {
        background: 'linear-gradient(to right, var(--accent-error), #cc2244)',
      } : undefined}
    >
      {children}
    </button>
  )
}
