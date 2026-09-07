import type { WorkerCommands } from './api/types.ts'
import type { ReplayStorage } from './storage.ts'
import { getTransferrables } from './api/transfer.ts'
import { loadContent } from './protocol.ts'
import { createProxyRegistry } from './proxy.ts'
import { createRecorder } from './recorder.ts'
import { createMessageSerializer } from './serializeProxyMessage.ts'
import { createStorage } from './storage.ts'

let storage: ReplayStorage | undefined
let recorder: ReturnType<typeof createRecorder>
let content: ReturnType<typeof loadContent>
let queue = Promise.resolve()
let timer: ReturnType<typeof setInterval> | undefined
const getStorage = async (): Promise<ReplayStorage> => (storage ||= await createStorage())
let recording = false
let captureError = ''
let pending = 0
let writes = Promise.resolve()
const report = (error: unknown): void => {
  captureError = error instanceof Error ? error.message : String(error)
  recording = false
}
const serializeMessage = createMessageSerializer()
const proxies = createProxyRegistry({
  record(message) {
    if (!recording) return
    if (pending >= 500) {
      report(new Error('Recording cannot keep up with worker messages'))
      return
    }
    const data = serializeMessage(message)
    pending++
    const write = recorder
      .record('message', data)
      .catch(report)
      .finally(() => {
        pending--
      })
    writes = Promise.all([writes, write]).then(() => {})
  },
  report,
})
const commands: WorkerCommands = {
  export: async () => {
    await writes
    return recorder.export()
  },
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
  proxy: (port) => proxies.create(port),
  record: (...params) => recorder.record(...params),
  seek: (timestamp) => content.seek(timestamp),
  async start(options, initialFrame) {
    if (recorder) throw new Error('Reload the window to start a new command recording')
    recorder = createRecorder({ storage: options.local ? await getStorage() : undefined })
    const id = await recorder.start(options)
    if (initialFrame) await recorder.record('frame', { ...initialFrame, commandReplay: true })
    recording = true
    clearInterval(timer)
    timer = setInterval(() => {
      void recorder.flush().catch(() => {})
    }, 2000)
    return id
  },
  status: () => ({ ...recorder.status(), error: captureError || recorder.status().error }),
  async stop() {
    clearInterval(timer)
    recording = false
    await writes
    await recorder?.flush()
  },
}
globalThis.onmessage = ({ data: { id, method, params = [] } }: MessageEvent<{ id: number; method: string; params?: unknown[] }>): void => {
  queue = queue.then(async () => {
    try {
      if (!Object.hasOwn(commands, method)) throw new Error('Unknown session replay command')
      const result = await (commands[method as keyof WorkerCommands] as (...args: unknown[]) => unknown)(...params)
      globalThis.postMessage({ id, result }, { transfer: getTransferrables(result) })
    } catch (error) {
      globalThis.postMessage({ error: error instanceof Error ? error.message : String(error), id })
    }
  })
}
