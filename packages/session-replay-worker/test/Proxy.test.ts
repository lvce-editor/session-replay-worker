import { afterEach, expect, test } from '@jest/globals'
import type { ProxyMessage } from '../src/parts/Proxy/Proxy.ts'
import { createProxyRegistry } from '../src/parts/Proxy/Proxy.ts'
import { createMessageSerializer } from '../src/parts/SerializeProxyMessage/SerializeProxyMessage.ts'
import { getTransferrables } from '../src/parts/Transfer/Transfer.ts'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups.length = 0
})
const receive = <T = any>(port: MessagePort): Promise<T> =>
  new Promise((resolve) => {
    port.addEventListener('message', ({ data }: MessageEvent<T>) => resolve(data), { once: true })
    port.start()
  })
const setup = (record: (message: ProxyMessage) => void = (): void => {}): { local: MessagePort; remote: MessagePort } => {
  const registry = createProxyRegistry({ record })
  const { port1, port2 } = new MessageChannel()
  const remote = registry.create(port2)
  cleanups.push(() => {
    port1.close()
    remote.close()
    registry.dispose()
  })
  return { local: port1, remote }
}

test('forwards requests, replies, errors and notifications without rewriting ids', async () => {
  const records: ProxyMessage[] = []
  const { local, remote } = setup((data) => {
    records.push(structuredClone(data))
  })
  for (const message of [
    { id: 17, method: 'test', params: ['hello'] },
    { method: 'notice', params: [] },
  ]) {
    const result = receive(remote)
    local.postMessage(message)
    expect(await result).toEqual(message)
  }
  const error = { error: { code: 4, message: 'failure' }, id: 17 }
  const response = receive(local)
  remote.postMessage(error)
  expect(await response).toEqual(error)
  expect(records.map((entry) => entry.direction)).toEqual(['to-renderer', 'to-renderer', 'from-renderer'])
})

test('transfers aliased typed arrays, collections and circular data in both directions', async () => {
  const { local, remote } = setup()
  for (const [from, to] of [
    [local, remote],
    [remote, local],
  ]) {
    const buffer = new ArrayBuffer(4)
    new Uint8Array(buffer).set([1, 2, 3, 4])
    const value: any = { a: new Uint8Array(buffer), b: new DataView(buffer) }
    value.map = new Map([[value, new Set([buffer])]])
    value.self = value
    expect(getTransferrables(value)).toEqual([buffer])
    const response = receive(to)
    from.postMessage(value, getTransferrables(value))
    expect(buffer.byteLength).toBe(0)
    const received = await response
    expect([...received.a]).toEqual([1, 2, 3, 4])
    expect(received.a.buffer).toBe(received.b.buffer)
    expect(received.self).toBe(received)
    expect(received.map.get(received)).toEqual(new Set([received.a.buffer]))
  }
})

test('recursively proxies transferred direct renderer ports and records them once as visual connections', async () => {
  const records: ProxyMessage[] = []
  const { local, remote } = setup((data) => {
    records.push({ ...data, message: { ...data.message } })
  })
  const { port1, port2 } = new MessageChannel()
  cleanups.push(() => port1.close())
  const response = receive(remote)
  local.postMessage({ method: 'HandleMessagePort.handleMessagePort', params: [port2, 'Explorer', port2] }, [port2])
  const result = await response
  const rendererPort = result.params[0]
  expect(result.params[2]).toBe(rendererPort)
  cleanups.push(() => rendererPort.close())
  const rendered = receive(rendererPort)
  port1.postMessage({ id: 1, method: 'Viewlet.queueCommands', params: [4, []] })
  expect(await rendered).toEqual({ id: 1, method: 'Viewlet.queueCommands', params: [4, []] })
  const acknowledged = receive(port1)
  rendererPort.postMessage({ id: 1, result: 12 })
  expect(await acknowledged).toEqual({ id: 1, result: 12 })
  expect(records.filter((entry) => entry.message.method === 'Viewlet.queueCommands')).toHaveLength(1)
  expect(records.at(-1)?.renderer).toBe(true)
  expect(records.at(-1)?.connection).not.toBe(records[0].connection)
})

