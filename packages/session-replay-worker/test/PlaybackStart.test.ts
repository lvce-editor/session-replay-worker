import { expect, test } from '@jest/globals'
import { VirtualDomElements as V } from '@lvce-editor/constants'
import type { Frame, ReplayEvent } from '../src/parts/Types/Types.ts'
import { loadContent } from '../src/parts/Protocol/Protocol.ts'

const initial: Frame = { commandReplay: true, dom: { children: [], tag: 'body' }, styles: [], viewport: [800, 600] }
const message = (sequence: number, timestamp: number, method: string, ...params: any[]): ReplayEvent => ({
  data: { connection: 1, direction: 'to-renderer', message: { method, params }, renderer: true },
  sequence,
  timestamp,
  type: 'message',
})
const startup = (): ReplayEvent[] => [
  { data: initial, sequence: 0, timestamp: 0, type: 'frame' },
  message(1, 100, 'Css.addCssStyleSheet', 1, '.Workbench{background:#203747}'),
  message(2, 200, 'Viewlet.createFunctionalRoot', 'Layout', 1, true),
  message(3, 300, 'Viewlet.setDom2', 1, [
    { childCount: 1, className: 'Workbench', id: 'Workbench', type: V.Div },
    { childCount: 1, className: 'Editor', type: V.Div },
    { text: 'first editor paint', type: V.Text },
  ]),
  message(4, 1000, 'Viewlet.executeCommands', [['Viewlet.appendToBody', 1]]),
  message(5, 1500, 'Viewlet.setProperty', 1, '.Editor', 'textContent', 'edited'),
]

test('playback zero starts at the assembled editor and preserves startup commands when seeking', () => {
  const events = startup()
  const original = structuredClone(events)
  const content = loadContent({ events, version: 1 })
  expect(content.seek(0).frame.dom.children?.[0]?.attrs?.id).toBe('Workbench')
  expect(content.seek(0).frame.styles).toEqual(['.Workbench{background:#203747}'])
  expect(content.duration).toBe(500)
  expect(JSON.stringify(content.seek(499).frame.dom)).toContain('first editor paint')
  expect(JSON.stringify(content.seek(500).frame.dom)).toContain('edited')
  expect(JSON.stringify(content.seek(0).frame.dom)).toContain('first editor paint')
  expect(content.preview(0)).toEqual(content.seek(0))
  expect(content.seek(500).position).toBe(500)
  expect(content.activity).toEqual([0, 1])
  expect(events).toEqual(original)
})

test('snapshot recordings skip empty workbenches and retain later frame timing', () => {
  const empty: Frame = { ...initial, commandReplay: false, dom: { attrs: { id: 'Workbench' }, children: [], tag: 'div' } }
  const ready: Frame = { ...empty, dom: { ...empty.dom, children: [{ tag: 'div', text: 'editor ready' }] } }
  const edited: Frame = { ...ready, dom: { ...ready.dom, children: [{ tag: 'div', text: 'edited' }] } }
  const content = loadContent({
    events: [
      { data: {}, sequence: 0, timestamp: 0, type: 'message' },
      { data: empty, sequence: 1, timestamp: 100, type: 'frame' },
      { data: ready, sequence: 2, timestamp: 1000, type: 'frame' },
      { data: edited, sequence: 3, timestamp: 1500, type: 'frame' },
    ],
    version: 1,
  })
  expect(content.seek(0)).toEqual({ duration: 500, frame: ready, position: 0 })
  expect(content.seek(499).frame).toEqual(ready)
  expect(content.preview(500).frame).toEqual(edited)
  expect(content.seek(0).frame).toEqual(ready)
  expect(content.activity).toEqual([0, 1])
})

test('recordings ending at the first editor paint have zero duration', () => {
  const content = loadContent({ events: startup().slice(0, -1), version: 1 })
  expect(content.duration).toBe(0)
  expect(content.seek(1000).position).toBe(0)
  expect(JSON.stringify(content.seek(0).frame.dom)).toContain('first editor paint')
  expect(content.activity).toEqual([0])
})

test('recordings without a complete workbench retain their original timeline', () => {
  const events = startup().slice(0, 4)
  const content = loadContent({ events, version: 1 })
  expect(content.duration).toBe(300)
  expect(content.seek(0).frame.dom.children).toEqual([])
})

test('an already painted workbench starts immediately', () => {
  const frame = loadContent({ events: startup(), version: 1 }).seek(0).frame
  const content = loadContent({
    events: [
      { data: frame, sequence: 0, timestamp: 0, type: 'frame' },
      message(1, 500, 'Css.addCssStyleSheet', 2, '.Editor{color:red}'),
    ],
    version: 1,
  })
  expect(content.duration).toBe(500)
  expect(content.seek(0).frame.dom).toEqual(frame.dom)
})
