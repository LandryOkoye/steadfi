
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell    from './components/layout/AppShell'
import Landing     from './pages/Landing'
import Dashboard   from './pages/Dashboard'
import Markets     from './pages/Markets'
import History     from './pages/History'
import { IS_MAINNET } from './lib/steadfi'

const AdminApp = lazy(() => import('./admin/AdminApp'))
// Asset pages carry the charting library; load it only when one is opened.
const AssetDetail = lazy(() => import('./pages/AssetDetail'))
// Bridge is testnet-only: not shown on mainnet.
const Bridge = lazy(() => import('./pages/Bridge'))

const ACTION_REDIRECTS = ['supply', 'borrow', 'repay', 'withdraw'] as const

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Routes>
            <Route index element={<Landing />} />
            <Route
              path="admin/*"
              element={
                <Suspense fallback={<p className="p-6 text-sm text-[var(--color-muted-foreground)]">Loading admin console…</p>}>
                  <AdminApp />
                </Suspense>
              }
            />
            <Route element={<AppShell />}>
              <Route path="dashboard"        element={<Dashboard />} />
              <Route path="markets"          element={<Markets />} />
              <Route path="markets/:symbol"  element={<Suspense fallback={<div className="skeleton h-96 w-full" />}><AssetDetail /></Suspense>} />
              <Route path="history"          element={<History />} />
              {!IS_MAINNET && (
                <Route path="bridge" element={<Suspense fallback={<div className="skeleton h-96 w-full" />}><Bridge /></Suspense>} />
              )}
              {ACTION_REDIRECTS.map(a => (
                <Route key={a} path={a} element={<Navigate to={`/dashboard?action=${a}`} replace />} />
              ))}
              <Route path="positions"        element={<Navigate to="/dashboard" replace />} />
              <Route path="*"                element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  )
}
