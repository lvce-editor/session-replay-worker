import type { ReplayNode } from '../Types/Types.ts'
import { element } from '../VirtualDom/VirtualDom.ts'

export const getActivityChart = (counts: readonly number[], fraction: number): ReplayNode => {
  const maximum = Math.max(1, ...counts)
  const width = 240 / counts.length
  const path = counts
    .map((count, index) => {
      if (!count) return ''
      const height = (count / maximum) * 44
      return `M${index * width} 48v-${height}h${width}v${height}z`
    })
    .join(' ')
  const x = String(fraction * 240)
  return element(
    'svg',
    { 'aria-label': 'Session replay activity', class: 'SessionReplayActivity', preserveAspectRatio: 'none', role: 'img', viewBox: '0 0 240 48' },
    [
      element('title', {}, [{ text: 'Recorded activity over time. Click or drag to seek, or use the position slider with the keyboard.' }], true),
      element('path', { d: path }, [], true),
      element('line', { class: 'SessionReplayActivityCursor', 'vector-effect': 'non-scaling-stroke', x1: x, x2: x, y1: '0', y2: '48' }, [], true),
    ],
    true,
  )
}
