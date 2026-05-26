import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface WebsiteContextValue {
  selectedWebsiteId: number | null
  setSelectedWebsiteId: (id: number | null) => void
}

const WebsiteContext = createContext<WebsiteContextValue>({
  selectedWebsiteId: null,
  setSelectedWebsiteId: () => {},
})

export function WebsiteProvider({ children }: { children: ReactNode }) {
  const [selectedWebsiteId, setSelectedWebsiteIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem('selected_website_id')
    return stored ? Number(stored) : null
  })

  const setSelectedWebsiteId = useCallback((id: number | null) => {
    setSelectedWebsiteIdState(id)
    if (id === null) {
      localStorage.removeItem('selected_website_id')
    } else {
      localStorage.setItem('selected_website_id', String(id))
    }
  }, [])

  return (
    <WebsiteContext.Provider value={{ selectedWebsiteId, setSelectedWebsiteId }}>
      {children}
    </WebsiteContext.Provider>
  )
}

export function useWebsite() {
  return useContext(WebsiteContext)
}
