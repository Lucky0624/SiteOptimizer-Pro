import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import URLManagement from './pages/URLManagement'
import WebsiteManagement from './pages/WebsiteManagement'
import TaskQueue from './pages/TaskQueue'
import QuotaMonitor from './pages/QuotaMonitor'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/urls" element={<URLManagement />} />
          <Route path="/websites" element={<WebsiteManagement />} />
          <Route path="/tasks" element={<TaskQueue />} />
          <Route path="/quota" element={<QuotaMonitor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
