import type { Frame } from '../Types/Types.ts'
import { replayCss } from '../ReplayCss/ReplayCss.ts'
import { createDomRenderer, normalizeDom } from '../ReplayDom/ReplayDom.ts'

interface FrameRenderer {
  dispose: () => void
  render: (frame: Frame, assetBaseUrl?: string) => void
}

const renderers = new WeakMap<Document | HTMLElement, FrameRenderer>()

export const createReplayRoot = (document: Document): HTMLElement => {
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
  let sheets: CSSStyleSheet[] = []
  let previousStyles: string[] = []
  let previousBase: string | undefined
  let previousClass = originalClass
  let previousTheme: string | undefined
  let appliedTheme = originalTheme
  const removeSheets = (): CSSStyleSheet[] => document.adoptedStyleSheets.filter((sheet) => !sheets.includes(sheet))
  const update = (frame: Frame, assetBaseUrl?: string): void => {
    const dom = normalizeDom(frame.dom, assetBaseUrl)
    const styles = (frame.styles || []).filter((value) => typeof value === 'string')
    if (previousBase !== assetBaseUrl || styles.length !== previousStyles.length || styles.some((css, index) => css !== previousStyles[index])) {
      const others = removeSheets()
      sheets = styles.map((css, index) => {
        if (previousBase === assetBaseUrl && css === previousStyles[index]) return sheets[index]
        const sheet = new Sheet()
        sheet.replaceSync(replayCss(css, assetBaseUrl))
        return sheet
      })
      document.adoptedStyleSheets = [...others, ...sheets]
      previousStyles = styles
      previousBase = assetBaseUrl
    }
    const className = typeof frame.documentElement?.className === 'string' ? frame.documentElement.className : ''
    if (root.className !== className) root.className = className
    previousClass = className
    const theme = replayCss(typeof frame.documentElement?.style === 'string' ? frame.documentElement.style : '', assetBaseUrl, true)
    if (theme !== previousTheme) root.style.cssText = theme
    previousTheme = theme
    appliedTheme = root.style.cssText
    const [width, height] = frame.viewport || [1280, 720]
    const nextWidth = `${Math.max(1, Math.min(16_384, width))}px`
    const nextHeight = `${Math.max(1, Math.min(16_384, height))}px`
    if (surface.style.width !== nextWidth) surface.style.width = nextWidth
    if (surface.style.height !== nextHeight) surface.style.height = nextHeight
    render(dom.tag === 'body' ? dom : { attrs: {}, checked: false, children: [dom], scroll: [0, 0], tag: 'body', value: '' })
  }
  const dispose = (): void => {
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

export const renderFrame = (target: Document | HTMLElement, frame: Frame, assetBaseUrl?: string): void => {
  let render = renderers.get(target)
  if (!render) {
    render = createRenderer(target)
    renderers.set(target, render)
  }
  render.render(frame, assetBaseUrl)
}
