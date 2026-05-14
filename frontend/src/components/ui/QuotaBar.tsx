import clsx from 'clsx'

interface QuotaBarProps {
  used: number
  limit: number
  label: string
  color?: string
}

export default function QuotaBar({ used, limit, label, color = '#00f0ff' }: QuotaBarProps) {
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0
  const isHigh = percentage > 80
  const barColor = isHigh ? 'var(--accent-error)' : color

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium theme-text-primary">{label}</span>
        <span className="text-xs theme-text-secondary">
          {used} / {limit} ({percentage}%)
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-700',
            isHigh && 'animate-pulse'
          )}
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 10px ${barColor}60`,
          }}
        />
      </div>
    </div>
  )
}
