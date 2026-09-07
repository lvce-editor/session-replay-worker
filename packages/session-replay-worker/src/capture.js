const omitted = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'NOSCRIPT'])
const unsupported = new Set(['IFRAME', 'WEBVIEW', 'CANVAS', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO'])
const attributes =
  /^(class|style|id|title|role|type|checked|disabled|selected|placeholder|width|height|viewBox|d|fill|stroke|cx|cy|r|x|y|x1|x2|y1|y2|points|transform|xmlns|aria-[\w-]+)$/i

export const capture = (document) => {
  const visit = (node) => {
    if (node.nodeType === 3) return { text: node.textContent }
    if (node.nodeType !== 1 || omitted.has(node.tagName)) return undefined
    if (node.hasAttribute('data-session-replay-ignore')) return undefined
    if (unsupported.has(node.tagName) || node.matches('.Terminal, .TerminalView, .xterm, [data-session-replay-placeholder]')) {
      const { width, height } = node.getBoundingClientRect()
      return {
        tag: 'div',
        attrs: { class: 'SessionReplayPlaceholder', style: `background:#808080;color:white;width:${width}px;height:${height}px;overflow:hidden` },
        children: [{ text: 'Content unavailable in replay' }],
      }
    }
    if (node.matches('[data-session-replay-mask], input[type=password]')) return { tag: 'span', children: [{ text: '••••••••' }] }
    const attrs = Object.fromEntries([...node.attributes].filter(({ name }) => attributes.test(name)).map(({ name, value }) => [name, value]))
    if (node.tagName === 'IMG' && node.src.startsWith('data:image/')) attrs.src = node.src
    return {
      tag: node.localName,
      attrs,
      ...(node.namespaceURI === 'http://www.w3.org/2000/svg' ? { svg: true } : {}),
      ...(typeof node.value === 'string' ? { value: node.value } : {}),
      ...(typeof node.checked === 'boolean' ? { checked: node.checked } : {}),
      ...(node.scrollTop || node.scrollLeft ? { scroll: [node.scrollLeft, node.scrollTop] } : {}),
      children: Array.from(node.childNodes, visit).filter(Boolean),
    }
  }
  const styles = []
  const visitSheet = (sheet, seen = new Set()) => {
    if (!sheet || seen.has(sheet)) return ''
    seen.add(sheet)
    try {
      return Array.from(sheet.cssRules, (rule) => {
        if (rule.type !== 3) return rule.cssText
        const imported = visitSheet(rule.styleSheet, seen)
        return rule.media.mediaText ? `@media ${rule.media.mediaText} { ${imported} }` : imported
      }).join('\n')
    } catch {
      return ''
    }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) styles.push(visitSheet(sheet))
  return {
    dom: visit(document.body),
    styles,
    documentElement: { className: document.documentElement.className, style: document.documentElement.style.cssText },
    viewport: [document.defaultView.innerWidth, document.defaultView.innerHeight],
  }
}

export const observe = (document, record, onError) => {
  let dirty = true
  let busy = false
  let stopped = false
  const mark = () => {
    dirty = true
  }
  const observer = new MutationObserver(mark)
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
  for (const type of ['input', 'change', 'scroll']) document.addEventListener(type, mark, true)
  document.defaultView.addEventListener('resize', mark)
  let lastStyles = ''
  const snapshot = async (force = false) => {
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
  const timer = setInterval(snapshot, 100)
  return () => {
    stopped = true
    clearInterval(timer)
    observer.disconnect()
    for (const type of ['input', 'change', 'scroll']) document.removeEventListener(type, mark, true)
    document.defaultView.removeEventListener('resize', mark)
  }
}

export const serializeMessage = (message) => {
  const seen = new WeakSet()
  return JSON.parse(
    JSON.stringify(message, (key, value) => {
      if (/password|token|secret|authorization|cookie/i.test(key)) return '[redacted]'
      if (typeof value === 'bigint') return String(value)
      if (typeof value !== 'object' || value === null) return value
      if (seen.has(value)) return '[circular]'
      seen.add(value)
      if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength }
      if (value.constructor?.name === 'MessagePort') return { type: 'MessagePort' }
      return value
    }),
  )
}
