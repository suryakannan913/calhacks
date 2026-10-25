// Parent view (Person D). Route: /parent?parent=maya[&tab=monitor|matches|intake]
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import Monitor from './Monitor.tsx'
import Matches from './Matches.tsx'
import Intake from './Intake.tsx'
import './parent.css'
import { lockParent } from '../login/parentAccess'

const TABS = [
  { id: 'monitor', label: 'Live hangout' },
  { id: 'matches', label: 'Matches' },
  { id: 'intake', label: 'About my child' },
] as const
export type TabId = (typeof TABS)[number]['id']

function readTab(): TabId {
  const t = new URLSearchParams(window.location.search).get('tab')
  return TABS.some((x) => x.id === t) ? (t as TabId) : 'monitor'
}

export default function ParentView() {
  // ?parent=maya resolves to the seeded displayName "Maya's parent".
  const slug = new URLSearchParams(window.location.search).get('parent') ?? ''
  const parent = useQuery(
    api.children.parentByName,
    slug ? { name: `${slug}'s parent` } : 'skip',
  )
  const [tab, setTabState] = useState<TabId>(readTab)

  const setTab = (t: TabId) => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', t)
    window.history.replaceState(null, '', `?${params}`)
    setTabState(t)
  }

  if (!slug) {
    return <div className="pv-center">Add <code>?parent=maya</code> to the URL.</div>
  }
  if (parent === undefined) return <div className="pv-center">Loading…</div>
  if (parent === null) {
    return <div className="pv-center">No parent found for “{slug}”. Try running seed:reset.</div>
  }

  return (
    <div className="pv">
      <header className="pv-header">
        <div>
          <div className="pv-eyebrow">Parent view</div>
          <h1 className="pv-title">{parent.displayName}</h1>
        </div>
        <button className="pv-btn" onClick={lockParent}>Lock and switch profile</button>
        <nav className="pv-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`pv-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="pv-main">
        {tab === 'monitor' && <Monitor parentId={parent._id} onGoToMatches={() => setTab('matches')} />}
        {tab === 'matches' && <Matches parentId={parent._id} onGoToMonitor={() => setTab('monitor')} />}
        {tab === 'intake' && <Intake key={parent._id} parentId={parent._id} childId={parent.childId} />}
      </main>
    </div>
  )
}
