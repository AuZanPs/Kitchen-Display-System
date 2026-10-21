import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { AdminPage } from './admin/admin-page'
import { EnrollPage } from './enroll/enroll-page'
import { I18nProvider } from './i18n'
import { KitchenPage } from './kitchen/kitchen-page'
import { CenterNote, HOME_BY_ROLE, usePlace, useSession } from './lib/session'
import { CrashScreen, NotFound, Shell } from './shell'
import { SiteHome } from './site/home'
import { AccountPage, SignInPage } from './site/site-pages'
import { SuperPage } from './super/super-page'
import { TvPage } from './tv/tv-page'
import { WaiterPage } from './waiter/waiter-page'

/** The site's front page, the console, or (on a dapur) each device's own screen. */
function Home() {
  const place = usePlace()
  if (place === null) return null
  if (place === 'site') return <SiteHome />
  if (place === 'console') return <Navigate to="/super" replace />
  return <VenueHome />
}

/** Sends each device to its own screen; unpaired browsers go to pairing. */
function VenueHome() {
  const { state } = useSession()
  if (state.status === 'loading') return null
  if (state.status === 'closed') return <CenterNote>{state.message}</CenterNote>
  if (state.status === 'ok') {
    return <Navigate to={HOME_BY_ROLE[state.session.role]} replace />
  }
  return <Navigate to="/enroll" replace />
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: <CrashScreen />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/enroll', element: <EnrollPage /> },
      { path: '/admin', element: <AdminPage /> },
      { path: '/waiter', element: <WaiterPage /> },
      { path: '/kitchen', element: <KitchenPage /> },
      { path: '/tv', element: <TvPage /> },
      { path: '/super', element: <SuperPage /> },
      { path: '/masuk', element: <SignInPage /> },
      { path: '/akun', element: <AccountPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
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
