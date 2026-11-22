import type { ProxyMessage } from '../Proxy/Proxy.ts'
import type { Frame, ReplayEvent, Session, SeekResult } from '../Types/Types.ts'
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
      !['frame', 'message', 'pointermove'].includes(event.type)
    ) {
      throw new Error('Invalid session replay event sequence')
    }
    if (
      event.type === 'pointermove' &&
      (!Array.isArray(event.data) || event.data.length !== 2 || !Number.isFinite(event.data[0]) || !Number.isFinite(event.data[1]))
    ) {
      throw new Error('Invalid session replay pointer position')
    }
    if (bytes(event) > maxEventBytes) throw new Error('Session replay event is too large')
    time = event.timestamp
  }
  return session
}

const findEvent = <Event extends ReplayEvent>(events: readonly Event[], timestamp: number): Event | undefined => {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (events[middle].timestamp <= timestamp) low = middle + 1
    else high = middle
  }
  return events[low - 1]
}

// Each cursor owns its command state while sharing the validated recording.
const createSeek = (
  session: Session,
  frames: Extract<ReplayEvent, { type: 'frame' }>[],
  pointers: Extract<ReplayEvent, { type: 'pointermove' }>[],
  duration: number,
  start: number,
): ((timestamp: number) => SeekResult) => {
  let visual = createVisualState(frames[0].data)
  let eventIndex = 0
  let lastPosition = -1
  let lastSnapshot: Frame | undefined
  let lastFrame: Frame | undefined
  const seek = (timestamp: number): SeekResult => {
    const position = Math.max(0, Math.min(duration, timestamp || 0))
    const time = position + start
    const pointer = findEvent(pointers, time)?.data
    if (frames[0].data.commandReplay) {
      if (position < lastPosition) {
        visual = createVisualState(frames[0].data)
        eventIndex = 0
      }
      while (eventIndex < session.events.length && session.events[eventIndex].timestamp <= time) {
        const event = session.events[eventIndex++]
        if (event.type === 'message') visual.accept(event.data as ProxyMessage)
      }
      lastPosition = position
      return { duration, frame: structuredClone({ ...visual.frame(), pointer }), position }
    }
    const frame = (findEvent(frames, time) || frames[0]).data
    if (lastSnapshot !== frame || lastFrame?.pointer !== pointer) {
      lastSnapshot = frame
      lastFrame = pointer ? { ...frame, pointer } : frame
    }
    return { duration, frame: lastFrame!, position }
  }
  return seek
}

export const loadContent = (
  value: unknown,
): { activity: number[]; duration: number; preview: (timestamp: number) => SeekResult; seek: (timestamp: number) => SeekResult } => {
  const session = validateSession(value)
  const frames = session.events.filter((event) => event.type === 'frame')
  if (frames.length === 0) throw new Error('This session has no visual frames')
  const pointers = session.events.filter((event) => event.type === 'pointermove')
  const start = getPlaybackStart(session.events, frames[0].data)
  const duration = (session.events.at(-1)?.timestamp || 0) - start
  const seek = createSeek(session, frames, pointers, duration, start)
  let previewSeek: ReturnType<typeof createSeek> | undefined
  const preview = (timestamp: number): SeekResult => {
    previewSeek ||= createSeek(session, frames, pointers, duration, start)
    return previewSeek(timestamp)
  }
  return { activity: getActivity(session.events, duration, start), duration, preview, seek }
}
