import { motion } from 'framer-motion'
import Avatar from './Avatar.tsx'
import type { Person } from '../types.ts'

export function StartGate({ me, friend, onStart }: { me: Person; friend: Person | null; onStart: () => void }) {
  return (
    <div className="gate">
      <motion.div
        className="gate-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="gate-avatars" aria-hidden>
          <Avatar name={me.name} color={me.color} size={56} />
          {friend && <Avatar name={friend.name} color={friend.color} size={56} />}
        </span>
        <h1>Hi {me.name}!</h1>
        <p>{friend ? `${friend.name} is online. Ready to hang out?` : 'Ready to hang out?'}</p>
        <motion.button className="gate-btn" onClick={onStart} whileTap={{ scale: 0.97 }}>
          Tap to start
        </motion.button>
        <p className="credit">
          Pictograms by Sergio Palao for{' '}
          <a href="https://arasaac.org" target="_blank" rel="noreferrer">
            ARASAAC
          </a>
          , Gobierno de Aragón. Licensed{' '}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-NC-SA 4.0
          </a>
          .
        </p>
      </motion.div>
    </div>
  )
}

export function PausedOverlay() {
  return (
    <motion.div
      className="paused"
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="paused-card"
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <span className="paused-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
            <rect x="5" y="4" width="4" height="14" rx="1.5" />
            <rect x="13" y="4" width="4" height="14" rx="1.5" />
          </svg>
        </span>
        <h2>Taking a break</h2>
        <p>We’ll be back soon.</p>
      </motion.div>
    </motion.div>
  )
}

/** Full-screen states before the room exists: loading, unknown child, no friend yet. */
export function Status({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>{title}</h1>
        {body && <p>{body}</p>}
        {children}
      </div>
    </div>
  )
}
