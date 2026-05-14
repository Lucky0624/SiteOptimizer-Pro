import clsx from 'clsx'
import { useI18n } from '../../i18n/I18nContext'

interface PriorityIndicatorProps {
  score: number
}

function getPriorityColor(score: number): string {
  if (score > 60) return 'var(--accent-error)'
  if (score > 30) return 'var(--accent-warning)'
  if (score > 10) return '#ffdd00'
  return 'var(--accent-success)'
}

function getPriorityKey(score: number): string {
  if (score > 60) return 'priority.critical'
  if (score > 30) return 'priority.high'
  if (score > 10) return 'priority.medium'
  return 'priority.low'
}

export default function PriorityIndicator({ score }: PriorityIndicatorProps) {
  const { t } = useI18n()
  const color = getPriorityColor(score)
  const label = t(getPriorityKey(score))

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
        />
        <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(score, 100)}%`,
              backgroundColor: color,
              boxShadow: `0 0 6px ${color}80`,
            }}
          />
        </div>
      </div>
      <span className={clsx('text-xs font-medium')} style={{ color }}>
        {score} · {label}
      </span>
    </div>
  )
}
