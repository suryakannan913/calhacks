import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'

const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const root = createRoot(document.getElementById('root')!)

if (!url) {
  // .env.local is written by `npx convex dev` (use your own personal deployment).
  root.render(
    <p style={{ padding: 24 }}>
      Missing VITE_CONVEX_URL. Run <code>npx convex dev</code> in app/ first.
    </p>,
  )
} else {
  const convex = new ConvexReactClient(url)
  root.render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </StrictMode>,
  )
}
