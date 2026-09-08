import { ElementTagMap, VirtualDomElements } from '@lvce-editor/constants'
import type { ReplayNode } from '../Types/Types.ts'

export interface VirtualNode {
  [key: string]: unknown
  childCount?: number
  text?: string
  type: number
  uid?: number
}

export interface Patch {
  index: number
  key: string
  navigations?: readonly number[]
  nodes: VirtualNode[]
  type: number
  uid: number
  value: unknown
}

const element = (tag = 'div'): ReplayNode => ({ attrs: {}, children: [], tag })
const styleKeys = ['width', 'height', 'top', 'left', 'translate', 'marginTop', 'paddingLeft', 'paddingRight']
const attributes: Record<string, string> = { className: 'class', htmlFor: 'for', inputType: 'type' }
const setStyle = (node: ReplayNode, key: string, value: unknown): void => {
  node.attrs ||= {}
  const declarations = (node.attrs.style || '').split(';').filter((entry) => entry.trim() && entry.split(':', 1)[0].trim() !== key)
  if (value !== undefined && value !== '') declarations.push(`${key}:${typeof value === 'number' || typeof value === 'string' ? value : ''}`)
  node.attrs.style = declarations.join(';')
}
const property = (node: ReplayNode | undefined, key: string, value: unknown): void => {
  if (!node || /^on/i.test(key) || ['type', 'childCount', 'uid'].includes(key)) return
  switch (key) {
    case 'checked':
      node.checked = Boolean(value)
      return
    case 'scrollLeft':
    case 'scrollTop': {
      node.scroll ||= [0, 0]
      node.scroll[key === 'scrollTop' ? 1 : 0] = Number(value) || 0
      return
    }
    case 'value':
      node.value = typeof value === 'string' ? value : ''
      return
    default:
      break
  }
  if (styleKeys.includes(key)) {
    setStyle(
      node,
      key.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      typeof value === 'number' ? `${value}px` : value,
    )
    return
  }
  const attribute = attributes[key] || (key.startsWith('aria') ? `aria-${key.slice(4).toLowerCase()}` : key)
  node.attrs ||= {}
  if ([undefined, null, false].includes(value as undefined | null | boolean)) delete node.attrs[attribute]
  else node.attrs[attribute] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}
const matches = (node: ReplayNode, selector: string): boolean => {
  if (selector.startsWith('.')) return (node.attrs?.class || '').split(' ').includes(selector.slice(1))
  if (selector.startsWith('#')) return node.attrs?.id === selector.slice(1)
  const name = /^\[name="([^"]+)"\]$/.exec(selector)
  return name ? node.attrs?.name === name[1] : node.tag === selector
}
const find = (node: ReplayNode, selector: string): ReplayNode | undefined => {
  if (matches(node, selector)) return node
  const children = node.children || []
  for (const child of children) {
    const result = find(child, selector)
    if (result) return result
  }
  return undefined
}

const expandPatches = (patches: readonly Patch[]): Patch[] =>
  patches.flatMap((value) => {
    if (value.type !== 18) return [value]
    const { navigations } = value
    if (!Array.isArray(navigations) || navigations.length % 2 !== 0) throw new Error('Invalid compact replay navigation')
    const result: Patch[] = []
    for (let index = 0; index < navigations.length; index += 2) {
      const type = navigations[index]
      const childIndex = navigations[index + 1]
      if (![7, 8, 10].includes(type) || !Number.isSafeInteger(childIndex) || childIndex < 0) throw new Error('Invalid compact replay navigation')
      result.push({ ...value, index: childIndex, type })
    }
    return result
  })

