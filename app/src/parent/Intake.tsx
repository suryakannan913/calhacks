import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { IntakeProfile } from '../../convex/intakeTypes'

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  for (const text of ['Please remove contact details, links, or street addresses.',
    'Please wait a moment before trying again.', 'Claude is already answering. Please wait.',
    'This profile draft changed. Reload and review it again.', 'Use a message between 1 and 2,000 characters.']) {
    if (message.includes(text)) return text
  }
  return 'Could not finish. Your approved profile has not changed. Please retry.'
}

export default function Intake({ parentId, childId }: { parentId: Id<'parents'>; childId: Id<'children'> }) {
  const children = useQuery(api.children.list)
  const child = children?.find(c => c._id === childId)
  const session = useQuery(api.intake.get, { parentId })
  const intakeTurn = useAction(api.ai.intakeTurn)
  const restart = useMutation(api.intake.restart)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const request = useRef<{ requestId: string; message: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const pending = session?.pending
  const pendingSince = pending?.since
  const waiting = !!pending && !session?.error && now - pending.since < 90_000
  const busy = thinking || waiting

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [session?.turns.length, busy])
  useEffect(() => {
    if (pendingSince === undefined) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, pendingSince + 90_000 - Date.now()))
    return () => clearTimeout(timer)
  }, [pendingSince])

  const send = async (retry = false) => {
    if (busy) return
    const current = retry && pending
      ? { requestId: pending.requestId, message: pending.text }
      : request.current?.message === draft.trim() ? request.current
        : { requestId: crypto.randomUUID(), message: draft.trim() }
    if (!current.message) return
    request.current = current
    setThinking(true)
    setError(null)
    try {
      await intakeTurn({ parentId, ...current })
      setDraft('')
      request.current = null
    } catch (failure) { setError(friendlyError(failure)) }
    finally { setThinking(false); setNow(Date.now()) }
  }

  const startOver = async () => {
    setError(null)
    try { await restart({ parentId }); request.current = null; setDraft('') }
    catch (failure) { setError(friendlyError(failure)) }
  }

  if (!child || !session) return <div className="pv-muted">Loading intake…</div>
  const done = session.status !== 'chatting'
  return <div className="pv-intake">
    <section className="pv-card pv-chat">
      <h2>Tell Claude about {child.name}</h2>
      <p className="pv-muted">Use synthetic details only. Share interests, communication, sensory needs, and how your child likes to play. Leave out surnames, school names, addresses, and contact details.</p>
      <p className="pv-muted">Your current profile stays in use until you review and approve a replacement.</p>
      <div className="pv-bubbles" aria-live="polite" aria-busy={busy}>
        <div className="pv-bubble is-claude">What does {child.name} enjoy, and how do they usually communicate?</div>
        {session.turns.map((turn, i) => <div key={i} className={`pv-bubble is-${turn.role}`}>{turn.text}</div>)}
        {busy && <div className="pv-bubble is-claude is-typing">Claude is thinking…</div>}
        <div ref={endRef} />
      </div>
      {(error || session.error) && <div className="pv-error" role="alert">{error ?? session.error}</div>}
      {!done && !pending && <form className="pv-compose" onSubmit={event => { event.preventDefault(); void send() }}>
        <input value={draft} onChange={event => setDraft(event.target.value)} disabled={busy}
          maxLength={2000} placeholder="For example: trains, symbols, and short turns" aria-label="Message to Claude" />
        <button className="pv-btn pv-btn-primary" disabled={busy || !draft.trim()}>Send</button>
      </form>}
      {pending && !busy && <button className="pv-btn" onClick={() => void send(true)}>Retry last message</button>}
      {(session.turns.length > 0 || done) && <button className="pv-link" disabled={busy} onClick={() => void startOver()}>Start over</button>}
    </section>
    {session.draft && <ProfileReview key={session.revision} parentId={parentId} name={child.name}
      revision={session.revision} initial={session.draft} approved={session.status === 'approved'} />}
  </div>
}

function ProfileReview({ parentId, name, revision, initial, approved }: {
  parentId: Id<'parents'>; name: string; revision: number; initial: IntakeProfile; approved: boolean
}) {
  const approve = useMutation(api.intake.approve)
  const [profile, setProfile] = useState(initial)
  const [interests, setInterests] = useState(initial.interests.join(', '))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fields = [
    ['communicationStyle', 'Communication'], ['sensoryNotes', 'Sensory needs'],
    ['interactionStyle', 'Preferred interaction'], ['profileSummary', 'Profile summary'],
  ] as const
  const save = async () => {
    setSaving(true); setError(null)
    try { await approve({ parentId, revision, profile: { ...profile,
      interests: [...new Set(interests.split(',').map(s => s.trim()).filter(Boolean))] } }) }
    catch (failure) { setError(friendlyError(failure)) }
    finally { setSaving(false) }
  }
  return <section className="pv-card pv-profile">
    <div className="pv-eyebrow">{approved ? 'Profile approved and saved' : 'Draft — review before saving'}</div>
    <h2>{name}'s profile</h2>
    <p>{approved ? 'Matching will use this approved profile.' : 'Check every detail. Edit anything Claude misunderstood. Missing details can stay “Not provided”.'}</p>
    <form className="pv-profile-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <label>Interests (comma-separated)<input required value={interests} maxLength={800}
        disabled={approved || saving} onChange={event => setInterests(event.target.value)} /></label>
      {fields.map(([field, label]) => <label key={field}>{label}<textarea required maxLength={800}
        value={profile[field]} disabled={approved || saving}
        onChange={event => setProfile(p => ({ ...p, [field]: event.target.value }))} /></label>)}
      {error && <div className="pv-error" role="alert">{error}</div>}
      {!approved && <button className="pv-btn pv-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Approve and save profile'}</button>}
      {approved && <p role="status">Saved. You can now review matches.</p>}
    </form>
  </section>
}
