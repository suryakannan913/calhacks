import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CATEGORIES, WORDS } from '../vocabulary.ts'
import { categoryById, coreBarWords, wordsInCategory, type Word } from '../words.ts'
import type { Suggestion } from '../suggestions.ts'
import type { Person } from '../types.ts'
import Avatar from './Avatar.tsx'
import Pictogram from './Pictogram.tsx'
import { Back, Check, Cross, Send, Undo } from './icons.tsx'

export type ComposeStatus = 'idle' | 'thinking' | 'draft'

type Props = {
  me: Person
  friend: Person | null
  strip: Word[]
  maxWords: number
  /** The child's quick-access words (children.symbolSet), shown under "My words". */
  favorites: Word[]
  locked: boolean
  status: ComposeStatus
  draft: string | null
  notice: string | null
  suggestion: Suggestion | null
  onPick: (w: Word) => void
  onRemove: (index: number) => void
  onUndo: () => void
  onClear: () => void
  onSend: () => void
  onConfirm: () => void
  onReject: () => void
  onDismissNotice: () => void
}

const MAIN = 'core'
const MINE = { id: 'mine', name: 'My words', short: 'My words', color: '#e879f9', icon: '/symbols/heart.png' }

function Tile({
  word,
  count,
  disabled,
  onPick,
  compact,
}: {
  word: Word
  count: number
  disabled: boolean
  onPick: (w: Word) => void
  compact?: boolean
}) {
  return (
    <motion.button
      className={`tile ${compact ? 'compact' : ''} ${count > 0 ? 'is-selected' : ''}`}
      disabled={disabled}
      aria-pressed={count > 0}
      onClick={() => onPick(word)}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
    >
      <Pictogram src={word.image} size={compact ? 32 : 46} />
      <span className="tile-label">{word.label}</span>
      {count > 0 && <span className="tile-badge">{count}</span>}
    </motion.button>
  )
}

