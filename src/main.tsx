import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import App from './App'
import './index.css'

const home = () => <Navigate to={'/nyc' + location.search} replace />

const router = createBrowserRouter([
  { path: '/', element: home() },
  { path: '/:city', element: <App /> },
  { path: '*', element: home() }
])

document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
