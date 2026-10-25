import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Avatar from './Avatar.tsx'
import Pictogram from './Pictogram.tsx'
import { Back, Replay, Speaker, SpeakerOff } from './icons.tsx'
import { wordByLabel } from '../words.ts'
import type { FeedMessage, Person } from '../types.ts'

type Props = {
  friend: Person | null
  messages: FeedMessage[]
  speakingId: string | null
  typing: boolean
  soundOn: boolean
  paused: boolean
  canReplay: boolean
  onToggleSound: () => void
  onReplay: () => void
  onBack: () => void
}

const GAP_MS = 10 * 60_000
const clock = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })

export default function Conversation({
  friend,
  messages,
  speakingId,
  typing,
  soundOn,
  paused,
  canReplay,
  onToggleSound,
  onReplay,
  onBack,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const friendName = friend?.name ?? 'Your friend'
  const friendColor = friend?.color ?? '#6b7280'
  // Until the friend has said something we only know "your friend", so show a neutral "?" avatar.
  const avatarName = friend?.name ?? '?'

  // Keep the newest message (or the typing bubble) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, typing])

  return (
    <section className="panel chat" aria-label={`Conversation with ${friendName}`}>
      <header className="chat-head">
        <button className="icon-btn back" onClick={onBack} aria-label="Back to board">
          <Back />
        </button>
        <Avatar name={avatarName} color={friendColor} size={38} online={!paused} />
        <div className="chat-who">
          <h2>{friendName}</h2>
          <span className="chat-status">{paused ? 'Taking a break' : 'Active now'}</span>
        </div>
        <div className="chat-controls">
          <button
            className="icon-btn"
            onClick={onReplay}
            disabled={!soundOn || !canReplay}
            aria-label={`Replay ${friendName}'s last message`}
            title="Replay"
          >
            <Replay />
          </button>
          <button
            className="icon-btn"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
            title="Sound"
          >
            {soundOn ? <Speaker /> : <SpeakerOff />}
          </button>
        </div>
      </header>

      <div className="messages" role="log" aria-live="polite">
        {messages.length === 0 && !typing && (
          <p className="empty-chat">Say hi to {friend?.name ?? 'your friend'}! Tap a picture to start.</p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const next = messages[i + 1]
            const startsGroup = !prev || prev.mine !== m.mine || m.time - prev.time > GAP_MS
            const endsGroup = !next || next.mine !== m.mine || next.time - m.time > GAP_MS
            const showTime = !prev || m.time - prev.time > GAP_MS
            const speaking = !m.mine && soundOn && speakingId === m.id

            return (
              <motion.div
                key={m.id}
                layout="position"
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: m.state === 'pending' ? 0.7 : 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className={`row ${m.mine ? 'mine' : 'theirs'} ${startsGroup ? 'gap-top' : ''}`}
              >
                {showTime && (
                  <div className="stamp">
                    {!prev ? `Today ${clock.format(m.time)}` : clock.format(m.time)}
                  </div>
                )}
                <div className="line">
                  {!m.mine && (
                    <span className="av-slot">
                      {endsGroup && <Avatar name={avatarName} color={friendColor} size={26} />}
                    </span>
                  )}
                  <div
                    className={`bubble ${!startsGroup ? 'cont' : ''} ${!endsGroup ? 'more' : ''} ${
                      speaking ? 'is-speaking' : ''
                    } ${m.state === 'flagged' ? 'is-flagged' : ''}`}
                  >
                    <span className="b-symbols" aria-hidden>
                      {m.symbols.map((label, k) => {
                        const w = wordByLabel.get(label.toLowerCase())
                        return w ? <Pictogram key={k} src={w.image} size={26} className="mini" /> : null
                      })}
                    </span>
                    <span className="b-text">{m.text}</span>
                    {m.state === 'flagged' && <span className="b-note">Not sent</span>}
                    {speaking && (
                      <span className="bars" aria-label="Speaking">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}

          {typing && (
            <motion.div
              key="typing"
              className="row theirs gap-top"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
            >
              <div className="line">
                <span className="av-slot">
                  <Avatar name={avatarName} color={friendColor} size={26} />
                </span>
                <div className="bubble typing" aria-label={`${friendName} is typing`}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </section>
  )
}
