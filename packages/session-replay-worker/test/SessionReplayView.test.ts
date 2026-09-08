// cspell:ignore valuetext
import { expect, test } from '@jest/globals'
import type { Frame, ReplayNode } from '../src/parts/Types/Types.ts'
import type { TimelinePoint } from '../src/parts/ViewEvent/ViewEvent.ts'
import { dispatch } from '../src/parts/CommandMap/CommandMap.ts'
import { create } from '../src/parts/Create/Create.ts'
import { loadContent } from '../src/parts/LoadContent/LoadContent.ts'
import { render } from '../src/parts/Render/Render.ts'
import { createSessionReplayView } from '../src/parts/SessionReplayView/SessionReplayView.ts'

const frame: Frame = { dom: { attrs: { onclick: 'unsafe()' }, children: [{ text: 'start' }], tag: 'main' }, styles: [], viewport: [800, 600] }
const session = {
  events: [
    { data: frame, sequence: 0, timestamp: 0, type: 'frame' },
    { data: { ...frame, dom: { text: 'end' } }, sequence: 1, timestamp: 1000, type: 'frame' },
  ],
  version: 1,
}
const point: TimelinePoint = {
  left: 10,
  pointerId: 1,
  pointerType: 'mouse',
  slider: false,
  top: 500,
  width: 200,
  windowWidth: 320,
  x: 110,
}
const loaded = (): ReturnType<typeof loadContent> => loadContent(create(1), session)
const find = (node: ReplayNode, className: string): ReplayNode | undefined => {
  if (node.attrs?.class === className) return node
  const children = node.children || []
  for (const child of children) {
    const found = find(child, className)
    if (found) return found
  }
  return undefined
}
const view = (): ReturnType<typeof createSessionReplayView> =>
  createSessionReplayView(async () => {
    throw new Error('Storage unavailable')
  })

test('create and loadContent produce independent view states without browser globals', () => {
  const initial = Object.freeze(create(1, false))
  const next = loadContent(initial, session)
  expect(initial).toMatchObject({ duration: 0, position: 0, previewEnabled: false })
  expect(initial.content).toBeUndefined()
  expect(next).toMatchObject({ duration: 1000, playing: false, position: 0, previewEnabled: false, uid: 1 })
  expect(next.frame).toEqual(frame)
})

test('playing seeks retain playback and reset the origin for the next tick', () => {
  const initial = Object.freeze(loaded())
  const playing = dispatch(initial, { now: 100, type: 'togglePlay' })
  const forward = dispatch(playing, { now: 150, position: 750, type: 'seek' })
  const ticked = dispatch(forward, { now: 200, type: 'tick' })
  const backward = dispatch(ticked, { now: 210, position: 250, type: 'seek' })
  expect(dispatch(backward, { now: 260, type: 'tick' })).toMatchObject({ playing: true, position: 300 })
  expect(ticked).toMatchObject({ playing: true, position: 800 })
  expect(initial).toMatchObject({ playing: false, position: 0 })
})

test('pause ignores ticks, reaching the end stops playback, and play restarts it', () => {
  const initial = loaded()
  const playing = dispatch(initial, { now: 0, type: 'togglePlay' })
  const paused = dispatch(playing, { now: 20, type: 'togglePlay' })
  expect(dispatch(paused, { now: 100, type: 'tick' })).toBe(paused)
  const end = dispatch(playing, { now: 1100, type: 'tick' })
  expect(end).toMatchObject({ playing: false, position: 1000 })
  expect(dispatch(end, { now: 1200, type: 'togglePlay' })).toMatchObject({ origin: 1200, playing: true, position: 0 })
})

