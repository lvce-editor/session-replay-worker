import type { ReplayNode } from '../Types/Types.ts'
import { resolveAssetUrl } from '../AssetUrls/AssetUrls.ts'
import { replayCss } from '../ReplayCss/ReplayCss.ts'

const tags =
  'body div span p pre code main section article header footer nav aside h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tr td th button input textarea select option label form fieldset legend a img br hr strong em b i u s small details summary svg path rect circle ellipse line polyline polygon g defs clipPath text tspan'.split(
    ' ',
  )
const attributes =
  /^(class|style|id|title|role|type|checked|disabled|selected|placeholder|width|height|viewBox|d|fill|stroke|cx|cy|r|x|y|x1|x2|y1|y2|points|transform|xmlns|data-[\w-]+|aria-[\w-]+)$/i
const svgNamespace = 'http://www.w3.org/2000/svg'

const attributeValue = (name: string, value: string, assetBaseUrl?: string): string => {
  if (name === 'style') return replayCss(value, assetBaseUrl, true)
  if (name !== 'fill' && name !== 'stroke') return value
  const css = replayCss(`${name}:${value}`, assetBaseUrl, true)
  return css ? css.slice(css.indexOf(':') + 1) : ''
}

const imageSource = (attrs: Record<string, string>, assetBaseUrl?: string): string | undefined => {
  const value = attrs.src
  if (typeof value === 'string') {
    if (/^data:image\/(png|jpeg|gif|webp);base64,/.test(value)) return value
    const src = resolveAssetUrl(value, assetBaseUrl)
    if (src) return src
  }
  // Older captures omitted image sources; the editor logo has a stable identity.
  return attrs.class?.split(/\s+/).includes('TitleBarIconIcon') ? resolveAssetUrl('/icons/icon.svg', assetBaseUrl) : undefined
}

const normalizeAttributes = (value: ReplayNode, tag: string, assetBaseUrl?: string): Record<string, string> => {
  const attrs: Record<string, string> = Object.create(null)
  const entries = Object.entries(value.attrs || {})
  for (const [key, val] of entries) {
    if (typeof val !== 'string') continue
    if (attributes.test(key)) attrs[key] = attributeValue(key.toLowerCase(), val, assetBaseUrl)
  }
  if (tag === 'img') {
    const src = imageSource(value.attrs || {}, assetBaseUrl)
    if (src) attrs.src = src
  }
  return attrs
}

export const normalizeDom = (root: ReplayNode, assetBaseUrl?: string): ReplayNode => {
  let count = 0
  const visit = (value: ReplayNode, depth: number): ReplayNode => {
    if (++count > 100_000 || depth > 150 || !value || typeof value !== 'object') throw new Error('Invalid replay DOM')
    if (typeof value.text === 'string') return { text: value.text }
    const tag = value.tag && tags.includes(value.tag) ? value.tag : 'div'
    return {
      attrs: normalizeAttributes(value, tag, assetBaseUrl),
      checked: value.checked === true,
      children: (value.children || []).map((child) => visit(child, depth + 1)),
      scroll: Array.isArray(value.scroll) ? [value.scroll[0], value.scroll[1]] : [0, 0],
      svg: value.svg === true,
      tag,
      value: typeof value.value === 'string' ? value.value : undefined,
    }
  }
  return visit(root, 0)
}

interface MountedNode {
  children: MountedNode[]
  node: ChildNode
  reused: boolean
  value: ReplayNode
}
const key = (value: ReplayNode): string | undefined => value.attrs?.['data-uid'] || value.attrs?.id
const compatible = (before: ReplayNode, after: ReplayNode): boolean =>
  typeof before.text === typeof after.text && before.tag === after.tag && before.svg === after.svg

const createNode = (document: Document, value: ReplayNode): ChildNode => {
  if (typeof value.text === 'string') return document.createTextNode(value.text)
  return value.svg ? document.createElementNS(svgNamespace, value.tag!) : document.createElement(value.tag!)
}
const patchAttributes = (element: Element, before: Record<string, string>, after: Record<string, string>): void => {
  for (const name of Object.keys(before)) if (!(name in after)) element.removeAttribute(name)
  const entries = Object.entries(after)
  for (const [name, value] of entries) if (before[name] !== value) element.setAttribute(name, value)
}

const patchProperties = (element: Element, before: ReplayNode | undefined, value: ReplayNode): void => {
  // Select values must be applied after their option children exist.
  if ('value' in element && typeof element.value === 'string' && (!('type' in element) || element.type !== 'file')) {
    if (typeof value.value === 'string' && element.value !== value.value) element.value = value.value
    else if (value.value === undefined && before?.value !== undefined) {
      element.removeAttribute('value')
      if (value.tag !== 'option') element.value = ''
    }
  }
  if ('checked' in element && element.checked !== value.checked) element.checked = value.checked
}

export const createDomRenderer = (root: Element): ((value: ReplayNode) => void) => {
  const document = root.ownerDocument
  let mounted: MountedNode[] = []
  let scrolls: [Element, number, number][] = []
  const patchChildren = (parent: Node, before: MountedNode[], values: ReplayNode[]): MountedNode[] => {
    const keyed: Record<string, MountedNode> = Object.create(null)
    const positional: MountedNode[] = []
    for (const child of before) {
      const id = key(child.value)
      if (id && !keyed[id]) keyed[id] = child
      else positional.push(child)
    }
    let index = 0
    const next = values.map((value) => {
      const id = key(value)
      const old = id ? keyed[id] : positional[index++]
      if (id) delete keyed[id]
      return patch(old, value)
    })
    for (const child of before) if (!child.reused) child.node.remove()
    for (const [index, child] of next.entries()) {
      const current = parent.childNodes[index] || null
      if (child.node !== current) parent.insertBefore(child.node, current)
    }
    return next
  }
  const patch = (previous: MountedNode | undefined, value: ReplayNode): MountedNode => {
    const old = previous && compatible(previous.value, value) ? previous : undefined
    if (old) old.reused = true
    const node = old?.node || createNode(document, value)
    if (typeof value.text === 'string') {
      if (old && old.value.text !== value.text) node.nodeValue = value.text
      return { children: [], node, reused: false, value }
    }
    const element = node as Element
    patchAttributes(element, old?.value.attrs || {}, value.attrs!)
    const children = patchChildren(element, old?.children || [], value.children!)
    patchProperties(element, old?.value, value)
    const [x, y] = value.scroll!
    scrolls.push([element, x, y])
    return { children, node, reused: false, value }
  }
  return (value) => {
    scrolls = []
    mounted = patchChildren(root, mounted, [value])
    for (const [node, x, y] of scrolls) if (node.scrollLeft !== x || node.scrollTop !== y) node.scrollTo(x, y)
  }
}
