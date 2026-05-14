import { Clock, Loader2, CheckCircle2, XCircle, Pause } from 'lucide-react'
import clsx from 'clsx'

interface StatusBadgeProps {
  status: string
  type?: 'tag' | 'task'
  label?: string
}

const tagColors: Record<string, string> = {
  indexed: 'bg-[rgba(0,255,136,0.15)] text-[#00ff88] border-[rgba(0,255,136,0.3)]',
  'not-indexed': 'bg-[rgba(255,68,102,0.15)] text-[#ff4466] border-[rgba(255,68,102,0.3)]',
  opportunity: 'bg-[rgba(0,240,255,0.15)] text-[#00f0ff] border-[rgba(0,240,255,0.3)]',
  decaying: 'bg-[rgba(255,170,0,0.15)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]',
  high_priority: 'bg-[rgba(176,38,255,0.15)] text-[#b026ff] border-[rgba(176,38,255,0.3)]',
  new: 'bg-[rgba(0,240,255,0.15)] text-[#00f0ff] border-[rgba(0,240,255,0.3)]',
  recrawl: 'bg-[rgba(255,170,0,0.15)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]',
  archived: 'bg-[rgba(136,136,170,0.15)] text-[#8888aa] border-[rgba(136,136,170,0.3)]',
}

const taskConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: {
    color: 'bg-[rgba(255,170,0,0.15)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]',
    icon: <Clock size={12} />,
  },
  running: {
    color: 'bg-[rgba(0,240,255,0.15)] text-[#00f0ff] border-[rgba(0,240,255,0.3)]',
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  completed: {
    color: 'bg-[rgba(0,255,136,0.15)] text-[#00ff88] border-[rgba(0,255,136,0.3)]',
    icon: <CheckCircle2 size={12} />,
  },
  failed: {
    color: 'bg-[rgba(255,68,102,0.15)] text-[#ff4466] border-[rgba(255,68,102,0.3)]',
    icon: <XCircle size={12} />,
  },
  deferred: {
    color: 'bg-[rgba(136,136,170,0.15)] text-[#8888aa] border-[rgba(136,136,170,0.3)]',
    icon: <Pause size={12} />,
  },
}

export default function StatusBadge({ status, type = 'tag', label }: StatusBadgeProps) {
  if (type === 'task') {
    const config = taskConfig[status] || taskConfig.pending
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
          config.color
        )}
      >
        {config.icon}
        {label ?? status}
      </span>
    )
  }

  const colorClass = tagColors[status] || 'bg-[rgba(136,136,170,0.15)] text-[#8888aa] border-[rgba(136,136,170,0.3)]'

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colorClass
      )}
    >
      {label ?? status}
    </span>
  )
}
