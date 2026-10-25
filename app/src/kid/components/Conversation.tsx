import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Avatar from './Avatar.tsx'
import { Back, Moon, Replay, Speaker, SpeakerOff, Sun } from './icons.tsx'
import type { FeedMessage, Person } from '../types.ts'

type Props = {
  friend: Person | null
  messages: FeedMessage[]
  speakingId: string | null
  typing: boolean
  soundOn: boolean
  paused: boolean
  canReplay: boolean
  theme: 'light' | 'dark'
  onToggleSound: () => void
  onToggleTheme: () => void
  onReplay: () => void
  onBack: () => void
}

const GAP_MS = 10 * 60_000
const DAY_MS = 86_400_000
const clock = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat([], { weekday: 'long' })
const dateOnly = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' })

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)

// "Today", "Yesterday", a weekday for the last week, otherwise the date, like Messages.
function dayLabel(t: number) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(t)) / DAY_MS)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return diff < 7 ? weekday.format(t) : dateOnly.format(t)
}

export default function Conversation({
  friend,
  messages,
  speakingId,
  typing,
  soundOn,
  paused,
  canReplay,
  theme,
  onToggleSound,
  onToggleTheme,
  onReplay,
  onBack,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const friendName = friend?.name ?? 'Your friend'
  const friendColor = friend?.color ?? '#8e8e93'
  // A neutral avatar is only needed if the matched profile is unavailable.
  const avatarName = friend?.name ?? '?'

  // Keep the newest message (or the typing bubble) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, typing])

  // Like Messages, delivery status sits under the last message *I* sent. "Read" once the friend has answered.
  const lastMineIndex = messages.findLastIndex((m) => m.mine)
  const lastMine = messages[lastMineIndex]
  const read = lastMineIndex >= 0 && messages.slice(lastMineIndex + 1).some((m) => !m.mine)

  return (
    <section className="panel chat" aria-label={`Conversation with ${friendName}`}>
      <header className="chat-head">
        <div className="chat-left">
          <button className="icon-btn back" onClick={onBack} aria-label="Back to board">
            <Back size={24} />
          </button>
        </div>
        <div className="chat-who">
          <Avatar name={avatarName} color={friendColor} size={34} />
          <h2>{friendName}</h2>
          {paused && <span className="chat-status">Taking a break</span>}
        </div>
        <div className="chat-controls">
          <button
            className="icon-btn"
            onClick={onReplay}
            disabled={!soundOn || !canReplay}
            aria-label={`Replay ${friendName}'s last message`}
            title="Replay"
          >
            <Replay size={20} />
          </button>
          <button
            className="icon-btn"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
            title="Sound"
          >
            {soundOn ? <Speaker size={20} /> : <SpeakerOff size={20} />}
          </button>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <div className="messages" role="log" aria-live="polite">
        {messages.length === 0 && !typing && (
          <div className="empty-chat">
            <Avatar name={avatarName} color={friendColor} size={80} />
            <p>Ready to talk with {friend?.name ?? 'your friend'}?</p>
            <span>Tap a picture on the left to send your first message!</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const next = messages[i + 1]
            const startsGroup = !prev || prev.mine !== m.mine || m.time - prev.time > GAP_MS
            const endsGroup = !next || next.mine !== m.mine || next.time - m.time > GAP_MS
            const showTime = !prev || m.time - prev.time > GAP_MS
            const newDay = !prev || startOfDay(prev.time) !== startOfDay(m.time)
            const speaking = !m.mine && soundOn && speakingId === m.id

            return (
              <motion.div
                key={m.id}
                layout="position"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                className={`row ${m.mine ? 'mine' : 'theirs'} ${startsGroup ? 'gap-top' : ''}`}
              >
                {showTime && (
                  <div className="stamp">
                    {newDay && <b>{dayLabel(m.time)} </b>}
                    {clock.format(m.time)}
                  </div>
                )}
                <div className="line">
                  <div
                    className={`bubble ${endsGroup ? 'tail' : ''} ${speaking ? 'is-speaking' : ''}`}
                  >
                    <span className="b-text">{m.text}</span>
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
                {m === lastMine && m.state === 'sent' && (
                  <div className="receipt">{read ? 'Read' : 'Delivered'}</div>
                )}
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
                <div className="bubble typing tail" aria-label={`${friendName} is typing`}>
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