export const createVisualDom = (): {
  append: (parent: ReplayNode, node: ReplayNode, index?: number) => void
  clear: (node: ReplayNode) => void
  detach: (node: ReplayNode) => void
  element: typeof element
  find: typeof find
  patch: (uid: number, patches: readonly Patch[]) => void
  property: typeof property
  render: (nodes: readonly VirtualNode[]) => ReplayNode[]
  replace: (node: ReplayNode, next: ReplayNode) => ReplayNode
  views: Record<number, ReplayNode | undefined>
} => {
  const views: Record<number, ReplayNode | undefined> = Object.create(null)
  const parents = new WeakMap<ReplayNode, ReplayNode>()
  const owners = new WeakMap<ReplayNode, number>()
  let nodeCount = 0
  const detach = (node: ReplayNode): void => {
    const parent = parents.get(node)
    if (parent) parent.children!.splice(parent.children!.indexOf(node), 1)
    parents.delete(node)
  }
  const clear = (node: ReplayNode): void => {
    while (node.children?.length) detach(node.children.at(0)!)
  }
  const append = (parent: ReplayNode, node: ReplayNode, index?: number): void => {
    let depth = 0
    for (let ancestor: ReplayNode | undefined = parent; ancestor; ancestor = parents.get(ancestor)) {
      if (ancestor === node || ++depth > 150) throw new Error('Invalid replay DOM reference or depth')
    }
    const oldParent = parents.get(node)
    const oldIndex = oldParent?.children?.indexOf(node)
    if (oldParent === parent && index !== undefined && oldIndex !== undefined && oldIndex < index) index--
    detach(node)
    parent.children ||= []
    parent.children.splice(index ?? parent.children.length, 0, node)
    parents.set(node, parent)
  }
  const replace = (node: ReplayNode, next: ReplayNode): ReplayNode => {
    if (node === next) return next
    const parent = parents.get(node)
    const index = parent?.children!.indexOf(node)
    detach(node)
    if (parent) append(parent, next, index)
    const uid = owners.get(node)
    if (uid !== undefined) {
      views[uid] = next
      owners.set(next, uid)
    }
    return next
  }
  const renderNode = (value: VirtualNode): ReplayNode => {
    let node: ReplayNode
    if (value.type === VirtualDomElements.Reference) node = views[value.uid!] || { text: 'Reference node not found' }
    else if (value.type === VirtualDomElements.Text) node = { text: value.text }
    else {
      node = element(ElementTagMap.getElementTag(value.type))
      for (const [key, entry] of Object.entries(value)) property(node, key, entry)
    }
    return node
  }
  const render = (nodes: readonly VirtualNode[]): ReplayNode[] => {
    const roots: ReplayNode[] = []
    const stack: { node: ReplayNode; remaining: number }[] = []
    for (const value of nodes) {
      if (++nodeCount > 2_000_000) throw new Error('Session replay DOM operation limit reached')
      while (stack.at(-1)?.remaining === 0) stack.pop()
      const node = renderNode(value)
      const parent = stack.at(-1)
      if (parent) {
        append(parent.node, node)
        parent.remaining--
      } else roots.push(node)
      const childCount = value.childCount || 0
      if (!Number.isSafeInteger(childCount) || childCount < 0 || stack.length > 150) throw new Error('Invalid virtual DOM child count or depth')
      if (childCount) stack.push({ node, remaining: childCount })
    }
    if (stack.some((entry) => entry.remaining !== 0)) throw new Error('Incomplete replay virtual DOM')
    return roots
  }
  const patch = (uid: number, input: readonly Patch[]): void => {
    const patches = expandPatches(input)
    let current = views[uid]
    if (!current) return
    owners.set(current, uid)
    const mutations: Record<number, (node: ReplayNode, value: Patch) => ReplayNode | undefined> = {
      1: (node, value) => {
        node.text = String(value.value)
        return node
      },
      10: (node, value) => parents.get(node)?.children?.[value.index],
      11: (node, value) => {
        const next = views[value.uid]
        return next ? replace(node, next) : node
      },
      2: (node, value) => {
        const next = render(value.nodes)[0]
        if (next) return replace(node, next)
        detach(node)
        return node
      },
      3: (node, value) => {
        property(node, value.key, value.value)
        return node
      },
      4: (node, value) => {
        property(node, value.key, undefined)
        return node
      },
      6: (node, value) => {
        const children = render(value.nodes)
        for (const child of children) append(node, child)
        return node
      },
      7: (node, value) => node.children?.[value.index],
      8: (node) => parents.get(node),
      9: (node, value) => {
        if (node.children?.[value.index]) detach(node.children[value.index])
        return node
      },
    }
    for (let index = 0; index < patches.length; index++) {
      const value = patches[index]
      if (value.type === 7 && value.index === current.children?.length && [2, 11].includes(patches[index + 1]?.type)) append(current, element())
      if (!mutations[value.type]) continue
      current = mutations[value.type](current, value)
      if (!current) return
    }
  }
  return { append, clear, detach, element, find, patch, property, render, replace, views }
}
