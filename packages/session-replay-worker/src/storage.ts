import type { ReplayEvent, Session, SessionMetadata } from './api/types.ts'

export interface ReplayStorage {
  close(): void
  read(id: string): Promise<Session>
  save(session: SessionMetadata, events: ReplayEvent[]): Promise<void>
}

const withoutSessionId = ({ sessionId, ...event }: ReplayEvent & { sessionId: string }): ReplayEvent => event

const open = (): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('lvce-session-replays', 1)
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore('sessions', { keyPath: 'id' })
      request.result.createObjectStore('events', { keyPath: ['sessionId', 'sequence'] })
    }
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void => reject(request.error || new Error('Replay storage open failed'))
  })

export const createStorage = async (): Promise<ReplayStorage> => {
  const db = await open()
  const transaction = (stores: string[], action: (tx: IDBTransaction) => void): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      action(tx)
      tx.oncomplete = (): void => resolve()
      tx.onerror = tx.onabort = (): void => reject(tx.error || new Error('Replay storage transaction aborted'))
    })
  return {
    close: () => db.close(),
    read: (id) =>
      new Promise<Session>((resolve, reject) => {
        const tx = db.transaction(['sessions', 'events'])
        const metadata = tx.objectStore('sessions').get(id)
        const events = tx.objectStore('events').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]))
        tx.oncomplete = (): void =>
          metadata.result
            ? resolve({ ...metadata.result, events: events.result.map(withoutSessionId) })
            : reject(new Error('Session replay not found'))
        tx.onerror = (): void => reject(tx.error || new Error('Replay storage read failed'))
      }),
    save: (session, events) =>
      transaction(['sessions', 'events'], (tx) => {
        tx.objectStore('sessions').put(session)
        for (const event of events) tx.objectStore('events').put({ ...event, sessionId: session.id })
      }),
  }
}
