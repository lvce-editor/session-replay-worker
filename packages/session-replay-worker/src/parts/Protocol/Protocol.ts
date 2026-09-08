import type { Session, SeekResult } from '../Types/Types.ts'
import type { ProxyMessage } from '../Proxy/Proxy.ts'
import { createVisualState } from '../VisualState/VisualState.ts'

export const version = 1
export const maxEventBytes = 750_000
export const maxSessionBytes = 64 * 1024 * 1024
export const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength

export const validateSession = (value: unknown): Session => {
  const session = value as Session | undefined
  if (session?.version !== version || !Array.isArray(session.events) || session.events.length > 200_000 || bytes(session) > maxSessionBytes) {
    throw new Error('Unsupported or oversized session replay')
  }
  let time = 0
  for (const [sequence, event] of session.events.entries()) {
    if (
      !event ||
      event.sequence !== sequence ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < time ||
      !['frame', 'message'].includes(event.type)
    ) {
      throw new Error('Invalid session replay event sequence')
    }
    if (bytes(event) > maxEventBytes) throw new Error('Session replay event is too large')
    time = event.timestamp
  }
  return session
}

// Binary search makes dragging independent of the number of diagnostic messages.
export const loadContent = (value: unknown): { duration: number; seek: (timestamp: number) => SeekResult } => {
  const session = validateSession(value)
  const frames = session.events.filter((event) => event.type === 'frame')
  if (frames.length === 0) throw new Error('This session has no visual frames')
  const duration = session.events.at(-1)?.timestamp || 0
  let visual = createVisualState(frames[0].data)
  let eventIndex = 0
  let lastPosition = -1
  const seek = (timestamp: number): SeekResult => {
    const position = Math.max(0, Math.min(duration, timestamp || 0))
    if (frames[0].data.commandReplay) {
      if (position < lastPosition) {
        visual = createVisualState(frames[0].data)
        eventIndex = 0
      }
      while (eventIndex < session.events.length && session.events[eventIndex].timestamp <= position) {
        const event = session.events[eventIndex++]
        if (event.type === 'message') visual.accept(event.data as ProxyMessage)
      }
      lastPosition = position
      return { duration, frame: structuredClone(visual.frame()), position }
    }
    let low = 0
    let high = frames.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (frames[middle].timestamp <= position) low = middle + 1
      else high = middle
    }
    return { duration, frame: frames[Math.max(0, low - 1)].data, position }
  }
  return { duration, seek }
}
