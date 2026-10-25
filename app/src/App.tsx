import KidView from './kid/KidView.tsx'
import ParentView from './parent/ParentView.tsx'
import Login from './login/Login.tsx'
import { parentIsUnlocked } from './login/parentAccess'

function App() {
  const path = window.location.pathname
  if (path.startsWith('/kid')) return <KidView />
  if (path.startsWith('/parent')) {
    const parent = new URLSearchParams(window.location.search).get('parent') ?? 'maya'
    if (!parentIsUnlocked(parent)) return <Login requestedParent={parent} />
    return <ParentView />
  }
  return <Login />
}
export default App
