// Kid screen: pictogram board + live chat with the matched friend.
// Reads/writes through the existing Convex functions (children, rooms, messages); no backend changes.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/inter'
import './kid.css'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import Board, { type ComposeStatus } from './components/Board.tsx'
import Conversation from './components/Conversation.tsx'
import { PausedOverlay, StartGate, Status } from './components/Overlays.tsx'
import { Chat, Grid } from './components/icons.tsx'
import { useRoomAudio } from './hooks/useRoomAudio.ts'
import { colorFor } from './colors.ts'
import { suggestFor } from './suggestions.ts'
import type { FeedMessage, Person } from './types.ts'
import { favoritesFor, type Word } from './words.ts'

// messages.sendSymbols accepts 1 to 6 symbols.
const MAX_WORDS = 6

export default function KidView() {
  const childName = new URLSearchParams(window.location.search).get('child')

  // Scope the page-level look (black background, full height) to this screen only.
  useEffect(() => {
    document.documentElement.classList.add('kid-html')
    document.body.classList.add('kid-body')
    return () => {
      document.documentElement.classList.remove('kid-html')
      document.body.classList.remove('kid-body')
    }
  }, [])

  const child = useQuery(api.children.getByName, childName ? { name: childName } : 'skip')
  const room = useQuery(api.rooms.forChild, child ? { childId: child._id } : 'skip')

  if (!childName) {
    return (
      <Shell>
        <Status title="Who is playing?" body="Open this page as /kid?child=maya or /kid?child=leo." />
      </Shell>
    )
  }
  if (child === undefined) return <Shell><Status title="Loading…" /></Shell>
  if (child === null) {
    return (
      <Shell>
        <Status title="Hmm, who is that?" body={`We couldn't find a child called “${childName}”.`}>
          <a className="gate-btn" href="/">Back</a>
        </Status>
      </Shell>
    )
  }
  if (room === undefined) return <Shell><Status title="Loading…" /></Shell>
  if (room === null) {
    return (
      <Shell>
        <Status
          title={`Hi ${child.name}!`}
          body="Your grown-up needs to say yes to a friend first. Then your room will open here."
        />
      </Shell>
    )
  }

  return <Room child={child} roomId={room._id} paused={room.status === 'paused'} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="kid-app">{children}</div>
}

type Child = NonNullable<ReturnType<typeof useQuery<typeof api.children.getByName>>>

