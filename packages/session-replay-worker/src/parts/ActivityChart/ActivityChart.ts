export const createActivityChart = (
  document: Document,
): {
  element: SVGSVGElement
  setActivity: (counts: readonly number[]) => void
  setPosition: (fraction: number) => void
} => {
  const namespace = 'http://www.w3.org/2000/svg'
  const element = document.createElementNS(namespace, 'svg')
  element.classList.add('SessionReplayActivity')
  element.setAttribute('viewBox', '0 0 240 48')
  element.setAttribute('preserveAspectRatio', 'none')
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', 'Session replay activity')
  const title = document.createElementNS(namespace, 'title')
  title.textContent = 'Recorded activity over time. Click or drag to seek, or use the position slider with the keyboard.'
  const path = document.createElementNS(namespace, 'path')
  const cursor = document.createElementNS(namespace, 'line')
  cursor.classList.add('SessionReplayActivityCursor')
  cursor.setAttribute('y1', '0')
  cursor.setAttribute('y2', '48')
  cursor.setAttribute('vector-effect', 'non-scaling-stroke')
  element.append(title, path, cursor)
  return {
    element,
    setActivity(counts): void {
      const maximum = Math.max(1, ...counts)
      const width = 240 / counts.length
      const segments = counts.map((count, index) => {
        if (!count) return ''
        const height = (count / maximum) * 44
        return `M${index * width} 48v-${height}h${width}v${height}z`
      })
      path.setAttribute('d', segments.join(' '))
    },
    setPosition(fraction): void {
      const x = String(fraction * 240)
      cursor.setAttribute('x1', x)
      cursor.setAttribute('x2', x)
    },
  }
}
