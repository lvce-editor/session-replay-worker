import { expect, test } from '@jest/globals'
import type { ProxyMessage } from '../src/parts/Proxy/Proxy.ts'
import { createReplayMessageFilter } from '../src/parts/FilterReplayMessage/FilterReplayMessage.ts'
import { loadContent } from '../src/parts/Protocol/Protocol.ts'

const message = (method: string, params: unknown[] = []): ProxyMessage => ({
  connection: 1,
  direction: 'to-renderer',
  label: 'renderer',
  message: { method, params },
  renderer: true,
})

test('only visual renderer commands and transaction replies are recorded', () => {
  const accept = createReplayMessageFilter()
  expect(accept(message('Viewlet.setDom2'))).toBe(true)
  expect(accept(message('Css.addCssStyleSheet'))).toBe(true)
  expect(accept(message('Preferences.get'))).toBe(false)
  expect(accept(message('Viewlet.registerEventListeners'))).toBe(false)
  expect(accept({ ...message('Viewlet.setDom2'), renderer: false })).toBe(false)
  expect(accept({ ...message('Viewlet.setDom2'), direction: 'from-renderer' })).toBe(false)
})

test('queued DOM commands still replay after filtering unrelated traffic and colliding reply ids', () => {
  const accept = createReplayMessageFilter()
  const queue = message('Viewlet.queueCommands', [1, [['Viewlet.setDom2', 1, [{ childCount: 0, text: 'committed', type: 12 }]]]])
  queue.message.id = 3
  const reply: ProxyMessage = { ...message(''), direction: 'from-renderer', message: { id: 3, result: 91 } }
  const candidates = [
    message('Viewlet.create', ['Editor', 1]),
    message('Viewlet.appendToBody', [1]),
    queue,
    { ...reply, connection: 2 },
    { ...reply, message: { id: '3', result: 99 } },
    reply,
    reply,
    message('Viewlet.sendMultiple', [[['Viewlet.commitPending', 1, 91]]]),
  ]
  const selected = candidates.filter(accept)
  expect(selected).toHaveLength(5)
  const content = loadContent({
    events: [
      {
        data: { commandReplay: true, dom: { children: [], tag: 'body' }, styles: [], viewport: [800, 600] },
        sequence: 0,
        timestamp: 0,
        type: 'frame',
      },
      ...selected.map((data, index) => ({ data, sequence: index + 1, timestamp: index + 1, type: 'message' })),
    ],
    version: 1,
  })
  expect(JSON.stringify(content.seek(5).frame.dom)).toContain('committed')
  expect(JSON.stringify(content.seek(0).frame.dom)).not.toContain('committed')
})
