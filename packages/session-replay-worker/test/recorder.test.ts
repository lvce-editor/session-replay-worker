import { expect, test } from '@jest/globals'
import type { Frame } from '../src/api/types.ts'
import { loadContent, validateSession } from '../src/protocol.ts'
import { createRecorder } from '../src/recorder.ts'

const frame = (text: string): Frame => ({
  dom: { children: [{ text }], tag: 'div' },
  styles: [],
  viewport: [800, 600],
})
const fixture = {
  events: [
    { data: frame('first'), sequence: 0, timestamp: 0, type: 'frame' },
    { data: {}, sequence: 1, timestamp: 20, type: 'message' },
    { data: frame('last'), sequence: 2, timestamp: 100, type: 'frame' },
  ],
  version: 1,
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
  ] as const) {
    expect(content.seek(time).frame.dom.children).toEqual([{ text }])
  }
})
for (const [name, value] of [
  ['unknown version', { ...fixture, version: 2 }],
  ['missing events', { version: 1 }],
  ['out of order sequence', { events: [{ ...fixture.events[0], sequence: 1 }], version: 1 }],
  ['invalid time', { events: [{ ...fixture.events[0], timestamp: -1 }], version: 1 }],
  ['unknown event', { events: [{ ...fixture.events[0], type: 'execute' }], version: 1 }],
] as const)
  test(`rejects ${name}`, () => expect(() => validateSession(value)).toThrow())

test('local only recording never makes a network request', async () => {
  const saved: unknown[][] = []
  const recorder = createRecorder({
    fetch: () => {
      throw new Error('Network request forbidden')
    },
    now: () => 10,
    storage: {
      save: async (...args: unknown[]): Promise<void> => {
        saved.push(args)
      },
    },
  })
  await recorder.start({ local: true, upload: false })
  await recorder.record('frame', frame('local'))
  await recorder.flush()
  expect(saved).toHaveLength(2)
  expect(recorder.export().events[0].sequence).toBe(0)
})

test('upload-only does not touch IndexedDB and retries exactly the same failed batch', async () => {
  let fail = true
  const requests: { url: string; body: unknown }[] = []
  const recorder = createRecorder({
    fetch: async (url, options) => {
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
      if (!(url instanceof URL)) throw new TypeError('Expected a URL')
      const body = JSON.parse(options.body)
      requests.push({ body, url: url.href })
      if (!body.events) return Response.json({ id: 'remote', uploadToken: 'write-secret' })
      if (fail) {
        fail = false
        return new Response(null, { status: 503 })
      }
      return Response.json({ nextSequence: body.events.length })
    },
    now: () => 10,
    storage: undefined,
  })
  await recorder.start({ endpoint: 'https://backend.test/session-replay?allowAnonymous=true', local: false, upload: true })
  await recorder.record('frame', frame('upload'))
  await expect(recorder.flush()).rejects.toThrow(/503/)
  expect(recorder.status().pending).toBe(1)
  await recorder.flush()
  expect(requests[1]).toEqual(requests[2])
  expect(requests[1].url).toMatch(/remote\/events\?allowAnonymous=true$/)
  expect(recorder.status().pending).toBe(0)
})

test('concurrent flushes share one request and events arriving during upload are retained', async () => {
  const { promise: gate, resolve: release } = Promise.withResolvers<void>()
  const { promise: started, resolve: sending } = Promise.withResolvers<void>()
  const batches: { sequence: number }[][] = []
  const recorder = createRecorder({
    fetch: async (_url, options) => {
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
      const body = JSON.parse(options.body)
      if (!body.events) return Response.json({ id: 'id', uploadToken: 'token' })
      batches.push(body.events)
      sending()
      await gate
      return Response.json({})
    },
    storage: undefined,
  })
  await recorder.start({ endpoint: 'https://backend.test/session-replay', local: false, upload: true })
  await recorder.record('frame', frame('first'))
  const flush = recorder.flush()
  await started
  expect(recorder.flush()).toBe(flush)
  await recorder.record('frame', frame('second'))
  release()
  await flush
  expect(batches.map((batch) => batch.map((event) => event.sequence))).toEqual([[0], [1]])
})

test('oversized event is rejected without consuming a sequence', async () => {
  const recorder = createRecorder({ storage: undefined })
  await recorder.start({ local: false, upload: false })
  await expect(recorder.record('message', 'x'.repeat(800_000))).rejects.toThrow(/limit/)
  await recorder.record('frame', frame('small'))
  expect(recorder.export().events[0].sequence).toBe(0)
})
