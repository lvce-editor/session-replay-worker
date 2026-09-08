import { expect, test } from '@jest/globals'
import { VirtualDomElements as V } from '@lvce-editor/constants'
import type { ProxyMessage, RpcMessage } from '../src/parts/Proxy/Proxy.ts'
import type { Frame, ReplayEvent } from '../src/parts/Types/Types.ts'
import { loadContent } from '../src/parts/Protocol/Protocol.ts'

const initial: Frame = { commandReplay: true, dom: { children: [], tag: 'body' }, styles: [], viewport: [800, 600] }
const dom = (text: string): any[] => [
  { childCount: 1, className: 'Editor', type: V.Div },
  { text, type: V.Text },
]
const message = (method: string, ...params: any[]): RpcMessage => ({ method, params })
const session = (messages: (RpcMessage | ProxyMessage)[]): { version: number; events: ReplayEvent[] } => ({
  events: [
    { data: initial, sequence: 0, timestamp: 0, type: 'frame' },
    ...messages.map((entry, index) => ({
      data: 'connection' in entry ? entry : { connection: 1, direction: 'to-renderer', message: entry, renderer: true },
      sequence: index + 1,
      timestamp: (index + 1) * 100,
      type: 'message',
    })),
  ] as ReplayEvent[],
  version: 1,
})
const setup = [
  message('Viewlet.createFunctionalRoot', 'Editor', 1, true),
  message('Viewlet.setDom2', 1, dom('before')),
  message('Viewlet.appendToBody', 1),
]

test('rebuilds command recordings and seeks backwards through tree patches, styles and removal', () => {
  const content = loadContent(
    session([
      ...setup,
      message('Css.addCssStyleSheet', 1, '.Editor{color:red}'),
      message('Viewlet.setTreePatches', 1, [
        { index: 0, type: 7 },
        { type: 1, value: 'after' },
      ]),
      message('Viewlet.dispose', 1),
    ]),
  )
  expect(content.seek(300).frame.dom.children?.[0].children).toEqual([{ text: 'before' }])
  expect(content.seek(500).frame.dom.children?.[0].children).toEqual([{ text: 'after' }])
  expect(content.seek(500).frame.styles).toEqual(['.Editor{color:red}'])
  expect(content.seek(600).frame.dom.children).toEqual([])
  expect(content.seek(350).frame.dom.children?.[0].children).toEqual([{ text: 'before' }])
  expect(content.seek(0).frame.dom.children).toEqual([])
})

test('correlates direct-worker queue replies and renders only committed transactions', () => {
  const content = loadContent(
    session([
      ...setup,
      {
        connection: 2,
        direction: 'to-renderer',
        label: 'direct',
        message: { id: 3, method: 'Viewlet.queueCommands', params: [1, [['Viewlet.setDom2', 1, dom('committed')]]] },
        renderer: true,
      },
      { connection: 2, direction: 'from-renderer', label: 'direct', message: { id: 3, result: 91 }, renderer: true },
      message('Viewlet.sendMultiple', [['Viewlet.commitPending', 1, 91]]),
    ]),
  )
  expect(content.seek(500).frame.dom.children?.[0].children).toEqual([{ text: 'before' }])
  expect(content.seek(600).frame.dom.children?.[0].children).toEqual([{ text: 'committed' }])
  expect(content.seek(500).frame.dom.children?.[0].children).toEqual([{ text: 'before' }])
})

test('replaces component references and keeps later patches attached to their current root', () => {
  const child = dom('child')
  const replacement = dom('replaced')
  const content = loadContent(
    session([
      ...setup,
      message('Viewlet.createFunctionalRoot', 'Child', 2, true),
      message('Viewlet.setDom2', 2, child),
      message('Viewlet.setDom2', 1, [
        { childCount: 1, type: V.Div },
        { type: V.Reference, uid: 2 },
      ]),
      message('Viewlet.setTreePatches', 2, [{ nodes: replacement, type: 2 }]),
      message('Viewlet.setTreePatches', 2, [
        { index: 0, type: 7 },
        { type: 1, value: 'latest' },
      ]),
    ]),
  )
  expect(content.seek(800).frame.dom.children?.[0].children?.[0].children).toEqual([{ text: 'latest' }])
})

test('restores input properties, empty child lists and patched CSS', () => {
  const content = loadContent(
    session([
      ...setup,
      message('Viewlet.setDom2', 1, [
        { childCount: 1, type: V.Div },
        { inputType: 'text', name: 'address', type: V.Input },
      ]),
      message('Viewlet.setValueByName', 1, 'address', 'edited'),
      message('Css.addCssStyleSheet', 1, 'abc'),
      message('Viewlet.patchCss', 1, 1, 1, 'XYZ'),
      message('Viewlet.replaceChildren', 1, []),
    ]),
  )
  expect(content.seek(500).frame.dom.children?.[0].children?.[0].value).toBe('edited')
  expect(content.seek(700).frame.styles).toEqual(['aXYZc'])
  expect(content.seek(800).frame.dom.children?.[0].children).toEqual([])
})

