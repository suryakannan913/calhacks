// Match approval: Claude's reason + watch-outs, live status of both parents.
// matches.approve is transactional: the room opens only once BOTH have approved.
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const ORDER: Record<string, number> = {
  proposed: 0, approvedA: 0, approvedB: 0, open: 1, declined: 2,
}

export default function Matches({
  parentId,
  onGoToMonitor,
}: {
  parentId: Id<'parents'>
  onGoToMonitor: () => void
}) {
  const matches = useQuery(api.matches.listForParent, { parentId })
  const approve = useMutation(api.matches.approve)
  const decline = useMutation(api.matches.decline)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeclined, setShowDeclined] = useState(false)

  if (matches === undefined) return <div className="pv-muted">Loading…</div>

  const run = async (matchId: Id<'matches'>, fn: typeof approve) => {
    setError(null)
    setBusyId(matchId)
    try {
      await fn({ matchId, parentId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const sorted = [...matches].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const active = sorted.filter((m) => m.status !== 'declined')
  const declined = sorted.filter((m) => m.status === 'declined')

  return (
    <div className="pv-matches">
      <p className="pv-muted">
        Claude suggests friends based on shared interests and how each child communicates.
        Nothing opens until <strong>both</strong> parents approve.
      </p>
      {error && <div className="pv-error">{error}</div>}
      {active.length === 0 && <div className="pv-card pv-empty">No match suggestions yet.</div>}

      {active.map((m) => {
        const isOpen = m.status === 'open'
        return (
          <article key={m._id} className={`pv-card pv-match ${isOpen ? 'is-open' : ''}`}>
            <header className="pv-match-head">
              <div>
                <h2>
                  {m.other?.name ?? 'Unknown'}
                  {m.other && <span className="pv-age">, {m.other.age}</span>}
                </h2>
                <div className="pv-symbols">
                  {m.other?.interests.map((i) => (
                    <span key={i} className="pv-chip">{i}</span>
                  ))}
                </div>
              </div>
              <div className="pv-score" title="Claude's match score">
                {Math.round(m.score * 100)}%<small>match</small>
              </div>
            </header>

            {m.other?.profileSummary && <p>{m.other.profileSummary}</p>}

            <div className="pv-reason">
              <div className="pv-eyebrow">Why Claude suggested this</div>
              <p>{m.reason}</p>
            </div>
            {m.watchOuts && (
              <div className="pv-watch">
                <div className="pv-eyebrow">Things to watch for</div>
                <p>{m.watchOuts}</p>
              </div>
            )}

            <div className="pv-approvals">
              <Approval label="You" ok={m.myApproval || isOpen} />
              <Approval label={`${m.other?.name ?? 'Other'}'s parent`} ok={m.otherApproval || isOpen} />
            </div>

            <div className="pv-actions">
              {isOpen ? (
                <button className="pv-btn pv-btn-primary" onClick={onGoToMonitor}>
                  Hangout is open → Watch live
                </button>
              ) : (
                <>
                  <button
                    className="pv-btn pv-btn-primary"
                    disabled={m.myApproval || busyId === m._id}
                    onClick={() => run(m._id, approve)}
                  >
                    {m.myApproval ? 'Approved, waiting for other parent' : 'Approve match'}
                  </button>
                  <button
                    className="pv-btn pv-btn-ghost"
                    disabled={busyId === m._id}
                    onClick={() => {
                      if (confirm(`Decline the match with ${m.other?.name ?? 'this child'}?`)) {
                        void run(m._id, decline)
                      }
                    }}
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          </article>
        )
      })}

      {declined.length > 0 && (
        <div>
          <button className="pv-link" onClick={() => setShowDeclined((s) => !s)}>
            {showDeclined ? 'Hide' : 'Show'} declined ({declined.length})
          </button>
          {showDeclined &&
            declined.map((m) => (
              <div key={m._id} className="pv-card pv-declined">
                {m.other?.name ?? 'Unknown'}: declined
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function Approval({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`pv-approval ${ok ? 'is-ok' : ''}`}>
      <span aria-hidden>{ok ? '✓' : '…'}</span> {label}: {ok ? 'approved' : 'waiting'}
    </div>
  )
}
