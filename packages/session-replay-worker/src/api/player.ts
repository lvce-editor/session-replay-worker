import type { Frame, PlayerOptions, ReplayNode, SeekResult } from './types.ts'
import { createClient } from './client.ts'

const tags = new Set(
  'body div span p pre code main section article header footer nav aside h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tr td th button input textarea select option label form fieldset legend a img br hr strong em b i u s small details summary svg path rect circle ellipse line polyline polygon g defs clipPath text tspan'.split(
    ' ',
  ),
)
// The allowlist covers HTML, SVG and accessibility attributes.
const attributes =
  /^(class|style|id|title|role|type|checked|disabled|selected|placeholder|width|height|viewBox|d|fill|stroke|cx|cy|r|x|y|x1|x2|y1|y2|points|transform|xmlns|data-[\w-]+|aria-[\w-]+)$/i

export const renderFrame = (document: Document, frame: Frame): void => {
  let count = 0
  const scrolls: [Element, [number, number]][] = []
  // Keep the inert DOM reconstruction and its bounds together.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  const visit = (value: ReplayNode, depth = 0): Node => {
    if (++count > 100_000 || depth > 150 || !value || typeof value !== 'object') throw new Error('Invalid replay DOM')
    if (typeof value.text === 'string') return document.createTextNode(value.text)
    const tag = value.tag && tags.has(value.tag) ? value.tag : 'div'
    const node = value.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag)
    const entries = Object.entries(value.attrs || {})
    for (const [key, val] of entries) {
      if (attributes.test(key) && typeof val === 'string') node.setAttribute(key, val)
      if (key === 'src' && tag === 'img' && typeof val === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(val))
        node.setAttribute(key, val)
    }
    if (typeof value.value === 'string' && 'value' in node && (!('type' in node) || node.type !== 'file')) node.value = value.value
    if (typeof value.checked === 'boolean' && 'checked' in node) node.checked = value.checked
    const children = value.children || []
    for (const child of children) node.append(visit(child, depth + 1))
    if (Array.isArray(value.scroll)) scrolls.push([node, value.scroll])
    return node
  }
  const root = visit(frame.dom)
  const style = document.createElement('style')
  style.textContent = (frame.styles || []).filter((value) => typeof value === 'string').join('\n')
  document.head.querySelectorAll('style').forEach((node) => node.remove())
  document.head.append(style)
  document.documentElement.className = typeof frame.documentElement?.className === 'string' ? frame.documentElement.className : ''
  document.documentElement.style.cssText = typeof frame.documentElement?.style === 'string' ? frame.documentElement.style : ''
  if (root.nodeName === 'BODY') document.body.replaceWith(root)
  else document.body.replaceChildren(root)
  for (const [node, [x, y]] of scrolls) node.scrollTo(x, y)
}

export const mountPlayer = async (container: HTMLElement, { source, workerUrl }: PlayerOptions): Promise<() => void> => {
  const client = createClient(workerUrl)
  container.replaceChildren()
  container.className = 'SessionReplay'
  container.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;background:#202020;color:white;z-index:2147483647'
  const document = container.ownerDocument
  const viewport = document.createElement('div')
  viewport.style.cssText = 'flex:1;min-height:0;overflow:auto;position:relative'
  const iframe = document.createElement('iframe')
  iframe.title = 'Recorded session'
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.style.cssText = 'border:0;pointer-events:none;display:block'
  const loaded = new Promise<void>((resolve) => {
    iframe.onload = (): void => resolve()
  })
  // An opaque, inert visual document: recorded markup cannot run scripts, submit forms or fetch URLs.
  iframe.srcdoc =
    '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:"></head><body></body></html>'
  viewport.append(iframe)
  const controls = document.createElement('div')
  controls.style.cssText = 'display:flex;gap:12px;align-items:center;padding:12px;font:14px sans-serif;background:#202020;color:white'
  const play = document.createElement('button')
  play.textContent = 'Play'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.step = '1'
  slider.value = '0'
  slider.setAttribute('aria-label', 'Session replay position')
  slider.style.flex = '1'
  const status = document.createElement('output')
  status.setAttribute('aria-live', 'polite')
  controls.append(play, slider, status)
  container.append(viewport, controls)
  let disposed = false
  let playing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0
  let position = 0
  let duration = 0
  const show = (result: SeekResult): void => {
    ;({ duration, position } = result)
    slider.max = String(Math.ceil(duration))
    slider.value = String(Math.round(position))
    status.textContent = `${(position / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} s`
    const [width, height] = result.frame.viewport || [1280, 720]
    iframe.style.width = `${Math.max(1, Math.min(16_384, width))}px`
    iframe.style.height = `${Math.max(1, Math.min(16_384, height))}px`
    renderFrame(iframe.contentDocument!, result.frame)
  }
  const pause = (): void => {
    playing = false
    clearTimeout(timer)
    play.textContent = 'Play'
  }
  const seek = async (time: number): Promise<void> => {
    const id = ++requestId
    const result = await client.invoke('seek', time)
    if (!disposed && id === requestId) show(result)
  }
  const report = (error: unknown): void => {
    pause()
    status.textContent = error instanceof Error ? error.message : String(error)
  }
  slider.oninput = (): void => {
    pause()
    void seek(Number(slider.value)).catch(report)
  }
  play.onclick = (): void => {
    if (playing) {
      pause()
      return
    }
    playing = true
    play.textContent = 'Pause'
    const origin = performance.now() - (position >= duration ? 0 : position)
    const tick = async (): Promise<void> => {
      if (!playing || disposed) return
      try {
        await seek(performance.now() - origin)
        if (position >= duration) pause()
        else if (playing)
          timer = setTimeout(() => {
            void tick()
          }, 50)
      } catch (error) {
        report(error)
      }
    }
    void tick()
  }
  try {
    const [initial] = await Promise.all([client.invoke('load', source), loaded])
    show(initial)
  } catch (error) {
    play.disabled = slider.disabled = true
    report(error)
  }
  return () => {
    disposed = true
    pause()
    client.dispose()
    container.replaceChildren()
  }
}
