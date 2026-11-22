import type { Frame } from '../Types/Types.ts'
import { prepareFrame } from '../PrepareFrame/PrepareFrame.ts'
import { createDomRenderer } from '../ReplayDom/ReplayDom.ts'

interface FrameRenderer {
  dispose: () => void
  render: (frame: Frame) => void
}

const renderers = new WeakMap<Document | HTMLElement, FrameRenderer>()

const createReplayRoot = (document: Document): HTMLElement => {
  const surface = document.createElement('div')
  surface.className = 'SessionReplaySurface'
  surface.inert = true
  surface.style.cssText = 'display:block;contain:strict;pointer-events:none;background:white'
  return surface
}

const createRenderer = (target: Document | HTMLElement): FrameRenderer => {
  const document = target.nodeType === 9 ? (target as Document) : target.ownerDocument!
  const surface = target.nodeType === 9 ? createReplayRoot(document) : (target as HTMLElement)
  if (target.nodeType === 9) document.body.replaceChildren(surface)
  const root = document.documentElement
  const originalClass = root.className
  const originalTheme = root.style.cssText
  const Sheet = document.defaultView!.CSSStyleSheet
  const render = createDomRenderer(surface)
  let cursor: HTMLElement | undefined
  let sheets: CSSStyleSheet[] = []
  let previousStyles: string[] = []
  let previousClass = originalClass
  let previousTheme: string | undefined
  let appliedTheme = originalTheme
  const removeSheets = (): CSSStyleSheet[] => document.adoptedStyleSheets.filter((sheet) => !sheets.includes(sheet))
  const update = (frame: Frame): void => {
    const { dom } = frame
    const styles = (frame.styles || []).filter((value) => typeof value === 'string')
    if (styles.length !== previousStyles.length || styles.some((css, index) => css !== previousStyles[index])) {
      const others = removeSheets()
      sheets = styles.map((css, index) => {
        if (css === previousStyles[index]) return sheets[index]
        const sheet = new Sheet()
        sheet.replaceSync(css)
        return sheet
      })
      document.adoptedStyleSheets = [...others, ...sheets]
      previousStyles = styles
    }
    const className = typeof frame.documentElement?.className === 'string' ? frame.documentElement.className : ''
    if (root.className !== className) root.className = className
    previousClass = className
    const theme = frame.documentElement?.style || ''
    if (theme !== previousTheme) root.style.cssText = theme
    previousTheme = theme
    appliedTheme = root.style.cssText
    const [width, height] = frame.viewport || [1280, 720]
    const nextWidth = `${Math.max(1, Math.min(16_384, width))}px`
    const nextHeight = `${Math.max(1, Math.min(16_384, height))}px`
    if (surface.style.width !== nextWidth) surface.style.width = nextWidth
    if (surface.style.height !== nextHeight) surface.style.height = nextHeight
    render(dom)
    if (!frame.pointer) {
      cursor?.remove()
      cursor = undefined
      return
    }
    if (!cursor) {
      cursor = document.createElement('div')
      cursor.className = 'SessionReplayCursor'
      cursor.setAttribute('aria-hidden', 'true')
      cursor.style.cssText =
        'all:initial;position:absolute;top:0;left:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(1px 0 #fff) drop-shadow(-1px 0 #fff) drop-shadow(0 1px #fff) drop-shadow(0 -1px #fff)'
      const arrow = document.createElement('div')
      arrow.style.cssText =
        'all:initial;display:block;width:16px;height:22px;background:#07141c;clip-path:polygon(0 0,100% 60%,57% 63%,75% 93%,57% 100%,38% 68%,0 93%)'
      cursor.append(arrow)
      surface.append(cursor)
    }
    const [x, y] = frame.pointer
    cursor.style.transform = `translate(${x}px, ${y}px)`
  }
  const dispose = (): void => {
    cursor?.remove()
    document.adoptedStyleSheets = removeSheets()
    if (root.className === previousClass) root.className = originalClass
    if (root.style.cssText === appliedTheme) root.style.cssText = originalTheme
  }
  return { dispose, render: update }
}

export const disposeFrame = (target: Document | HTMLElement): void => {
  renderers.get(target)?.dispose()
  renderers.delete(target)
}

export const renderPreparedFrame = (target: Document | HTMLElement, frame: Frame): void => {
  let render = renderers.get(target)
  if (!render) {
    render = createRenderer(target)
    renderers.set(target, render)
  }
  render.render(frame)
}

export const renderFrame = (target: Document | HTMLElement, frame: Frame, assetBaseUrl?: string): void => {
  renderPreparedFrame(target, prepareFrame(frame, assetBaseUrl))
}
