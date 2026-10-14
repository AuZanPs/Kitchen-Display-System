import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Link } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { DevKeyGate } from './dev-key-gate'
import { TvPage } from './tv/tv-page'
import { WaiterPage } from './waiter/waiter-page'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <nav className="home">
        <Link to="/waiter">Waiter</Link>
        <Link to="/tv">Kitchen TV</Link>
      </nav>
    ),
  },
  { path: '/waiter', element: <WaiterPage /> },
  { path: '/tv', element: <TvPage /> },
])

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <DevKeyGate>
      <RouterProvider router={router} />
    </DevKeyGate>
  </StrictMode>,
)
