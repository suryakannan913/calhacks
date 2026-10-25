import { useState } from 'react'
import './login.css'
import { unlockParent } from './parentAccess'

const CHILDREN = ['Maya', 'Leo', 'Aiden', 'Priya', 'Sam']
export default function Login({ requestedParent }: { requestedParent?: string }) {
  const initial = CHILDREN.find(name => name.toLowerCase() === requestedParent?.toLowerCase())?.toLowerCase() ?? 'maya'
  const [parent, setParent] = useState(initial)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const signIn = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      if (!unlockParent(parent, password)) {
        setError('That password isn’t right. Please try again.')
        return
      }
    }
    catch { setError('Please allow session storage in this browser and try again.'); return }
    const params = new URLSearchParams(window.location.search)
    params.set('parent', parent)
    if (!requestedParent) params.delete('tab')
    window.location.assign(`/parent?${params.toString()}`)
  }

  return <main className="login-page">
    <a href="/" className="login-brand" aria-label="TapTalk home"><span className="login-mark" aria-hidden="true">t.</span>TapTalk</a>
    <header className="login-heading">
      <span className="login-eyebrow">A little hello goes a long way</span>
      <h1>Who’s joining today?</h1>
      <p>Pick your profile and make yourself at home.</p>
    </header>
    <div className="login-panels">
      <section className="login-kids" aria-labelledby="children-heading">
        <span className="login-eyebrow">For kids</span>
        <h2 id="children-heading">Ready to say hello?</h2>
        <p>Choose your name to open your picture board.</p>
        <div className="login-profiles">
          {CHILDREN.map((name, index) => <a className={`login-profile profile-${index}`} href={`/kid?child=${name.toLowerCase()}`} key={name}>
            <span className="login-avatar" aria-hidden="true">{name[0]}</span>
            <span>{name}</span><span className="login-arrow" aria-hidden="true">↗</span>
          </a>)}
        </div>
        <p className="login-note">All profiles in this demo are fictional.</p>
      </section>
      <section className="login-parent" aria-labelledby="parent-heading">
        <span className="login-lock" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg></span>
        <span className="login-eyebrow">For grown-ups</span>
        <h2 id="parent-heading">Parent space</h2>
        <p>Check in on a hangout, find friends, and tell us about your child.</p>
        {requestedParent && <p className="login-request">Enter the parent password to continue.</p>}
        <form onSubmit={signIn}>
          <label htmlFor="parent-profile">Your child</label>
          <select id="parent-profile" value={parent} onChange={event => { setParent(event.target.value); setError('') }}>
            {CHILDREN.map(name => <option key={name} value={name.toLowerCase()}>{name}</option>)}
          </select>
          <label htmlFor="parent-password">Parent password</label>
          <input id="parent-password" type="password" autoComplete="current-password" required
            value={password} onChange={event => { setPassword(event.target.value); setError('') }}
            aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
          {error && <p id="login-error" role="alert" className="login-error">{error}</p>}
          <button type="submit">Open parent space <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>
    <footer className="login-footer">Different ways to communicate. More ways to connect.</footer>
  </main>
}
