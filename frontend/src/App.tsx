import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WebsiteProvider } from './context/WebsiteContext'
import { ToastProvider } from './context/ToastContext'
import AppLayout from './components/layout/AppLayout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const URLManagement = lazy(() => import('./pages/URLManagement'))
const WebsiteManagement = lazy(() => import('./pages/WebsiteManagement'))
const TaskQueue = lazy(() => import('./pages/TaskQueue'))
const QuotaMonitor = lazy(() => import('./pages/QuotaMonitor'))
const Settings = lazy(() => import('./pages/Settings'))
const KeywordAnalysis = lazy(() => import('./pages/KeywordAnalysis'))
const CoreWebVitals = lazy(() => import('./pages/CoreWebVitals'))

function PageFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center theme-text-secondary">
      正在加载页面...
    </div>
  )
}

function withPageFallback(page: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{page}</Suspense>
}

function App() {
  return (
    <WebsiteProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={withPageFallback(<Dashboard />)} />
              <Route path="/urls" element={withPageFallback(<URLManagement />)} />
              <Route path="/keywords" element={withPageFallback(<KeywordAnalysis />)} />
              <Route path="/vitals" element={withPageFallback(<CoreWebVitals />)} />
              <Route path="/websites" element={withPageFallback(<WebsiteManagement />)} />
              <Route path="/tasks" element={withPageFallback(<TaskQueue />)} />
              <Route path="/quota" element={withPageFallback(<QuotaMonitor />)} />
              <Route path="/settings" element={withPageFallback(<Settings />)} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </WebsiteProvider>
  )
}

export default App
