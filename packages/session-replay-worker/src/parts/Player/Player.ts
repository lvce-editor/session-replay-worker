import type { PlayerOptions } from '../Types/Types.ts'
import type { TimelinePoint, ViewEvent } from '../ViewEvent/ViewEvent.ts'
import type { ViewRender } from '../ViewRender/ViewRender.ts'
import { createClient } from '../Client/Client.ts'
import { disposeFrame, renderPreparedFrame } from '../RenderFrame/RenderFrame.ts'
import { createDomRenderer } from '../ReplayDom/ReplayDom.ts'
import { createTimelinePreview } from '../TimelinePreview/TimelinePreview.ts'
export { renderFrame } from '../RenderFrame/RenderFrame.ts'

const settingKey = 'sessionReplay.timelinePreviewEnabled'

export const mountPlayer = async (
  container: HTMLElement,
  { assetBaseUrl, source, timelinePreviewEnabled, workerUrl }: PlayerOptions,
): Promise<() => void> => {
  const { ownerDocument } = container
  const assets = assetBaseUrl ? new URL(assetBaseUrl, ownerDocument.baseURI) : undefined
  if (
    assets &&
    (assets.origin !== new URL(ownerDocument.baseURI).origin ||
      !/^https?:$/.test(assets.protocol) ||
      !/^[\w/.-]+$/.test(assets.pathname) ||
      assets.username ||
      assets.password)
  )
    throw new Error('Replay assets must be served from the same origin')
  if (assets) {
    assets.search = assets.hash = ''
    if (!assets.pathname.endsWith('/')) assets.pathname += '/'
  }
  const client = createClient(workerUrl)
  const document = ownerDocument
  const view = document.defaultView!
  let enabled = timelinePreviewEnabled ?? true
  if (timelinePreviewEnabled === undefined) {
    try {
      enabled = view.localStorage.getItem(settingKey) !== 'false'
    } catch {
      /* Storage may be unavailable in embedded players. */
    }
  }
  container.replaceChildren()
  const setDom = createDomRenderer(container)
  let preview: ReturnType<typeof createTimelinePreview> | undefined
  let disposed = false
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let previewsEnabled = enabled
  const apply = (result: ViewRender): void => {
    if (disposed) return
    setDom(result.dom)
    if (result.frame) renderPreparedFrame(container.querySelector<HTMLElement>('.SessionReplaySurface')!, result.frame)
    previewsEnabled = result.previewEnabled
    preview ||= createTimelinePreview(container)
    preview.render(result.preview, result.previewEnabled)
    if (result.delay === undefined) {
      clearTimeout(timer)
      timer = undefined
    } else if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined
        void send({ now: performance.now(), type: 'tick' })
      }, result.delay)
    }
  }
  const report = (error: unknown): void => {
    if (disposed) return
    clearTimeout(timer)
    timer = undefined
    const status = container.querySelector('output') || document.createElement('output')
    if (!status.parentNode) container.append(status)
    status.setAttribute('role', 'alert')
    status.setAttribute('aria-live', 'assertive')
    status.textContent = error instanceof Error ? error.message : String(error)
  }
  const send = async (event: ViewEvent): Promise<void> => {
    if (disposed) return
    try {
      apply(await client.invoke('SessionReplay.dispatch', 1, event, ++sequence))
    } catch (error) {
      report(error)
    }
  }
  try {
    apply(await client.invoke('SessionReplay.create', 1, enabled, assets?.href))
    apply(await client.invoke('SessionReplay.loadContent', 1, source))
  } catch (error) {
    report(error)
  }
  if (!container.querySelector('.SessionReplayPosition')) {
    client.dispose()
    return () => container.replaceChildren()
  }
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  let pendingPreview: TimelinePoint | undefined
  let previewBusy = false
  let previewGeneration = 0
  const surface = container.querySelector<HTMLElement>('.SessionReplaySurface')!
  const slider = container.querySelector<HTMLInputElement>('.SessionReplayPosition')!
  const chart = container.querySelector<SVGSVGElement>('.SessionReplayActivity')!
  const play = container.querySelector<HTMLButtonElement>('.SessionReplayPlay')!
  const checkbox = container.querySelector<HTMLInputElement>('[type="checkbox"]')!
  const seek = (event: ViewEvent): void => {
    clearTimeout(timer)
    timer = undefined
    void send(event)
  }
  play.onclick = (): void => seek({ now: performance.now(), type: 'togglePlay' })
  slider.oninput = (): void => seek({ now: performance.now(), position: Number(slider.value), type: 'seek' })
  const point = (event: PointerEvent): TimelinePoint => {
    const target = event.currentTarget as Element
    const bounds = target.getBoundingClientRect()
    return {
      left: bounds.left,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      slider: target === slider,
      top: chart.getBoundingClientRect().top,
      width: bounds.width,
      windowWidth: view.innerWidth,
      x: event.clientX,
    }
  }
  chart.onpointerdown = (event): void => {
    if (event.button !== 0 || !event.isPrimary || slider.disabled) return
    event.preventDefault()
    chart.setPointerCapture(event.pointerId)
    slider.focus()
    seek({ now: performance.now(), point: point(event), type: 'pointerDown' })
  }
  chart.onpointermove = (event): void => {
    if (chart.hasPointerCapture(event.pointerId)) seek({ now: performance.now(), point: point(event), type: 'pointerMove' })
  }
  const endDrag = (event: PointerEvent): void => {
    if (chart.hasPointerCapture(event.pointerId)) chart.releasePointerCapture(event.pointerId)
    void send({ pointerId: event.pointerId, type: 'pointerUp' })
  }
  chart.onpointerup = endDrag
  chart.onpointercancel = endDrag
  chart.onlostpointercapture = endDrag
  const updatePreview = async (): Promise<void> => {
    previewTimer = undefined
    if (!pendingPreview || previewBusy || disposed) return
    const event = { point: pendingPreview, type: 'preview' } as const
    pendingPreview = undefined
    previewBusy = true
    const generation = previewGeneration
    const id = ++sequence
    try {
      const result = await client.invoke('SessionReplay.dispatch', 1, event, id)
      if (!disposed && generation === previewGeneration) apply(result)
    } catch {
      /* Preview errors must not interrupt playback. */
    } finally {
      previewBusy = false
      if (pendingPreview && !disposed) previewTimer = setTimeout(() => void updatePreview(), 60)
    }
  }
  const hover = (event: PointerEvent): void => {
    if (!previewsEnabled || slider.disabled || event.pointerType === 'touch') return
    previewGeneration++
    pendingPreview = point(event)
    if (!previewBusy && previewTimer === undefined) previewTimer = setTimeout(() => void updatePreview(), 60)
  }
  const hide = (): void => {
    previewGeneration++
    pendingPreview = undefined
    clearTimeout(previewTimer)
    previewTimer = undefined
    void send({ type: 'hidePreview' })
  }
  for (const target of [slider, chart]) {
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
    const enabled = checkbox.checked
    void send({ enabled, type: 'setPreviewEnabled' })
    try {
      view.localStorage.setItem(settingKey, String(enabled))
    } catch {
      /* The setting still works without storage. */
    }
  }
  return () => {
    disposed = true
    clearTimeout(timer)
    clearTimeout(previewTimer)
    pendingPreview = undefined
    view.removeEventListener('resize', hide)
    view.removeEventListener('blur', hide)
    document.removeEventListener('keydown', keydown)
    preview?.dispose()
    client.dispose()
    disposeFrame(surface)
    container.replaceChildren()
  }
}
