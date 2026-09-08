import type { ReplayEvent } from '../Types/Types.ts'

// Quarter-second buckets for short sessions, bounded for long recordings.
export const getActivity = (events: readonly ReplayEvent[], duration: number, start = 0): number[] => {
  const length = Math.max(1, Math.min(240, Math.ceil(duration / 250)))
  const counts = Array.from<number>({ length })
  counts.fill(0)
  if (duration <= 0) return counts
  let initialFrame = true
  for (const event of events) {
    if (event.type === 'frame' && initialFrame) {
      initialFrame = false
      continue
    }
    if (start > 0 && event.timestamp <= start) continue
    const index = Math.min(counts.length - 1, Math.floor(((event.timestamp - start) / duration) * counts.length))
    counts[index]++
  }
  return counts
}
