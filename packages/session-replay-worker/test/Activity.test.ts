import { expect, test } from '@jest/globals'
import type { Frame, ReplayEvent } from '../src/parts/Types/Types.ts'
import { loadContent } from '../src/parts/Protocol/Protocol.ts'

const frame: Frame = { dom: { tag: 'div' }, styles: [], viewport: [800, 600] }
const initial: ReplayEvent = { data: frame, sequence: 0, timestamp: 0, type: 'frame' }
const load = (events: ReplayEvent[]): ReturnType<typeof loadContent> => loadContent({ events, version: 1 })

test('activity preserves idle gaps and counts both frame and worker events', () => {
  const content = load([
    initial,
    { data: frame, sequence: 1, timestamp: 250, type: 'frame' },
    { data: {}, sequence: 2, timestamp: 300, type: 'message' },
    { data: {}, sequence: 3, timestamp: 1000, type: 'message' },
  ])
  expect(content.activity).toEqual([0, 2, 0, 1])
  expect(content.seek(0).duration).toBe(1000)
  expect(content.seek(1000)).not.toHaveProperty('activity')
})

test('a snapshot without elapsed time has a flat chart', () => {
  expect(load([initial]).activity).toEqual([0])
})

test('a delayed initial snapshot does not count as activity', () => {
  expect(load([{ ...initial, timestamp: 1000 }]).activity).toEqual([0, 0, 0, 0])
})

test('activity includes the exact endpoint and stays bounded for long sessions', () => {
  const content = load([initial, { data: {}, sequence: 1, timestamp: 86_400_000, type: 'message' }])
  expect(content.activity).toHaveLength(240)
  expect(content.activity.slice(0, -1).every((count) => count === 0)).toBe(true)
  expect(content.activity.at(-1)).toBe(1)
})

test('sub-millisecond recordings still have a finite activity bucket', () => {
  expect(load([initial, { data: {}, sequence: 1, timestamp: 0.1, type: 'message' }]).activity).toEqual([1])
})
