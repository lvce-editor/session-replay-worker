import { bytes, maxEventBytes, maxSessionBytes, version } from './protocol.js'

export const createRecorder = ({ storage, fetch: request = globalThis.fetch, now = () => performance.now() }) => {
  let metadata
  let options
  let events = []
  let pending = []
  let size = 0
  let origin = 0
  let remote
  let uploadPromise
  let lastError = ''
  let saved = 0
  let uploaded = 0
  const start = async (config) => {
    if (metadata) throw new Error('A session is already recording')
    options = config
    origin = now()
    metadata = { id: crypto.randomUUID(), version, createdAt: new Date().toISOString() }
    if (options.local) await storage.save(metadata, [])
    return metadata.id
  }
  const record = async (type, data) => {
    if (!metadata) return
    const event = { sequence: events.length, timestamp: Math.max(events.at(-1)?.timestamp || 0, now() - origin), type, data }
    const eventSize = bytes(event)
    if (eventSize > maxEventBytes || size + eventSize > maxSessionBytes)
      throw new Error('Session replay storage limit reached; download this session and start a new one')
    size += eventSize
    events.push(event)
    if (options.upload) pending.push(event)
    if (options.local) {
      await storage.save(metadata, [event])
      saved++
    }
  }
  const doUpload = async () => {
    if (!options?.upload || !pending.length) return
    const endpoint = new URL(options.endpoint)
    if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Invalid session replay backend URL')
    const headers = { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }
    const send = async (url, body) => {
      const response = await request(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Session replay upload failed (${response.status})`)
      return response.json()
    }
    if (!remote) remote = await send(endpoint, { version, createdAt: metadata.createdAt })
    while (pending.length) {
      const batch = []
      let batchBytes = 0
      for (const event of pending) {
        const length = bytes(event)
        if (batch.length && (batchBytes + length > 800_000 || batch.length >= 250)) break
        batch.push(event)
        batchBytes += length
      }
      const url = new URL(endpoint)
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(remote.id)}/events`
      await send(url, { uploadToken: remote.uploadToken, events: batch })
      pending.splice(0, batch.length)
      uploaded += batch.length
    }
  }
  const flush = () => {
    uploadPromise ||= doUpload()
      .then(
        () => {
          lastError = ''
        },
        (error) => {
          lastError = error.message
          throw error
        },
      )
      .finally(() => {
        uploadPromise = undefined
      })
    return uploadPromise
  }
  return {
    start,
    record,
    flush,
    export: () => ({ ...metadata, events }),
    status: () => ({ id: metadata?.id, events: events.length, saved, uploaded, pending: pending.length, bytes: size, error: lastError }),
  }
}
