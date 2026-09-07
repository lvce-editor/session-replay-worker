import type { ReplayClient, WorkerCommands } from './types.ts'
import { getTransferrables } from './transfer.ts'

export const createClient = (url: string | URL): ReplayClient => {
  const worker = new Worker(url, { name: 'Session Replay Worker', type: 'module' })
  const callbacks = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>()
  let nextId = 0
  let disposed = false
  const fail = (error: Error): void => {
    for (const { reject } of callbacks.values()) reject(error)
    callbacks.clear()
  }
  worker.onmessage = ({ data }: MessageEvent<{ id: number; error?: string; result?: unknown }>): void => {
    const callback = callbacks.get(data.id)
    if (!callback) return
    callbacks.delete(data.id)
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
      callbacks.set(id, { reject, resolve: (value) => resolve(value as Awaited<ReturnType<WorkerCommands[K]>>) })
      try {
        worker.postMessage({ id, method, params }, transfer ? getTransferrables(params) : [])
      } catch (error) {
        callbacks.delete(id)
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
