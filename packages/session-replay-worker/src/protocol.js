export const version = 1
export const maxEventBytes = 750_000
export const maxSessionBytes = 64 * 1024 * 1024
export const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength

export const validateSession = (session) => {
  if (session?.version !== version || !Array.isArray(session.events) || session.events.length > 200_000 || bytes(session) > maxSessionBytes) {
    throw new Error('Unsupported or oversized session replay')
  }
  let time = 0
  for (const [sequence, event] of session.events.entries()) {
    if (event.sequence !== sequence || !Number.isFinite(event.timestamp) || event.timestamp < time || !['frame', 'message'].includes(event.type)) {
      throw new Error('Invalid session replay event sequence')
    }
    if (bytes(event) > maxEventBytes) throw new Error('Session replay event is too large')
    time = event.timestamp
  }
  return session
}

// Binary search makes dragging independent of the number of diagnostic messages.
export const loadContent = (session) => {
  validateSession(session)
  const frames = session.events.filter((event) => event.type === 'frame')
  if (!frames.length) throw new Error('This session has no visual frames')
  const duration = session.events.at(-1)?.timestamp || 0
  const seek = (timestamp) => {
    const position = Math.max(0, Math.min(duration, Number(timestamp) || 0))
    let low = 0
    let high = frames.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (frames[middle].timestamp <= position) low = middle + 1
      else high = middle
    }
    return { position, duration, frame: frames[Math.max(0, low - 1)].data }
  }
  return { duration, seek }
}
