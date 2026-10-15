import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { AdminPage } from './admin/admin-page'
import { EnrollPage } from './enroll/enroll-page'
import { I18nProvider } from './i18n'
import { KitchenPage } from './kitchen/kitchen-page'
import { HOME_BY_ROLE, useSession } from './lib/session'
import { TvPage } from './tv/tv-page'
import { WaiterPage } from './waiter/waiter-page'

/** Sends each device to its own screen; unpaired browsers go to pairing. */
function Home() {
  const { state } = useSession()
  if (state.status === 'loading') return null
  if (state.status === 'ok') {
    return <Navigate to={HOME_BY_ROLE[state.session.role]} replace />
  }
  return <Navigate to="/enroll" replace />
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/enroll', element: <EnrollPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '/waiter', element: <WaiterPage /> },
  { path: '/kitchen', element: <KitchenPage /> },
  { path: '/tv', element: <TvPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>,
)
