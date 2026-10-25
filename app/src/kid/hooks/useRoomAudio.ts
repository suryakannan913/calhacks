import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoicePlayback } from '../../audio/useVoicePlayback.ts'

export type SpokenMessage = { id: string; senderId: string; status: string; audioUrl: string | null }

/**
 * Plays the friend's spoken messages on THIS device, one at a time, exactly once each.
 * Messages that already exist when the room first loads are never replayed.
 *
 * Playback itself is the team's useVoicePlayback (unlocked AudioContext), which was verified
 * on WebKit. This hook adds the queue, the "have I played this?" bookkeeping and the speaking id.
 */
export function useRoomAudio({
  messages,
  meId,
  soundOn,
  paused,
}: {
  messages: SpokenMessage[] | undefined
  meId: string | undefined
  soundOn: boolean
  paused: boolean
}) {
  const voice = useVoicePlayback(!paused)
  const seen = useRef(new Set<string>())
  const primed = useRef(false)
  const queue = useRef<{ id: string; url: string }[]>([])
  const busy = useRef(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const { play } = voice

  const startNext = useCallback(() => {
    if (busy.current) return
    const next = queue.current.shift()
    if (!next) return
    busy.current = true
    setCurrentId(next.id)
    play(next.url).catch(() => {}) // the hook reports the failure in its status
  }, [play])

  // A clip finished (or could not start): move on to the next one.
  useEffect(() => {
    if (voice.status === 'loading' || voice.status === 'playing') return
    busy.current = false
    startNext()
  }, [voice.status, startNext])

  useEffect(() => {
    if (!messages || !meId) return
    const fresh = messages.filter((m) => m.status === 'spoken' && m.audioUrl && !seen.current.has(m.id))
    fresh.forEach((m) => seen.current.add(m.id))
    if (!primed.current) {
      primed.current = true // history: mark as heard, don't speak it
      return
    }
    if (!soundOn || paused) return
    for (const m of fresh) if (m.senderId !== meId) queue.current.push({ id: m.id, url: m.audioUrl! })
    startNext()
  })

  // Pausing the room drops anything waiting; the hook itself stops the clip that is playing.
  useEffect(() => {
    if (paused) queue.current = []
  }, [paused])

  const playing = voice.status === 'loading' || voice.status === 'playing'
  return {
    speakingId: playing ? currentId : null,
    /** Call from the start tap: browsers only allow sound after an explicit gesture. */
    unlock() {
      voice.enable().catch(() => {})
    },
    replay(url: string, id: string) {
      voice
        .enable()
        .catch(() => {})
        .then(() => {
          queue.current.push({ id, url })
          startNext()
        })
    },
  }
}
