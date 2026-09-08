import type { ReplayStorage } from '../Storage/Storage.ts'
import type { WorkerCommands } from '../Types/Types.ts'
import { createReplayMessageFilter } from '../FilterReplayMessage/FilterReplayMessage.ts'
import { loadSource } from '../LoadSource/LoadSource.ts'
import { loadContent } from '../Protocol/Protocol.ts'
import { createProxyRegistry } from '../Proxy/Proxy.ts'
import { createRecorder } from '../Recorder/Recorder.ts'
import { createMessageSerializer } from '../SerializeProxyMessage/SerializeProxyMessage.ts'
import { createSessionReplayView } from '../SessionReplayView/SessionReplayView.ts'
import { createStorage } from '../Storage/Storage.ts'
import { getTransferrables } from '../Transfer/Transfer.ts'

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
const shouldRecord = createReplayMessageFilter()
const proxies = createProxyRegistry({
  record(message) {
    if (!recording || !shouldRecord(message)) return
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
const view = createSessionReplayView(getStorage)
const commands: WorkerCommands = {
  export: async () => {
    await writes
    return recorder.export()
  },
  flush: () => recorder.flush(),
  async load(source) {
    content = loadContent(await loadSource(source, getStorage))
    return { ...content.seek(0), activity: content.activity }
  },
  preview: (timestamp) => content.preview(timestamp),
  proxy: (port) => proxies.create(port),
  record: (...params) => recorder.record(...params),
  seek: (timestamp) => content.seek(timestamp),
  'SessionReplay.create': view.create,
  'SessionReplay.dispatch': view.dispatch,
  'SessionReplay.dispose': view.dispose,
  'SessionReplay.loadContent': view.loadContent,
  'SessionReplay.render': view.render,
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
