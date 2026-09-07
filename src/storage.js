const open = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('lvce-session-replays', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sessions', { keyPath: 'id' })
      request.result.createObjectStore('events', { keyPath: ['sessionId', 'sequence'] })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export const createStorage = async () => {
  const db = await open()
  const transaction = (stores, action) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      action(tx)
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Replay storage transaction aborted'))
    })
  return {
    save: (session, events) =>
      transaction(['sessions', 'events'], (tx) => {
        tx.objectStore('sessions').put(session)
        for (const event of events) tx.objectStore('events').put({ ...event, sessionId: session.id })
      }),
    read: (id) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(['sessions', 'events'])
        const metadata = tx.objectStore('sessions').get(id)
        const events = tx.objectStore('events').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]))
        tx.oncomplete = () =>
          metadata.result
            ? resolve({ ...metadata.result, events: events.result.map(({ sessionId, ...event }) => event) })
            : reject(new Error('Session replay not found'))
        tx.onerror = () => reject(tx.error)
      }),
    close: () => db.close(),
  }
}
