import type { RecordingOptions, ReplayEvent, RecordParams, Session, SessionMetadata, WorkerCommands, RecordingStatus } from './api/types.ts'
import type { ReplayStorage } from './storage.ts'
import { bytes, maxEventBytes, maxSessionBytes, version } from './protocol.ts'

interface RecorderDependencies {
  fetch?: typeof globalThis.fetch
  now?: () => number
  storage?: Pick<ReplayStorage, 'save'>
}

export const createRecorder = ({
  fetch: request = globalThis.fetch,
  now = (): number => performance.now(),
  storage,
}: RecorderDependencies): Pick<WorkerCommands, 'start' | 'record' | 'flush' | 'status'> & { export: () => Session } => {
  let metadata: SessionMetadata
  let options: RecordingOptions
  const events: ReplayEvent[] = []
  const pending: ReplayEvent[] = []
  let size = 0
  let origin = 0
  let remote: { id: string; uploadToken: string } | undefined
  let uploadPromise: Promise<void> | undefined
  let lastError = ''
  let saved = 0
  let uploaded = 0
  const start = async (config: RecordingOptions): Promise<string> => {
    if (metadata) throw new Error('A session is already recording')
    options = config
    origin = now()
    metadata = { createdAt: new Date().toISOString(), id: crypto.randomUUID(), version }
    if (options.local) await storage!.save(metadata, [])
    return metadata.id
  }
  const record = async (...[type, data]: RecordParams): Promise<void> => {
    if (!metadata) return
    const event = { data, sequence: events.length, timestamp: Math.max(events.at(-1)?.timestamp || 0, now() - origin), type } as ReplayEvent
    const eventSize = bytes(event)
    if (eventSize > maxEventBytes || size + eventSize > maxSessionBytes)
      throw new Error('Session replay storage limit reached; download this session and start a new one')
    size += eventSize
    events.push(event)
    if (options.upload) pending.push(event)
    if (options.local) {
      await storage!.save(metadata, [event])
      saved++
    }
  }
  const doUpload = async (): Promise<void> => {
    if (!options?.upload || pending.length === 0) return
    const endpoint = new URL(options.endpoint!)
    if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Invalid session replay backend URL')
    const headers = { 'Content-Type': 'application/json', ...(options.token && { Authorization: `Bearer ${options.token}` }) }
    const send = async (url: URL, body: unknown): Promise<unknown> => {
      const response = await request(url, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Session replay upload failed (${response.status})`)
      return response.json()
    }
    if (!remote) remote = (await send(endpoint, { createdAt: metadata.createdAt, version })) as { id: string; uploadToken: string }
    while (pending.length > 0) {
      const batch: ReplayEvent[] = []
      let batchBytes = 0
      for (const event of pending) {
        const length = bytes(event)
        // Stop at the request size boundary while retaining the remaining events.
        // eslint-disable-next-line unicorn/no-break-in-nested-loop
        if (batch.length > 0 && (batchBytes + length > 800_000 || batch.length >= 250)) break
        batch.push(event)
        batchBytes += length
      }
      const url = new URL(endpoint)
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(remote.id)}/events`
      await send(url, { events: batch, uploadToken: remote.uploadToken })
      pending.splice(0, batch.length)
      uploaded += batch.length
    }
  }
  const flush = (): Promise<void> => {
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
    export: (): Session => ({ ...metadata, events }),
    flush,
    record,
    start,
    status: (): RecordingStatus => ({
      bytes: size,
      error: lastError,
      events: events.length,
      id: metadata?.id,
      pending: pending.length,
      saved,
      uploaded,
    }),
  }
}
