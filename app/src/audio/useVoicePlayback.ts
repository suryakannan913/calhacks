import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Unlock through an explicit user gesture. Safari/WebKit can still block a
// media element when its src changes later, so use the unlocked AudioContext.
export function useVoicePlayback(active: boolean) {
  const context = useRef<AudioContext | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const request = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const activeRef = useRef(active)
  useLayoutEffect(() => { activeRef.current = active }, [active])
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState('Not started')

  const stop = useCallback(() => {
    sequence.current++
    request.current?.abort()
    request.current = null
    if (source.current) {
      source.current.onended = null
      source.current.stop()
      source.current.disconnect()
      source.current = null
    }
    setStatus('paused')
  }, [])

  const enable = useCallback(async () => {
    context.current ??= new AudioContext()
    await context.current.resume()
    if (context.current.state !== 'running') throw new Error('Click Enable audio again to allow sound')
    setEnabled(true)
    setStatus('ready')
  }, [])

  const play = useCallback(async (url: string) => {
    if (!activeRef.current) return
    const audioContext = context.current
    if (!audioContext || audioContext.state !== 'running') {
      setStatus('Audio locked — click Enable audio')
      return
    }
    stop()
    const current = sequence.current
    const controller = new AbortController()
    request.current = controller
    setStatus('loading')
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('Audio download failed')
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
      if (current !== sequence.current || !activeRef.current) return
      const next = audioContext.createBufferSource()
      next.buffer = buffer
      next.connect(audioContext.destination)
      source.current = next
      next.onended = () => {
        if (current !== sequence.current) return
        next.disconnect()
        source.current = null
        setStatus('ended')
      }
      next.start()
      setStatus('playing')
    } catch (error) {
      if (current !== sequence.current || controller.signal.aborted) return
      setStatus('Audio unavailable — press replay')
      throw error
    }
  }, [stop])

  // Synchronize status with cancellation of the external AudioContext player.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (!active) stop() }, [active, stop])
  useEffect(() => () => {
    sequence.current++
    request.current?.abort()
    if (source.current) { source.current.onended = null; source.current.stop() }
    void context.current?.close()
  }, [])
  return { enabled, status, enable, play, stop }
}
