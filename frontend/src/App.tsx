import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WebsiteProvider } from './context/WebsiteContext'
import { ToastProvider } from './context/ToastContext'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import URLManagement from './pages/URLManagement'
import WebsiteManagement from './pages/WebsiteManagement'
import TaskQueue from './pages/TaskQueue'
import QuotaMonitor from './pages/QuotaMonitor'
import Settings from './pages/Settings'
import KeywordAnalysis from './pages/KeywordAnalysis'
import CoreWebVitals from './pages/CoreWebVitals'

function App() {
  return (
    <WebsiteProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/urls" element={<URLManagement />} />
              <Route path="/keywords" element={<KeywordAnalysis />} />
              <Route path="/vitals" element={<CoreWebVitals />} />
              <Route path="/websites" element={<WebsiteManagement />} />
              <Route path="/tasks" element={<TaskQueue />} />
              <Route path="/quota" element={<QuotaMonitor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </WebsiteProvider>
  )
}

export default App
