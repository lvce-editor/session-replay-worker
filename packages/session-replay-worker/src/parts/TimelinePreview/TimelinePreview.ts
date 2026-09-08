import type { ReplayClient, SeekResult } from '../Types/Types.ts'
import { disposeFrame, renderFrame } from '../RenderFrame/RenderFrame.ts'

const settingKey = 'sessionReplay.timelinePreviewEnabled'

export const createTimelinePreview = (
  container: HTMLElement,
  controls: HTMLElement,
  slider: HTMLInputElement,
  chart: SVGSVGElement,
  client: ReplayClient,
  getDuration: () => number,
  assetBaseUrl?: string,
  enabled?: boolean,
): { dispose: () => void } => {
  const document = container.ownerDocument
  const view = document.defaultView!
  const label = document.createElement('label')
  label.className = 'SessionReplayPreviewSetting'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = enabled ?? true
  if (enabled === undefined) {
    try {
      checkbox.checked = view.localStorage.getItem(settingKey) !== 'false'
    } catch {
      // The setting still works for this player when storage is unavailable.
    }
  }
  label.append(checkbox, document.createTextNode('Timeline previews'))
  controls.append(label)
  const popup = document.createElement('div')
  popup.className = 'SessionReplayPreview'
  popup.hidden = true
  popup.inert = true
  popup.setAttribute('aria-hidden', 'true')
  const image = document.createElement('div')
  image.className = 'SessionReplayPreviewImage'
  const time = document.createElement('div')
  time.className = 'SessionReplayPreviewTime'
  popup.append(image, time)
  container.append(popup)
  let frame: HTMLIFrameElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { timestamp: number; x: number; y: number } | undefined
  let requestId = 0
  let busy = false
  let disposed = false
  const hide = (): void => {
    requestId++
    pending = undefined
    clearTimeout(timer)
    timer = undefined
    popup.hidden = true
  }
  const removeFrame = (): void => {
    if (frame?.contentDocument) disposeFrame(frame.contentDocument)
    frame?.remove()
    frame = undefined
  }
  const show = (result: SeekResult, x: number, y: number): void => {
    if (!frame) {
      frame = document.createElement('iframe')
      frame.title = 'Session replay preview'
      frame.tabIndex = -1
      // Reuse the virtual DOM renderer in a separate document so root selectors,
      // theme variables and viewport media queries cannot affect the main replay.
      frame.setAttribute('sandbox', 'allow-same-origin')
      image.append(frame)
    }
    const [width, height] = result.frame.viewport.map((value) => Math.max(1, Math.min(16_384, value)))
    const scale = Math.min(280 / width, 158 / height, Math.max(1, view.innerWidth - 24) / width)
    frame.style.width = `${width}px`
    frame.style.height = `${height}px`
    frame.style.transform = `scale(${scale})`
    image.style.width = `${width * scale}px`
    image.style.height = `${height * scale}px`
    renderFrame(frame.contentDocument!, result.frame, assetBaseUrl)
    time.textContent = `${(result.position / 1000).toFixed(1)} s`
    popup.hidden = false
    const bounds = popup.getBoundingClientRect()
    popup.style.left = `${Math.max(8, Math.min(view.innerWidth - bounds.width - 8, x - bounds.width / 2))}px`
    popup.style.top = `${Math.max(8, y - bounds.height - 8)}px`
  }
  const update = async (): Promise<void> => {
    timer = undefined
    if (busy || !pending || disposed) return
    const point = pending
    pending = undefined
    const id = requestId
    busy = true
    try {
      const result = await client.invoke('preview', point.timestamp)
      if (!disposed && id === requestId) show(result, point.x, point.y)
    } catch {
      // An unavailable preview must not interrupt playback.
      if (id === requestId) popup.hidden = true
    } finally {
      busy = false
      if (pending && !disposed) timer = setTimeout(() => void update(), 60)
    }
  }
  const hover = (event: PointerEvent): void => {
    if (!checkbox.checked || slider.disabled || event.pointerType === 'touch') return
    const target = event.currentTarget as Element
    const bounds = target.getBoundingClientRect()
    const inset = target === slider ? 6.5 : 0
    const width = bounds.width - inset * 2
    if (width <= 0) return
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - inset) / width))
    requestId++
    pending = { timestamp: fraction * getDuration(), x: event.clientX, y: chart.getBoundingClientRect().top }
    if (!busy && timer === undefined) timer = setTimeout(() => void update(), 60)
  }
  const targets = [slider, chart]
  for (const target of targets) {
    target.addEventListener('pointermove', hover as EventListener)
    target.addEventListener('pointerleave', hide)
    target.addEventListener('pointercancel', hide)
  }
  const keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hide()
  }
  view.addEventListener('resize', hide)
  view.addEventListener('blur', hide)
  document.addEventListener('keydown', keydown)
  checkbox.onchange = (): void => {
    hide()
    if (!checkbox.checked) removeFrame()
    try {
      view.localStorage.setItem(settingKey, String(checkbox.checked))
    } catch {
      // Storage can be blocked in embedded players.
    }
  }
  return {
    dispose(): void {
      disposed = true
      hide()
      removeFrame()
      for (const target of targets) {
        target.removeEventListener('pointermove', hover as EventListener)
        target.removeEventListener('pointerleave', hide)
        target.removeEventListener('pointercancel', hide)
      }
      view.removeEventListener('resize', hide)
      view.removeEventListener('blur', hide)
      document.removeEventListener('keydown', keydown)
      label.remove()
      popup.remove()
    },
  }
}
