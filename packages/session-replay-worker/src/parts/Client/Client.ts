import type { ReplayClient, WorkerCommands } from '../Types/Types.ts'
import { getTransferrables } from '../Transfer/Transfer.ts'

export const createClient = (url: string | URL): ReplayClient => {
  const worker = new Worker(url, { name: 'Session Replay Worker', type: 'module' })
  let callbacks: Record<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }> = Object.create(null)
  let nextId = 0
  let disposed = false
  const fail = (error: Error): void => {
    for (const { reject } of Object.values(callbacks)) reject(error)
    callbacks = Object.create(null)
  }
  worker.onmessage = ({ data }: MessageEvent<{ id: number; error?: string; result?: unknown }>): void => {
    const callback = callbacks[data.id]
    if (!callback) return
    delete callbacks[data.id]
    if (data.error) callback.reject(new Error(data.error))
    else callback.resolve(data.result)
  }
  worker.onerror = (): void => {
    disposed = true
    worker.terminate()
    fail(new Error('Session replay worker failed to load'))
  }
  const invoke = <K extends keyof WorkerCommands>(
    transfer: boolean,
    method: K,
    ...params: Parameters<WorkerCommands[K]>
  ): Promise<Awaited<ReturnType<WorkerCommands[K]>>> => {
    if (disposed) return Promise.reject(new Error('Session replay worker is closed'))
    return new Promise<Awaited<ReturnType<WorkerCommands[K]>>>((resolve, reject) => {
      const id = nextId++
      callbacks[id] = { reject, resolve: (value) => resolve(value as Awaited<ReturnType<WorkerCommands[K]>>) }
      try {
        worker.postMessage({ id, method, params }, transfer ? getTransferrables(params) : [])
      } catch (error) {
        delete callbacks[id]
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
  return {
    dispose(): void {
      disposed = true
      worker.terminate()
      fail(new Error('Session replay worker is closed'))
    },
    invoke: (method, ...params) => invoke(false, method, ...params),
    invokeAndTransfer: (method, ...params) => invoke(true, method, ...params),
  }
}
