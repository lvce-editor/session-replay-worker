import type { Frame } from '../Types/Types.ts'
import { replayCss } from '../ReplayCss/ReplayCss.ts'
import { createDomRenderer, normalizeDom } from '../ReplayDom/ReplayDom.ts'

const renderers = new WeakMap<Document | ShadowRoot, (frame: Frame, assetBaseUrl?: string) => void>()

export const createReplayRoot = (document: Document): HTMLElement => {
  const host = document.createElement('div')
  host.className = 'SessionReplaySurface'
  host.inert = true
  host.style.cssText = 'all:initial;display:block;contain:strict;isolation:isolate;pointer-events:none;background:white'
  host.attachShadow({ mode: 'open' })
  return host
}

const createRenderer = (target: Document | ShadowRoot): ((frame: Frame, assetBaseUrl?: string) => void) => {
  let shadow: ShadowRoot
  const document = target.nodeType === 9 ? (target as Document) : target.ownerDocument!
  if (target.nodeType === 9) {
    const host = createReplayRoot(document)
    document.body.replaceChildren(host)
    shadow = host.shadowRoot!
  } else shadow = target as ShadowRoot
  const root = document.createElement('html')
  shadow.replaceChildren(root)
  const Sheet = document.defaultView!.CSSStyleSheet
  const reset = new Sheet()
  reset.replaceSync('html { all: initial; display: block; width: 100%; height: 100%; }')
  shadow.adoptedStyleSheets = [reset]
  const render = createDomRenderer(root)
  let previousStyles: string[] = []
  let previousBase: string | undefined
  let previousTheme = ''
  return (frame, assetBaseUrl) => {
    const dom = normalizeDom(frame.dom, assetBaseUrl)
    const styles = (frame.styles || []).filter((value) => typeof value === 'string')
    if (previousBase !== assetBaseUrl || styles.length !== previousStyles.length || styles.some((css, index) => css !== previousStyles[index])) {
      const previous = shadow.adoptedStyleSheets.slice(1)
      const sheets = styles.map((css, index) => {
        if (previousBase === assetBaseUrl && css === previousStyles[index]) return previous[index]
        const sheet = new Sheet()
        sheet.replaceSync(replayCss(css, assetBaseUrl))
        return sheet
      })
      shadow.adoptedStyleSheets = [reset, ...sheets]
      previousStyles = styles
      previousBase = assetBaseUrl
    }
    const className = typeof frame.documentElement?.className === 'string' ? frame.documentElement.className : ''
    if (root.className !== className) root.className = className
    const theme = replayCss(typeof frame.documentElement?.style === 'string' ? frame.documentElement.style : '', assetBaseUrl, true)
    if (theme !== previousTheme) {
      root.style.cssText = theme
      previousTheme = theme
    }
    const host = shadow.host as HTMLElement
    const [width, height] = frame.viewport || [1280, 720]
    const nextWidth = `${Math.max(1, Math.min(16_384, width))}px`
    const nextHeight = `${Math.max(1, Math.min(16_384, height))}px`
    if (host.style.width !== nextWidth) host.style.width = nextWidth
    if (host.style.height !== nextHeight) host.style.height = nextHeight
    render(dom.tag === 'body' ? dom : { attrs: {}, checked: false, children: [dom], scroll: [0, 0], tag: 'body', value: '' })
  }
}

export const renderFrame = (target: Document | ShadowRoot, frame: Frame, assetBaseUrl?: string): void => {
  let render = renderers.get(target)
  if (!render) {
    render = createRenderer(target)
    renderers.set(target, render)
  }
  render(frame, assetBaseUrl)
}
