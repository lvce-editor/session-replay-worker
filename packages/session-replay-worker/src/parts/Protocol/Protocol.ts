import type { ProxyMessage } from '../Proxy/Proxy.ts'
import type { Session, SeekResult } from '../Types/Types.ts'
import { getActivity } from '../Activity/Activity.ts'
import { getPlaybackStart } from '../GetPlaybackStart/GetPlaybackStart.ts'
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

// Each cursor owns its command state while sharing the validated recording.
const createSeek = (
  session: Session,
  frames: Extract<Session['events'][number], { type: 'frame' }>[],
  duration: number,
  start: number,
): ((timestamp: number) => SeekResult) => {
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
      while (eventIndex < session.events.length && session.events[eventIndex].timestamp <= position + start) {
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
      if (frames[middle].timestamp <= position + start) low = middle + 1
      else high = middle
    }
    return { duration, frame: frames[Math.max(0, low - 1)].data, position }
  }
  return seek
}

export const loadContent = (
  value: unknown,
): { activity: number[]; duration: number; preview: (timestamp: number) => SeekResult; seek: (timestamp: number) => SeekResult } => {
  const session = validateSession(value)
  const frames = session.events.filter((event) => event.type === 'frame')
  if (frames.length === 0) throw new Error('This session has no visual frames')
  const start = getPlaybackStart(session.events, frames[0].data)
  const duration = (session.events.at(-1)?.timestamp || 0) - start
  const seek = createSeek(session, frames, duration, start)
  let previewSeek: ReturnType<typeof createSeek> | undefined
  const preview = (timestamp: number): SeekResult => {
    previewSeek ||= createSeek(session, frames, duration, start)
    return previewSeek(timestamp)
  }
  return { activity: getActivity(session.events, duration, start), duration, preview, seek }
}
