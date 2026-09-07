export const createClient = (url) => {
  const worker = new Worker(url, { type: 'module', name: 'Session Replay Worker' })
  const callbacks = new Map()
  let nextId = 0
  let disposed = false
  const fail = (error) => {
    for (const { reject } of callbacks.values()) reject(error)
    callbacks.clear()
  }
  worker.onmessage = ({ data }) => {
    const callback = callbacks.get(data.id)
    if (!callback) return
    callbacks.delete(data.id)
    if (data.error) callback.reject(new Error(data.error))
    else callback.resolve(data.result)
  }
  worker.onerror = () => {
    disposed = true
    worker.terminate()
    fail(new Error('Session replay worker failed to load'))
  }
  return {
    invoke(method, ...params) {
      if (disposed) return Promise.reject(new Error('Session replay worker is closed'))
      return new Promise((resolve, reject) => {
        const id = nextId++
        callbacks.set(id, { resolve, reject })
        try {
          worker.postMessage({ id, method, params })
        } catch (error) {
          callbacks.delete(id)
          reject(error)
        }
      })
    },
    dispose() {
      disposed = true
      worker.terminate()
      fail(new Error('Session replay worker is closed'))
    },
  }
}
