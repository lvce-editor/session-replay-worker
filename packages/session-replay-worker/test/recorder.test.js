import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRecorder } from '../src/recorder.js'
import { loadContent, validateSession } from '../src/protocol.js'

const frame = (text) => ({ dom: { tag: 'div', children: [{ text }] }, styles: [], viewport: [800, 600] })
const fixture = {
  version: 1,
  events: [
    { sequence: 0, timestamp: 0, type: 'frame', data: frame('first') },
    { sequence: 1, timestamp: 20, type: 'message', data: {} },
    { sequence: 2, timestamp: 100, type: 'frame', data: frame('last') },
  ],
}

test('seeking forwards, backwards, before start and beyond end', () => {
  const content = loadContent(fixture)
  for (const [time, text] of [
    [0, 'first'],
    [99, 'first'],
    [100, 'last'],
    [1000, 'last'],
    [10, 'first'],
    [-100, 'first'],
  ]) {
    assert.equal(content.seek(time).frame.dom.children[0].text, text)
  }
})
for (const [name, value] of [
  ['unknown version', { ...fixture, version: 2 }],
  ['missing events', { version: 1 }],
  ['out of order sequence', { version: 1, events: [{ ...fixture.events[0], sequence: 1 }] }],
  ['invalid time', { version: 1, events: [{ ...fixture.events[0], timestamp: -1 }] }],
  ['unknown event', { version: 1, events: [{ ...fixture.events[0], type: 'execute' }] }],
])
  test(`rejects ${name}`, () => assert.throws(() => validateSession(value)))

test('local only recording never makes a network request', async () => {
  const saved = []
  const recorder = createRecorder({
    storage: { save: async (...args) => saved.push(args) },
    fetch: () => {
      throw new Error('Network request forbidden')
    },
    now: () => 10,
  })
  await recorder.start({ local: true, upload: false })
  await recorder.record('frame', frame('local'))
  await recorder.flush()
  assert.equal(saved.length, 2)
  assert.equal(recorder.export().events[0].sequence, 0)
})

test('upload-only does not touch IndexedDB and retries exactly the same failed batch', async () => {
  let fail = true
  const requests = []
  const recorder = createRecorder({
    now: () => 10,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body)
      requests.push({ url: String(url), body })
      if (!body.events) return { ok: true, json: async () => ({ id: 'remote', uploadToken: 'write-secret' }) }
      if (fail) {
        fail = false
        return { ok: false, status: 503 }
      }
      return { ok: true, json: async () => ({ nextSequence: body.events.length }) }
    },
  })
  await recorder.start({ local: false, upload: true, endpoint: 'https://backend.test/session-replay?allowAnonymous=true' })
  await recorder.record('frame', frame('upload'))
  await assert.rejects(recorder.flush(), /503/)
  assert.equal(recorder.status().pending, 1)
  await recorder.flush()
  assert.deepEqual(requests[1], requests[2])
  assert.match(requests[1].url, /remote\/events\?allowAnonymous=true$/)
  assert.equal(recorder.status().pending, 0)
})

test('concurrent flushes share one request and events arriving during upload are retained', async () => {
  let release
  let sending
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const started = new Promise((resolve) => {
    sending = resolve
  })
  const batches = []
  const recorder = createRecorder({
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (!body.events) return { ok: true, json: async () => ({ id: 'id', uploadToken: 'token' }) }
      batches.push(body.events)
      sending()
      await gate
      return { ok: true, json: async () => ({}) }
    },
  })
  await recorder.start({ local: false, upload: true, endpoint: 'https://backend.test/session-replay' })
  await recorder.record('frame', frame('first'))
  const flush = recorder.flush()
  await started
  assert.equal(recorder.flush(), flush)
  await recorder.record('frame', frame('second'))
  release()
  await flush
  assert.deepEqual(
    batches.map((batch) => batch.map((event) => event.sequence)),
    [[0], [1]],
  )
})

test('oversized event is rejected without consuming a sequence', async () => {
  const recorder = createRecorder({})
  await recorder.start({ local: false, upload: false })
  await assert.rejects(recorder.record('message', 'x'.repeat(800_000)), /limit/)
  await recorder.record('frame', frame('small'))
  assert.equal(recorder.export().events[0].sequence, 0)
})
