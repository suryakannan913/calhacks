import { useState } from 'react'
import './login.css'

const CHILDREN = ['Maya', 'Leo', 'Aiden', 'Priya', 'Sam']
export default function Login() {
  const [parent, setParent] = useState('maya')

  const openParent = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    window.location.assign(`/parent?${new URLSearchParams({ parent }).toString()}`)
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
        <span className="login-eyebrow">For grown-ups</span>
        <h2 id="parent-heading">Parent space</h2>
        <p>Check in on a hangout, find friends, and tell us about your child.</p>
        <form onSubmit={openParent}>
          <label htmlFor="parent-profile">Your child</label>
          <select id="parent-profile" value={parent} onChange={event => setParent(event.target.value)}>
            {CHILDREN.map(name => <option key={name} value={name.toLowerCase()}>{name}</option>)}
          </select>
          <button type="submit">Open parent space <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>
    <footer className="login-footer">Different ways to communicate. More ways to connect.</footer>
  </main>
}
