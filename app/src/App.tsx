import KidView from './kid/KidView.tsx'
import ParentView from './parent/ParentView.tsx'
import Login from './login/Login.tsx'

function App() {
  const path = window.location.pathname
  if (path.startsWith('/kid')) return <KidView />
  if (path.startsWith('/parent')) return <ParentView />
  return <Login />
}
export default App