test('recording failures and excluded replay exports do not block forwarding', async () => {
  const recorded: unknown[] = []
  const { local, remote } = setup((data) => {
    recorded.push(data)
    throw new Error('quota')
  })
  const first = receive(remote)
  local.postMessage({ id: 1, method: 'test' })
  expect(await first).toEqual({ id: 1, method: 'test' })
  const request = receive(remote)
  local.postMessage({ id: 2, method: 'SessionReplay.getSession' })
  await request
  const response = receive(local)
  remote.postMessage({ id: 2, result: { events: [] } })
  expect(await response).toEqual({ id: 2, result: { events: [] } })
  expect(recorded).toHaveLength(1)
})

test('redacts virtual password fields, masked descendants and subsequent property patches', () => {
  const serialize = createMessageSerializer()
  const initial = {
    method: 'Viewlet.setDom2',
    params: [
      1,
      [
        { childCount: 2, type: 4 },
        { inputType: 'password', type: 6, value: 'password-value' },
        { childCount: 1, 'data-session-replay-mask': '', type: 4 },
        { text: 'private-text', type: 12 },
      ],
    ],
  }
  expect(JSON.stringify(serialize(initial))).not.toMatch(/password-value|private-text/)
  expect(initial.params[1]).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'password-value' })]))
  expect(serialize({ method: 'Viewlet.setValueByName', params: [1, 'password', 'new-private-value'] })).toEqual({
    method: 'Viewlet.setValueByName',
    params: [1, 'password', '[redacted]'],
  })
  expect(JSON.stringify(serialize({ method: 'Viewlet.setTreePatches', params: [1, [{ type: 1, value: 'new-private-text' }]] }))).not.toContain(
    'new-private-text',
  )
})

test('preserves repeated virtual DOM objects in recorded command data', () => {
  const serialize = createMessageSerializer()
  const text = { text: 'repeated', type: 12 }
  expect(serialize([text, text])).toEqual([text, text])
})

test('masked and ignored virtual nodes do not retain attribute or textContent secrets', () => {
  const serialize = createMessageSerializer()
  for (const marker of ['data-session-replay-mask', 'data-session-replay-ignore']) {
    const nodes = [
      { childCount: 1, [marker]: 'private-marker', textContent: 'private-content', title: 'private-title', type: 4 },
      { inputType: 'text', name: 'private-name', placeholder: 'private-placeholder', type: 6, value: 'private-value' },
    ]
    const result = serialize({ method: 'Viewlet.setDom2', params: [1, nodes] })
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(result).toEqual({
      method: 'Viewlet.setDom2',
      params: [
        1,
        [
          { childCount: 1, [marker]: '', textContent: '[redacted]', type: 4 },
          { type: 6, value: '[redacted]' },
        ],
      ],
    })
    expect(nodes[0].title).toBe('private-title')
    expect(
      JSON.stringify(serialize({ method: 'Viewlet.setTreePatches', params: [1, [{ key: 'title', type: 3, value: 'private-update' }]] })),
    ).not.toContain('private-')
  }
})

test('excluded replies preserve id types and are consumed only once', async () => {
  const recorded: ProxyMessage[] = []
  const { local, remote } = setup((data) => {
    recorded.push(data)
  })
  for (const id of [1, '1', '__proto__']) {
    const request = receive(remote)
    local.postMessage({ id, method: 'SessionReplay.getSession' })
    await request
  }
  for (const id of ['1', 1, '__proto__', 1]) {
    const response = receive(local)
    remote.postMessage({ id, result: 'reply' })
    await response
  }
  expect(recorded.map((entry) => entry.message)).toEqual([{ id: 1, result: 'reply' }])
})