test('ignores arbitrary application commands and diagnostic worker messages', () => {
  const content = loadContent(
    session([
      ...setup,
      message('Window.close'),
      message('__proto__', 'unexpected'),
      { connection: 2, direction: 'to-renderer', label: 'worker', message: message('Viewlet.dispose', 1), renderer: false },
    ]),
  )
  expect(content.seek(600).frame.dom.children).toHaveLength(1)
})

test('compact navigation patches keep editor references attached while updating their surrounding tabs', () => {
  const content = loadContent(
    session([
      ...setup,
      message('Viewlet.createFunctionalRoot', 'Main', 2, true),
      message('Viewlet.setDom2', 2, [
        { childCount: 2, className: 'Main', type: V.Div },
        { childCount: 1, className: 'Header', type: V.Div },
        { text: 'tab', type: V.Text },
        { type: V.Reference, uid: 1 },
      ]),
      message('Viewlet.appendToBody', 2),
      message('Viewlet.setTreePatches', 2, [
        { navigations: [7, 0, 7, 0], type: 18 },
        { nodes: [{ text: 'updated tab', type: V.Text }], type: 2 },
        { navigations: [8, 0, 10, 1], type: 18 },
        { key: 'translate', type: 3, value: '20px 0px' },
      ]),
      message('Viewlet.setTreePatches', 1, [
        { navigations: [7, 0], type: 18 },
        { type: 1, value: 'editor edit' },
      ]),
    ]),
  )
  const main = content.seek(800).frame.dom.children?.[0]
  expect(main?.attrs?.class).toBe('Main')
  expect(main?.children?.[0].children).toEqual([{ text: 'updated tab' }])
  expect(main?.children?.[1].children).toEqual([{ text: 'editor edit' }])
  expect(main?.children?.[1].attrs?.style).toBe('translate:20px 0px')
  expect(content.seek(600).frame.dom.children?.[0].children?.[1].children).toEqual([{ text: 'before' }])
})

test('compact navigation can append a referenced view through a placeholder', () => {
  const content = loadContent(
    session([
      ...setup,
      message('Viewlet.createFunctionalRoot', 'Main', 2, true),
      message('Viewlet.setDom2', 2, [{ childCount: 0, className: 'Main', type: V.Div }]),
      message('Viewlet.appendToBody', 2),
      message('Viewlet.setTreePatches', 2, [
        { navigations: [7, 0], type: 18 },
        { type: 11, uid: 1 },
      ]),
    ]),
  )
  expect(content.seek(700).frame.dom.children?.[0].children?.[0].children).toEqual([{ text: 'before' }])
})

test('preserves stylesheet insertion order and distinct numeric, string and prototype-like ids', () => {
  const content = loadContent(
    session([
      message('Css.addCssStyleSheet', 20, 'first'),
      message('Css.addCssStyleSheet', 3, 'second'),
      message('Css.addCssStyleSheet', '20', 'string'),
      message('Css.addCssStyleSheet', '__proto__', 'prototype'),
      message('Css.addCssStyleSheet', 20, 'updated'),
      message('Css.removeCssStyleSheet', 3),
      message('Css.addCssStyleSheet', 3, 'reinserted'),
      message('Viewlet.patchCss', '__proto__', 0, 5, 'safe-'),
    ]),
  )
  expect(content.seek(500).frame.styles).toEqual(['updated', 'second', 'string', 'prototype'])
  expect(content.seek(800).frame.styles).toEqual(['updated', 'string', 'safe-type', 'reinserted'])
})

test('commits transactions in arrival order even when transaction ids decrease', () => {
  const queued: ProxyMessage[] = [90, 2].flatMap((transaction, index) => [
    {
      connection: 2,
      direction: 'to-renderer' as const,
      label: 'direct',
      message: { id: index, method: 'Viewlet.queueCommands', params: [1, [['Viewlet.setDom2', 1, dom(String(transaction))]]] },
      renderer: true,
    },
    {
      connection: 2,
      direction: 'from-renderer' as const,
      label: 'direct',
      message: { id: index, result: transaction },
      renderer: true,
    },
  ])
  const content = loadContent(session([...setup, ...queued, message('Viewlet.commitPending', 1, 2), message('Viewlet.commitPending', 1, 90)]))
  expect(content.seek(800).frame.dom.children?.[0].children).toEqual([{ text: 'before' }])
  expect(content.seek(900).frame.dom.children?.[0].children).toEqual([{ text: '2' }])
})
