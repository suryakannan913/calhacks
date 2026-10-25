// Live monitor: transcript of the open room + a big Pause/Resume button.
// Pause patches rooms.status; the kid view greys out from the same live query.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { wordByLabel } from '../kid/words.ts'

const STATUS_LABEL: Record<string, string> = {
  drafting: 'Writing…',
  draft: 'Waiting for child to confirm',
  confirmed: 'Confirmed, safety check',
  spoken: 'Spoken',
  flagged: 'Stopped by safety check',
  rejected: 'Child said no',
}

export default function Monitor({
  parentId,
  onGoToMatches,
}: {
  parentId: Id<'parents'>
  onGoToMatches: () => void
}) {
  const matches = useQuery(api.matches.listForParent, { parentId })
  const openMatch = matches?.find((m) => m.status === 'open' && m.roomId)
  const roomId = openMatch?.roomId ?? null

  const room = useQuery(api.rooms.get, roomId ? { roomId } : 'skip')
  const messages = useQuery(api.messages.listByRoom, roomId ? { roomId } : 'skip')
  const children = useQuery(api.children.list)
  const pause = useMutation(api.rooms.pause)
  const resume = useMutation(api.rooms.resume)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Re-scroll on new rows AND when the last row changes status (it grows as text arrives).
  const listRef = useRef<HTMLElement>(null)
  const last = messages?.at(-1)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages?.length, last?.status])

  if (matches === undefined) return <div className="pv-muted">Loading…</div>
  if (!openMatch || !roomId) {
    return (
      <section className="pv-card pv-empty">
        <h2>No open hangout yet</h2>
        <p>A hangout opens once you and the other parent both approve a match.</p>
        <button className="pv-btn" onClick={onGoToMatches}>See matches</button>
      </section>
    )
  }

  const nameOf = (id: Id<'children'>) =>
    children?.find((c) => c._id === id)?.name ?? '…'
  const paused = room?.status === 'paused'
  const closed = room?.status === 'closed'

  const toggle = async () => {
    setError(null)
    setBusy(true)
    try {
      if (paused) await resume({ roomId })
      else await pause({ roomId, parentId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pv-monitor">
      <section className={`pv-card pv-control ${paused ? 'is-paused' : ''}`}>
        <div>
          <div className="pv-eyebrow">Hangout with {openMatch.other?.name ?? '…'}</div>
          <span className={`pv-pill pv-pill-${room?.status ?? 'loading'}`}>
            {room === undefined ? 'Loading' : paused ? 'Paused' : closed ? 'Closed' : 'Live'}
          </span>
          {paused && <p className="pv-muted">Both kids' screens are paused.</p>}
        </div>
        <button
          className={`pv-pause ${paused ? 'is-resume' : ''}`}
          onClick={toggle}
          disabled={busy || closed || room === undefined}
        >
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
      </section>
      {error && <div className="pv-error">{error}</div>}

      <section ref={listRef} className="pv-card pv-transcript" aria-live="polite">
        <h2>Live transcript</h2>
        {messages === undefined && <div className="pv-muted">Loading…</div>}
        {messages?.length === 0 && <div className="pv-muted">No messages yet.</div>}
        <ol className="pv-msgs">
          {messages?.map((m) => (
            <li key={m._id} className={`pv-msg pv-msg-${m.status}`}>
              <div className="pv-msg-head">
                <strong>{nameOf(m.senderChildId)}</strong>
                <span className={`pv-badge pv-badge-${m.status}`}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
                <time className="pv-time">
                  {new Date(m._creationTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              <div className="pv-symbols">
                {m.symbols.map((s, i) => {
                  // Any vocabulary word shows its pictogram; an unknown label still shows as text.
                  const word = wordByLabel.get(s.toLowerCase())
                  return (
                    <span key={i} className="pv-chip pv-chip-sym">
                      {word && <img src={word.image} alt="" width={20} height={20} />}
                      {s}
                    </span>
                  )
                })}
              </div>
              <div className="pv-text">
                {m.finalText ?? m.draftText ?? '…'}
                {m.audioUrl && (
                  <button
                    className="pv-play"
                    aria-label="Replay audio"
                    onClick={() => void new Audio(m.audioUrl!).play()}
                  >
                    ▶
                  </button>
                )}
              </div>
              {m.status === 'flagged' && m.moderationNote && (
                <div className="pv-flag">Why it was stopped: {m.moderationNote}</div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