export default function Board({
  me,
  friend,
  strip,
  maxWords,
  favorites,
  locked,
  status,
  draft,
  notice,
  suggestion,
  onPick,
  onRemove,
  onUndo,
  onClear,
  onSend,
  onConfirm,
  onReject,
  onDismissNotice,
}: Props) {
  const [categoryId, setCategoryId] = useState(MAIN)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const categories = favorites.length > 0 ? [MINE, ...CATEGORIES] : CATEGORIES
  const category = categoryId === MINE.id ? MINE : categoryById.get(categoryId)!
  const words = categoryId === MINE.id ? favorites : wordsInCategory(categoryId)
  const full = strip.length >= maxWords

  const counts = new Map<string, number>()
  strip.forEach((w) => counts.set(w.id, (counts.get(w.id) ?? 0) + 1))

  // Warm the image cache so switching categories never waits on the network.
  useEffect(() => {
    const t = window.setTimeout(() => WORDS.forEach((w) => (new Image().src = w.image)), 200)
    return () => window.clearTimeout(t)
  }, [])

  const openCategory = (id: string) => {
    setCategoryId(id)
    gridRef.current?.scrollTo({ top: 0 })
  }

  const showSuggestion = suggestion && dismissed !== suggestion.topic.id && status === 'idle'
  const canSend = !locked && strip.length > 0
  const tileProps = (w: Word) => ({
    word: w,
    count: counts.get(w.id) ?? 0,
    disabled: locked || full,
    onPick,
  })

  return (
    <section className="panel board" aria-label="Communication board">
      <header className="board-head">
        <span className="logo" aria-hidden>
          T
        </span>
        <div className="board-title">
          <h1>TapTalk</h1>
          <span>Tap pictures to talk to {friend?.name ?? 'your friend'}</span>
        </div>
        <Avatar name={me.name} color={me.color} size={32} />
      </header>

      {/* Permanent core words: fixed order and position, regardless of category */}
      <div className="core" role="group" aria-label="Core words">
        {coreBarWords.map((w) => (
          <Tile key={w.id} {...tileProps(w)} compact />
        ))}
      </div>

      <nav className="cats" role="tablist" aria-label="Word categories">
        {categories.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === categoryId}
            className={`cat ${c.id === categoryId ? 'on' : ''}`}
            style={{ ['--cat' as string]: c.color }}
            onClick={() => openCategory(c.id)}
          >
            <img src={c.icon} width={22} height={22} alt="" draggable={false} />
            <span>{c.short}</span>
          </button>
        ))}
      </nav>

      <div
        className="grid-wrap"
        ref={gridRef}
        role="tabpanel"
        aria-label={category.name}
        style={{ ['--cat' as string]: category.color }}
      >
        <div className="grid-head">
          {categoryId !== MAIN && (
            <button className="back-main" onClick={() => openCategory(MAIN)}>
              <Back size={16} /> Main words
            </button>
          )}
          <h2>{category.name}</h2>
          <span>{words.length} words</span>
        </div>
        <div className="tiles">
          {words.map((w) => (
            <Tile key={w.id} {...tileProps(w)} />
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            key="notice"
            className="notice"
            role="status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span>{notice}</span>
            <button className="icon-mini" onClick={onDismissNotice} aria-label="Dismiss">
              <Cross size={13} />
            </button>
          </motion.div>
        )}
        {showSuggestion && (
          <motion.div
            key="suggest"
            className="suggest"
            role="group"
            aria-label={`Suggested words about ${suggestion.topic.label}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="suggest-top">
              <span>
                Ideas about <b>{suggestion.topic.label}</b>
              </span>
              <button className="icon-mini" onClick={() => setDismissed(suggestion.topic.id)} aria-label="Hide suggestions">
                <Cross size={13} />
              </button>
            </div>
            <div className="suggest-chips">
              {suggestion.words.map((w) => (
                <button
                  key={w.id}
                  className="s-chip"
                  disabled={locked || full}
                  onClick={() => onPick(w)}
                >
                  <Pictogram src={w.image} size={22} />
                  {w.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="composer">
        <AnimatePresence mode="wait" initial={false}>
          {status === 'draft' && draft ? (
            <motion.div key="draft" className="draft" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <span className="eyebrow">Is this what you want to say?</span>
              <p className="draft-text">“{draft}”</p>
              <div className="yn-row">
                <motion.button className="yn yes" onClick={onConfirm} whileTap={{ scale: 0.97 }}>
                  <Check /> Yes
                </motion.button>
                <motion.button className="yn no" onClick={onReject} whileTap={{ scale: 0.97 }}>
                  <Cross /> No
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="builder" className="builder" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="strip" aria-label="Your message" aria-live="polite">
                {strip.length === 0 && <span className="strip-empty">Tap pictures to build a message…</span>}
                <AnimatePresence initial={false}>
                  {strip.map((w, i) => (
                    <motion.button
                      key={`${w.id}-${i}`}
                      layout
                      className="chip"
                      disabled={locked}
                      onClick={() => onRemove(i)}
                      aria-label={`Remove ${w.label}`}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                    >
                      <Pictogram src={w.image} size={22} />
                      {w.label}
                    </motion.button>
                  ))}
                </AnimatePresence>
                {strip.length > 0 && (
                  <span className="strip-tail">
                    <span className={`strip-count ${full ? 'is-full' : ''}`}>
                      {strip.length}/{maxWords}
                    </span>
                    <button className="clear" onClick={onClear} disabled={locked}>
                      Clear
                    </button>
                  </span>
                )}
              </div>
              <button className="undo" onClick={onUndo} disabled={locked || strip.length === 0} aria-label="Undo last word" title="Undo">
                <Undo />
              </button>
              <motion.button className="send" onClick={onSend} disabled={!canSend} whileTap={{ scale: 0.95 }} aria-label="Speak and send">
                {status === 'thinking' ? <span className="spinner" aria-hidden /> : <Send />}
                <span className="send-label">{status === 'thinking' ? 'Thinking…' : 'Speak & Send'}</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </section>
  )
}
