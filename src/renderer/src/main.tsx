import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import App from './App'
import { AppShell } from './layouts/AppShell'
import { HomePage } from './pages/HomePage'
import { ToolPage } from './pages/ToolPage'
import './styles/globals.css'

// The data router preserves existing hash URLs and supports unsaved-change blockers.
const router = createHashRouter([
  {
    element: <App />,
    children: [{
      element: <AppShell />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'tool/:toolId', element: <ToolPage /> },
        { path: '*', element: <Navigate to="/" replace /> }
      ]
    }]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
