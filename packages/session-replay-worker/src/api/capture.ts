import type { Frame, ReplayNode } from './types.ts'

const omitted = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'NOSCRIPT'])
const unsupported = new Set(['IFRAME', 'WEBVIEW', 'CANVAS', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO'])
// The allowlist covers HTML, SVG and accessibility attributes.
const attributes =
  /^(class|style|id|title|role|type|checked|disabled|selected|placeholder|width|height|viewBox|d|fill|stroke|cx|cy|r|x|y|x1|x2|y1|y2|points|transform|xmlns|aria-[\w-]+)$/i

export const capture = (document: Document): Frame => {
  const visit = (original: Node): ReplayNode | undefined => {
    if (original.nodeType === 3) return { text: original.textContent }
    if (original.nodeType !== 1) return undefined
    const node = original as Element
    if (omitted.has(node.tagName)) return undefined
    // Attributes also work on XML elements without a dataset property.
    if (node.hasAttribute('data-session-replay-ignore')) return undefined
    if (unsupported.has(node.tagName) || node.matches('.Terminal, .TerminalView, .xterm, [data-session-replay-placeholder]')) {
      const { height, width } = node.getBoundingClientRect()
      return {
        attrs: { class: 'SessionReplayPlaceholder', style: `background:#808080;color:white;width:${width}px;height:${height}px;overflow:hidden` },
        children: [{ text: 'Content unavailable in replay' }],
        tag: 'div',
      }
    }
    if (node.matches('[data-session-replay-mask], input[type=password]')) return { children: [{ text: '••••••••' }], tag: 'span' }
    const attrs = Object.fromEntries([...node.attributes].filter(({ name }) => attributes.test(name)).map(({ name, value }) => [name, value]))
    if (node.tagName === 'IMG') {
      const image = node as HTMLImageElement
      if (image.src.startsWith('data:image/')) attrs.src = image.src
    }
    return {
      attrs,
      tag: node.localName,
      ...(node.namespaceURI === 'http://www.w3.org/2000/svg' && { svg: true }),
      ...('value' in node && typeof node.value === 'string' && { value: node.value }),
      ...('checked' in node && typeof node.checked === 'boolean' && { checked: node.checked }),
      ...((node.scrollTop || node.scrollLeft) && { scroll: [node.scrollLeft, node.scrollTop] }),
      children: Array.from(node.childNodes, visit).filter((child): child is ReplayNode => child !== undefined),
    }
  }
  const styles: string[] = []
  const visitSheet = (sheet: CSSStyleSheet | null, seen = new Set<CSSStyleSheet>()): string => {
    if (!sheet || seen.has(sheet)) return ''
    seen.add(sheet)
    try {
      return Array.from(sheet.cssRules, (rule) => {
        if (!('styleSheet' in rule)) return rule.cssText
        const importRule = rule as CSSImportRule
        const imported = visitSheet(importRule.styleSheet, seen)
        return importRule.media.mediaText ? `@media ${importRule.media.mediaText} { ${imported} }` : imported
      }).join('\n')
    } catch {
      return ''
    }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) styles.push(visitSheet(sheet))
  return {
    documentElement: { className: document.documentElement.className, style: document.documentElement.style.cssText },
    dom: visit(document.body)!,
    styles,
    viewport: [document.defaultView!.innerWidth, document.defaultView!.innerHeight],
  }
}

export const observe = (
  document: Document,
  record: (type: 'frame', frame: Frame) => Promise<void>,
  onError: (error: unknown) => void,
): (() => void) => {
  let dirty = true
  let busy = false
  let stopped = false
  const mark = (): void => {
    dirty = true
  }
  const observer = new MutationObserver(mark)
  observer.observe(document.documentElement, { attributes: true, characterData: true, childList: true, subtree: true })
  for (const type of ['input', 'change', 'scroll']) document.addEventListener(type, mark, { capture: true })
  document.defaultView!.addEventListener('resize', mark)
  let lastStyles = ''
  const snapshot = async (force = false): Promise<void> => {
    if (busy || stopped) return
    busy = true
    try {
      // CSSStyleSheet.replaceSync/insertRule don't produce DOM mutation records.
      const frame = capture(document)
      const styles = frame.styles.join('\n')
      if (force || dirty || styles !== lastStyles) {
        dirty = false
        lastStyles = styles
        await record('frame', frame)
      }
    } catch (error) {
      onError(error)
    } finally {
      busy = false
    }
  }
  void snapshot(true)
  const timer = setInterval(() => {
    void snapshot()
  }, 100)
  return () => {
    stopped = true
    clearInterval(timer)
    observer.disconnect()
    for (const type of ['input', 'change', 'scroll']) document.removeEventListener(type, mark, true)
    document.defaultView!.removeEventListener('resize', mark)
  }
}

export const serializeMessage = (message: unknown): unknown => {
  const seen = new WeakSet()
  return JSON.parse(
    JSON.stringify(message, (key, value) => {
      if (/password|token|secret|authorization|cookie/i.test(key)) return '[redacted]'
      if (typeof value === 'bigint') return String(value)
      if (typeof value !== 'object' || value === null) return value
      if (seen.has(value)) return '[circular]'
      seen.add(value)
      if (value instanceof Error) return { message: value.message, name: value.name, stack: value.stack }
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return { byteLength: value.byteLength, type: value.constructor.name }
      if (value.constructor?.name === 'MessagePort') return { type: 'MessagePort' }
      return value
    }),
  )
}
