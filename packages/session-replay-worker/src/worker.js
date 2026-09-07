import { createRecorder } from './recorder.js'
import { createStorage } from './storage.js'
import { loadContent } from './protocol.js'

let storage
let recorder
let content
let queue = Promise.resolve()
let timer
const getStorage = async () => (storage ||= await createStorage())
const commands = {
  async start(options) {
    recorder = createRecorder({ storage: options.local ? await getStorage() : undefined })
    const id = await recorder.start(options)
    clearInterval(timer)
    timer = setInterval(() => recorder.flush().catch(() => {}), 2000)
    return id
  },
  record: (type, data) => recorder.record(type, data),
  flush: () => recorder.flush(),
  export: () => recorder.export(),
  status: () => recorder.status(),
  async load(source) {
    let session
    if (source.localId) session = await (await getStorage()).read(source.localId)
    else if (source.url) {
      const response = await fetch(source.url, { credentials: 'include', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`Cannot load session replay (${response.status})`)
      session = await response.json()
    } else session = source.session
    content = loadContent(session)
    return content.seek(0)
  },
  seek: (timestamp) => content.seek(timestamp),
  async stop() {
    clearInterval(timer)
    await recorder?.flush()
    storage?.close()
  },
}
self.onmessage = ({ data: { id, method, params = [] } }) => {
  queue = queue.then(async () => {
    try {
      if (!Object.hasOwn(commands, method)) throw new Error('Unknown session replay command')
      self.postMessage({ id, result: await commands[method](...params) })
    } catch (error) {
      self.postMessage({ id, error: error.message })
    }
  })
}
