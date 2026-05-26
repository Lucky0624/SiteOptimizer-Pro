import { useState, useEffect } from 'react'
import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n/I18nContext'
import { api } from '../../services/api'
import type { WebsiteResponse } from '../../services/api'

interface WebsiteSelectorProps {
  value: number | null
  onChange: (websiteId: number | null) => void
  className?: string
}

export default function WebsiteSelector({ value, onChange, className }: WebsiteSelectorProps) {
  const { t } = useI18n()
  const [websites, setWebsites] = useState<WebsiteResponse[]>([])

  useEffect(() => {
    const fetchWebsites = async () => {
      try {
        const items = await api.websites.listAll()
        setWebsites(items)
      } catch {
        setWebsites([])
      }
    }
    fetchWebsites()
  }, [])

  return (
    <div className={`relative ${className || ''}`}>
      <div className="flex items-center gap-2">
        <Globe size={16} style={{ color: 'var(--accent-cyan)' }} />
        <select
          value={value ?? ''}
          onChange={(e) => {
            const val = e.target.value
            onChange(val ? Number(val) : null)
          }}
          className="h-9 rounded-xl px-3 text-sm outline-none transition-colors"
          style={{
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            minWidth: '160px',
          }}
        >
          <option value="">{t('websites.allSites') || 'All Sites'}</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.domain})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
