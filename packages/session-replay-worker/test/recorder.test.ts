import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Frame, ReplayEvent, SessionMetadata } from '../src/api/types.ts'
import { loadContent, validateSession } from '../src/protocol.ts'
import { createRecorder } from '../src/recorder.ts'

const frame = (text: string): Frame => ({ dom: { children: [{ text }], tag: 'div' }, styles: [], viewport: [800, 600] })
const fixture = {
  events: [
    { data: frame('first'), sequence: 0, timestamp: 0, type: 'frame' },
    { data: {}, sequence: 1, timestamp: 20, type: 'message' },
    { data: frame('last'), sequence: 2, timestamp: 100, type: 'frame' },
  ],
  version: 1,
}

void test('seeking forwards, backwards, before start and beyond end', () => {
  const content = loadContent(fixture)
  for (const [time, text] of [
    [0, 'first'],
    [99, 'first'],
    [100, 'last'],
    [1000, 'last'],
    [10, 'first'],
    [-100, 'first'],
  ] as const) {
    assert.equal(content.seek(time).frame.dom.children![0].text, text)
  }
})
for (const [name, value] of [
  ['unknown version', { ...fixture, version: 2 }],
  ['missing events', { version: 1 }],
  ['out of order sequence', { events: [{ ...fixture.events[0], sequence: 1 }], version: 1 }],
  ['invalid time', { events: [{ ...fixture.events[0], timestamp: -1 }], version: 1 }],
  ['unknown event', { events: [{ ...fixture.events[0], type: 'execute' }], version: 1 }],
] as const)
  void test(`rejects ${name}`, () => assert.throws(() => validateSession(value)))

void test('local only recording never makes a network request', async () => {
  const saved: [SessionMetadata, ReplayEvent[]][] = []
  const recorder = createRecorder({
    fetch: () => {
      throw new Error('Network request forbidden')
    },
    now: () => 10,
    storage: {
      save: async (...args) => {
        saved.push(args)
      },
    },
  })
  await recorder.start({ local: true, upload: false })
  await recorder.record('frame', frame('local'))
  await recorder.flush()
  assert.equal(saved.length, 2)
  assert.equal(recorder.export().events[0].sequence, 0)
})

void test('upload-only does not touch IndexedDB and retries exactly the same failed batch', async () => {
  let fail = true
  const requests: { url: string; body: unknown }[] = []
  const recorder = createRecorder({
    fetch: async (url, options) => {
      const body = JSON.parse(options?.body as string)
      requests.push({ body, url: url instanceof Request ? url.url : String(url) })
      if (!body.events) return Response.json({ id: 'remote', uploadToken: 'write-secret' })
      if (fail) {
        fail = false
        return new Response(null, { status: 503 })
      }
      return Response.json({ nextSequence: body.events.length })
    },
    now: () => 10,
  })
  await recorder.start({ endpoint: 'https://backend.test/session-replay?allowAnonymous=true', local: false, upload: true })
  await recorder.record('frame', frame('upload'))
  await assert.rejects(recorder.flush(), /503/)
  assert.equal(recorder.status().pending, 1)
  await recorder.flush()
  assert.deepEqual(requests[1], requests[2])
  assert.match(requests[1].url, /remote\/events\?allowAnonymous=true$/)
  assert.equal(recorder.status().pending, 0)
})

void test('concurrent flushes share one request and events arriving during upload are retained', async () => {
  const { promise: gate, resolve: release } = Promise.withResolvers<void>()
  const { promise: started, resolve: sending } = Promise.withResolvers<void>()
  const batches: ReplayEvent[][] = []
  const recorder = createRecorder({
    fetch: async (_url, options) => {
      const body = JSON.parse(options?.body as string)
      if (!body.events) return Response.json({ id: 'id', uploadToken: 'token' })
      batches.push(body.events)
      sending()
      await gate
      return Response.json({})
    },
  })
  await recorder.start({ endpoint: 'https://backend.test/session-replay', local: false, upload: true })
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

void test('oversized event is rejected without consuming a sequence', async () => {
  const recorder = createRecorder({})
  await recorder.start({ local: false, upload: false })
  await assert.rejects(recorder.record('message', 'x'.repeat(800_000)), /limit/)
  await recorder.record('frame', frame('small'))
  assert.equal(recorder.export().events[0].sequence, 0)
})
