import { lazy, Suspense, useState } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import AuthPage from './pages/AuthPage'
import Setup from './pages/Setup'
import Join from './pages/Join'
import ResetPassword from './pages/ResetPassword'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { reloadOnce } from './lib/reload'
import { useThemeMode } from './lib/theme'
import { Toaster } from 'sonner'

// Each page is downloaded only when someone opens it, so the app starts fast on slow connections
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sales = lazy(() => import('./pages/Sales'))
const Customers = lazy(() => import('./pages/Customers'))
const Items = lazy(() => import('./pages/Items'))
const Stock = lazy(() => import('./pages/Stock'))
const Materials = lazy(() => import('./pages/Materials'))
const Money = lazy(() => import('./pages/Money'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Settings = lazy(() => import('./pages/Settings'))
const Team = lazy(() => import('./pages/Team'))

function PageLoading() {
  return <p className="py-10 text-center text-ink/65">Loading...</p>
}

function Shell() {
  const [page, setPage] = useState('home')
  const { hasModule, profile } = useAuth()

  // If a module gets switched off while its page is open, fall back to Home
  const blocked =
    (page === 'stock' && !hasModule('inventory')) ||
    (page === 'money' && !hasModule('money')) ||
    (page === 'materials' && !hasModule('costing')) ||
    (page === 'customers' && !hasModule('customers')) ||
    (page === 'analytics' && !hasModule('analytics')) ||
    (page === 'team' && profile?.role !== 'owner')
  const current = blocked ? 'home' : page

  return (
    <Layout page={current} setPage={setPage}>
      <Suspense fallback={<PageLoading />}>
        {current === 'home' && <Dashboard go={setPage} />}
        {current === 'sales' && <Sales />}
        {current === 'customers' && <Customers />}
        {current === 'items' && <Items go={setPage} />}
        {current === 'stock' && <Stock />}
        {current === 'materials' && <Materials />}
        {current === 'money' && <Money />}
        {current === 'analytics' && <Analytics />}
        {current === 'settings' && <Settings />}
        {current === 'team' && <Team />}
      </Suspense>
    </Layout>
  )
}

function Gate() {
  const { session, business, loading, recovery, invites } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-ink">
        Loading...
      </div>
    )
  }
  if (recovery) return <ResetPassword />
  if (!session) return <AuthPage />
  if (!business) return invites.length > 0 ? <Join /> : <Setup />

  // key makes the whole app reload fresh data when you switch business
  return <Shell key={business.id} />
}

// If a page file can't be fetched (usually because the app was just updated), reload once
window.addEventListener('vite:preloadError', () => reloadOnce())

export default function App() {
  const { resolved } = useThemeMode()
  return (
    <ErrorBoundary>
    <AuthProvider>
      <Gate />
      <Toaster
        theme={resolved}
        position="top-center"
        mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: 12, right: 12 }}
        toastOptions={{ style: { borderRadius: '14px' } }}
      />
    </AuthProvider>
    </ErrorBoundary>
  )
}
