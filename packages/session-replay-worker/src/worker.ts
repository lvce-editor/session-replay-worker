import type { WorkerCommands } from './api/types.ts'
import type { ReplayStorage } from './storage.ts'
import { loadContent } from './protocol.ts'
import { createRecorder } from './recorder.ts'
import { createStorage } from './storage.ts'

let storage: ReplayStorage | undefined
let recorder: ReturnType<typeof createRecorder>
let content: ReturnType<typeof loadContent>
let queue = Promise.resolve()
let timer: ReturnType<typeof setInterval> | undefined
const getStorage = async (): Promise<ReplayStorage> => (storage ||= await createStorage())
const commands: WorkerCommands = {
  export: () => recorder.export(),
  flush: () => recorder.flush(),
  async load(source) {
    let session
    if ('localId' in source) {
      const localStorage = await getStorage()
      session = await localStorage.read(source.localId)
    } else if ('url' in source) {
      const response = await fetch(source.url, { credentials: 'include', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`Cannot load session replay (${response.status})`)
      session = await response.json()
    } else ({ session } = source)
    content = loadContent(session)
    return content.seek(0)
  },
  record: (...params) => recorder.record(...params),
  seek: (timestamp) => content.seek(timestamp),
  async start(options) {
    recorder = createRecorder({ storage: options.local ? await getStorage() : undefined })
    const id = await recorder.start(options)
    clearInterval(timer)
    timer = setInterval(() => {
      void recorder.flush().catch(() => {})
    }, 2000)
    return id
  },
  status: () => recorder.status(),
  async stop() {
    clearInterval(timer)
    await recorder?.flush()
    storage?.close()
  },
}
globalThis.onmessage = ({ data: { id, method, params = [] } }: MessageEvent<{ id: number; method: string; params?: unknown[] }>): void => {
  queue = queue.then(async () => {
    try {
      if (!Object.hasOwn(commands, method)) throw new Error('Unknown session replay command')
      globalThis.postMessage({ id, result: await (commands[method as keyof WorkerCommands] as (...args: unknown[]) => unknown)(...params) })
    } catch (error) {
      globalThis.postMessage({ error: error instanceof Error ? error.message : String(error), id })
    }
  })
}