function Room({ child, roomId, paused }: { child: Child; roomId: Id<'rooms'>; paused: boolean }) {
  const messages = useQuery(api.messages.listByRoom, { roomId })
  const allChildren = useQuery(api.children.list)
  const sendSymbols = useMutation(api.messages.sendSymbols)
  const confirm = useMutation(api.messages.confirm)
  const reject = useMutation(api.messages.reject)

  const [started, setStarted] = useState(false)
  const [tab, setTab] = useState<'board' | 'chat'>('board')
  const [strip, setStrip] = useState<Word[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sentId, setSentId] = useState<Id<'messages'> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const me: Person = { name: child.name, color: colorFor(child.name) }

  // The friend is whoever else has spoken in this room. Only their name is used.
  const friendId = messages?.find((m) => m.senderChildId !== child._id)?.senderChildId
  const friendName = allChildren?.find((c) => c._id === friendId)?.name
  const friend: Person | null = friendName ? { name: friendName, color: colorFor(friendName) } : null

  const audio = useRoomAudio({
    messages: messages?.map((m) => ({
      id: m._id,
      senderId: m.senderChildId,
      status: m.status,
      audioUrl: m.audioUrl,
    })),
    meId: child._id,
    soundOn,
    paused,
  })

  // The child's one unfinished message, if any: still being written, or waiting for tick/cross.
  const pending = messages?.findLast(
    (m) => m.senderChildId === child._id && (m.status === 'drafting' || m.status === 'draft'),
  )
  const status: ComposeStatus =
    submitting || pending?.status === 'drafting' ? 'thinking' : pending?.status === 'draft' ? 'draft' : 'idle'
  const locked = paused || status !== 'idle'

  // Friend is "typing" while their message is being written, confirmed or checked, before it is spoken.
  const typing =
    !!messages?.some((m) => m.senderChildId !== child._id && ['drafting', 'draft', 'confirmed'].includes(m.status))

  // Feed: spoken messages from both of us, plus my own confirmed/flagged ones.
  const feed: FeedMessage[] = useMemo(
    () =>
      (messages ?? []).flatMap((m): FeedMessage[] => {
        const mine = m.senderChildId === child._id
        const text = m.finalText ?? m.draftText ?? ''
        const base = { id: m._id, mine, text, symbols: m.symbols, time: m._creationTime }
        if (m.status === 'spoken') return [{ ...base, state: 'sent' }]
        if (mine && m.status === 'confirmed') return [{ ...base, state: 'pending' }]
        if (mine && m.status === 'flagged') return [{ ...base, state: 'flagged' }]
        return []
      }),
    [messages, child._id],
  )
  const suggestion = useMemo(() => suggestFor(feed), [feed])

  // When my message leaves the draft stage, clear the strip. A failed draft says why.
  // (Adjusting state while rendering is React's recommended pattern for reacting to new data.)
  const sent = sentId ? messages?.find((x) => x._id === sentId) : undefined
  if (sent && sent.status !== 'drafting' && sent.status !== 'draft') {
    setSentId(null)
    setStrip([])
    if (sent.status === 'rejected' && sent.moderationNote) setNotice(sent.moderationNote)
  }

  // Tell the child, kindly, when the safety check stopped one of their messages.
  const noticedFlags = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!messages) return
    const flagged = messages.filter((m) => m.senderChildId === child._id && m.status === 'flagged')
    if (noticedFlags.current === null) {
      noticedFlags.current = new Set(flagged.map((m) => m._id)) // old ones: don't re-announce
      return
    }
    const fresh = flagged.filter((m) => !noticedFlags.current!.has(m._id))
    if (fresh.length === 0) return
    fresh.forEach((m) => noticedFlags.current!.add(m._id))
    setNotice("That message wasn't sent. Try different words.")
  }, [messages, child._id])

  const favorites = useMemo(() => favoritesFor(child.symbolSet), [child.symbolSet])
  const lastSpokenFromFriend = messages?.findLast(
    (m) => m.senderChildId !== child._id && m.status === 'spoken' && m.audioUrl,
  )

  const send = async () => {
    if (strip.length === 0 || locked) return
    setNotice(null)
    setSubmitting(true)
    try {
      const id = await sendSymbols({ roomId, childId: child._id, symbols: strip.map((w) => w.label) })
      setSentId(id)
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const answer = async (yes: boolean) => {
    if (!pending) return
    try {
      await (yes ? confirm : reject)({ messageId: pending._id })
      if (yes) setTab('chat')
    } catch (e) {
      setNotice(friendlyError(e))
    }
  }

  if (!started) {
    return (
      <Shell>
        <StartGate
          me={me}
          friend={friend}
          onStart={() => {
            audio.unlock()
            setStarted(true)
          }}
        />
      </Shell>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={`kid-app show-${tab}`}>
        <div className="shell">
          <Board
            me={me}
            friend={friend}
            strip={strip}
            maxWords={MAX_WORDS}
            favorites={favorites}
            locked={locked}
            status={status}
            draft={pending?.status === 'draft' ? (pending.draftText ?? null) : null}
            notice={notice}
            suggestion={suggestion}
            onPick={(w) => setStrip((prev) => (prev.length < MAX_WORDS ? [...prev, w] : prev))}
            onRemove={(i) => setStrip((prev) => prev.filter((_, idx) => idx !== i))}
            onUndo={() => setStrip((prev) => prev.slice(0, -1))}
            onClear={() => setStrip([])}
            onSend={send}
            onConfirm={() => answer(true)}
            onReject={() => answer(false)}
            onDismissNotice={() => setNotice(null)}
          />
          <Conversation
            friend={friend}
            messages={feed}
            speakingId={audio.speakingId}
            typing={typing}
            soundOn={soundOn}
            paused={paused}
            canReplay={!!lastSpokenFromFriend}
            onToggleSound={() => setSoundOn((s) => !s)}
            onReplay={() => lastSpokenFromFriend?.audioUrl && audio.replay(lastSpokenFromFriend.audioUrl, lastSpokenFromFriend._id)}
            onBack={() => setTab('board')}
          />
        </div>

        <nav className="tabbar" aria-label="Switch view">
          <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>
            <Grid /> Board
          </button>
          <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
            <Chat /> Chat
          </button>
        </nav>

        <AnimatePresence>{paused && <PausedOverlay />}</AnimatePresence>
      </div>
    </MotionConfig>
  )
}

// Backend errors are written for developers; show the child something short and kind.
function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : ''
  if (msg.includes('Slow down')) return 'Whoa, slow down a little!'
  if (msg.includes('not active')) return 'We are taking a break right now.'
  if (msg.includes('Finish or reject')) return 'Finish your last message first.'
  if (msg.includes('vocabulary')) return "One of those pictures isn't available yet."
  return 'Something went wrong. Try again.'
}