test('drag state clamps seeking and ignores other pointers and moves after cancellation', () => {
  const start = dispatch(loaded(), { now: 0, point, type: 'pointerDown' })
  expect(start).toMatchObject({ playing: false, pointerId: 1, position: 500 })
  expect(dispatch(start, { now: 10, point: { ...point, pointerId: 2, x: 300 }, type: 'pointerMove' })).toBe(start)
  const end = dispatch(start, { now: 10, point: { ...point, x: 300 }, type: 'pointerMove' })
  expect(end.position).toBe(1000)
  const released = dispatch(end, { pointerId: 1, type: 'pointerUp' })
  expect(dispatch(released, { now: 20, point, type: 'pointerMove' })).toBe(released)
})

test('preview has an independent cursor and disabling clears it without changing playback', () => {
  const playing = dispatch(loaded(), { now: 0, type: 'togglePlay' })
  const preview = dispatch(playing, { point: { ...point, x: 210 }, type: 'preview' })
  expect(preview).toMatchObject({ playing: true, position: 0, preview: { position: 1000 } })
  expect(preview.frame).toEqual(frame)
  const disabled = dispatch(preview, { enabled: false, type: 'setPreviewEnabled' })
  expect(disabled.preview).toBeUndefined()
  expect(dispatch(disabled, { point, type: 'preview' })).toBe(disabled)
  expect(dispatch(playing, { point: { ...point, pointerType: 'touch' }, type: 'preview' })).toBe(playing)
})

test('render produces cloneable virtual DOM, accessible controls, and sanitized frames', () => {
  const initial = create(1)
  const next = dispatch(loaded(), { now: 0, position: 500, type: 'seek' })
  const result = render(initial, next)
  expect(structuredClone(result)).toEqual(result)
  expect(find(result.dom, 'SessionReplayPlay')?.attrs).toMatchObject({ 'aria-label': 'Play' })
  expect(find(result.dom, 'SessionReplayPosition')).toMatchObject({
    attrs: { 'aria-valuetext': '0.5 / 1.0 s', style: '--replay-progress:50%' },
    value: '500',
  })
  expect(result.frame?.dom.attrs).not.toHaveProperty('onclick')
  expect(render(next, next).frame).toBeUndefined()
})

test('an empty or invalid recording renders disabled controls and a worker error', async () => {
  const runtime = view()
  runtime.create(1, true)
  const result = await runtime.loadContent(1, { session: { events: [], version: 1 } })
  expect(find(result.dom, 'SessionReplayPlay')?.attrs).toHaveProperty('disabled')
  expect(find(result.dom, 'SessionReplayTime')).toMatchObject({ attrs: { role: 'alert' }, children: [{ text: 'This session has no visual frames' }] })
  expect(result.delay).toBeUndefined()
})

test('views keep independent state, ignore stale requests, and release state on dispose', async () => {
  const runtime = view()
  runtime.create(1, true)
  runtime.create(2, false)
  await runtime.loadContent(1, { session })
  await runtime.loadContent(2, { session })
  runtime.dispatch(1, { now: 0, position: 500, type: 'seek' }, 2)
  const stale = runtime.dispatch(1, { now: 0, position: 1000, type: 'seek' }, 1)
  expect(find(stale.dom, 'SessionReplayPosition')?.value).toBe('500')
  expect(find(runtime.render(2).dom, 'SessionReplayPosition')?.value).toBe('0')
  runtime.dispose(1)
  expect(() => runtime.render(1)).toThrow('Unknown session replay view')
  expect(runtime.render(2).previewEnabled).toBe(false)
})

test('a late preview cannot reopen a dismissed preview', async () => {
  const runtime = view()
  runtime.create(1, true)
  await runtime.loadContent(1, { session })
  runtime.dispatch(1, { type: 'hidePreview' }, 2)
  expect(runtime.dispatch(1, { point, type: 'preview' }, 1).preview).toBeUndefined()
})

test('a zero-duration recording never schedules playback ticks', () => {
  const initial = loadContent(create(1), { ...session, events: [session.events[0]] })
  const next = dispatch(initial, { now: 10, type: 'togglePlay' })
  expect(next).toMatchObject({ playing: false, position: 0 })
  expect(render(initial, next).delay).toBeUndefined()
})
