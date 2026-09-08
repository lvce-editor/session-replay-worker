import type { ProxyMessage } from '../Proxy/Proxy.ts'
import type { Frame } from '../Types/Types.ts'
import type { Patch, VirtualNode } from '../VisualDom/VisualDom.ts'
import { createVisualDom } from '../VisualDom/VisualDom.ts'

type Command = [string, ...any[]]
interface Batch {
  commands: Command[]
  committed: boolean
  transaction: number
  uid: number
}

// Only these visual operations are interpreted; recordings never dispatch application RPCs.
export const createVisualState = (initial: Frame): { accept: (message: ProxyMessage) => void; frame: () => Frame } => {
  const frame = structuredClone(initial)
  const dom = createVisualDom()
  const { append, clear, detach, element, find, patch, property, render, replace, views } = dom
  // Stylesheets and transactions retain arrival order, including numeric ids.
  let sheets: { uid: unknown; text: string }[] = (frame.styles || []).map((text, index) => ({ text, uid: `initial-${index}` }))
  const calls: Record<string, [number, Command[]]> = Object.create(null)
  const batches: Batch[] = []
  const setDom = (uid: number, nodes: VirtualNode[]): void => {
    const view = views[uid]
    if (!view) return
    const next = render(nodes)[0]
    if (next) {
      replace(view, next)
      views[uid] = next
    }
  }
  const apply = (method: string | undefined, params: any[] = []): void => {
    if (method && Object.hasOwn(handlers, method)) handlers[method](...params)
  }
  const execute = (commands: Command[]): void => {
    for (const [method, ...params] of commands) apply(method, params)
  }
  const commit = (uid: number, transaction: number): void => {
    const batch = batches.find((entry) => entry.transaction === transaction)
    if (!batch || batch.uid !== uid) return
    batch.committed = true
    for (let index = 0; index < batches.length; index++) {
      const pending = batches[index]
      if (pending.uid !== uid) continue
      if (!pending.committed) return
      execute(pending.commands)
      batches.splice(index, 1)
      index--
    }
  }
  const appendView = (uid: number, childId: number, references?: number[]): void => {
    const view = views[uid]
    const child = views[childId]
    if (!view || !child) return
    const nextReferences = references?.slice(references.indexOf(childId) + 1) || []
    const next = nextReferences.map((id) => views[id]).find((node) => node && view.children?.includes(node))
    append(view, child, next ? view.children!.indexOf(next) : undefined)
  }
  const setProperty = (uid: number, selector: string, key: string, value: unknown): void => {
    const view = views[uid]
    const node = view && find(view, selector)
    if (!node) return
    if (key === 'textContent') {
      clear(node)
      append(node, { text: String(value) })
    } else property(node, key, value)
  }
  const setBounds = (uid: number, left: number, top: number, width: number, height: number): void => {
    const view = views[uid]
    const bounds = Object.entries({ height, left, top, width })
    for (const [key, value] of bounds) property(view, key, value)
  }
  const setCss = (uid: unknown, text: string): void => {
    const sheet = sheets.find((entry) => [entry.uid].includes(uid))
    if (sheet) sheet.text = text
    else sheets.push({ text, uid })
  }
  const create = (_id: string | number, uid = Number(_id)): void => {
    views[uid] = element()
  }
  const handlers: Record<string, (...args: any[]) => void> = {
    'Css.addCssStyleSheet': setCss,
    'Css.removeCssStyleSheet': (uid: unknown) => {
      sheets = sheets.filter((entry) => ![entry.uid].includes(uid))
    },
    'Viewlet.addCss': setCss,
    'Viewlet.append': appendView,
    'Viewlet.appendToBody': (uid: number) => {
      const view = views[uid]
      if (view) append(frame.dom, view)
    },
    'Viewlet.appendToRoot': (uid: number, root: string) => {
      const view = views[uid]
      const parent = find(frame.dom, `#${root}`)
      if (view && parent) append(parent, view)
    },
    'Viewlet.commitPending': commit,
    'Viewlet.create': create,
    'Viewlet.createFunctionalRoot': create,
    'Viewlet.createPlaceholder': (uid: number, parentId: number, top: number, left: number, width: number, height: number) => {
      views[uid] = element()
      property(views[uid], 'className', `Viewlet ${uid}`)
      setBounds(uid, left, top, width, height)
      appendView(parentId, uid)
    },
    'Viewlet.dispose': (uid: number) => {
      const view = views[uid]
      if (view) detach(view)
      delete views[uid]
      sheets = sheets.filter((entry) => ![entry.uid].includes(uid))
    },
    'Viewlet.executeCommands': execute,
    'Viewlet.patchCss': (uid: unknown, start: number, count: number, replacement: string) => {
      const sheet = sheets.find((entry) => [entry.uid].includes(uid))
      if (sheet) sheet.text = sheet.text.slice(0, start) + replacement + sheet.text.slice(start + count)
    },
    'Viewlet.replaceChildren': (uid: number, children: number[]) => {
      const view = views[uid]
      if (!view) return
      clear(view)
      for (const id of children) {
        const child = views[id]
        if (child) append(view, child)
      }
    },
    'Viewlet.scrollSelectorBy': (uid: number, selector: string, delta: number) => {
      const view = views[uid]
      const node = view && find(view, selector)
      if (node) property(node, 'scrollLeft', (node.scroll?.[0] || 0) + delta)
    },
    'Viewlet.sendMultiple': execute,
    'Viewlet.setBounds': setBounds,
    'Viewlet.setCheckBoxValue': (uid: number, name: string, value: boolean) => setProperty(uid, `[name="${name}"]`, 'checked', value),
    'Viewlet.setComponentDom': setDom,
    'Viewlet.setCss': setCss,
    'Viewlet.setDom': (uid: number, nodes: VirtualNode[]) => {
      const view = views[uid]
      if (!view) return
      clear(view)
      const children = render(nodes)
      for (const child of children) append(view, child)
    },
    'Viewlet.setDom2': setDom,
    'Viewlet.setInputValues': (uid: number, items: { name: string; value: string }[]) => {
      for (const { name, value } of items) setProperty(uid, `[name="${name}"]`, 'value', value)
    },
    'Viewlet.setPatches': (uid: number, patches: Patch[]) => {
      if (patches.length === 1 && patches[0].type === 6) setDom(uid, patches[0].nodes)
      else patch(uid, patches)
    },
    'Viewlet.setProperty': setProperty,
    'Viewlet.setTreePatches': patch,
    'Viewlet.setValueByName': (uid: number, name: string, value: string) => setProperty(uid, `[name="${name}"]`, 'value', value),
    'Viewlet.show': (uid: number) => {
      const view = views[uid]
      if (view) append(find(frame.dom, '#Workbench') || frame.dom, view)
    },
  }
  return {
    accept(data: ProxyMessage): void {
      if (!data?.renderer || !data.message || typeof data.message !== 'object') return
      const { connection, direction, message } = data
      const key = `${connection}:${message.id}`
      if (direction === 'to-renderer') {
        if (message.method === 'Viewlet.queueCommands') calls[key] = message.params as [number, Command[]]
        else apply(message.method, message.params)
      } else if (Object.hasOwn(calls, key)) {
        const [uid, commands] = calls[key]
        delete calls[key]
        if (Number.isSafeInteger(message.result)) {
          const transaction = message.result as number
          const batch: Batch = { commands, committed: false, transaction, uid }
          const index = batches.findIndex((entry) => entry.transaction === transaction)
          if (index === -1) batches.push(batch)
          else batches[index] = batch
        }
      }
    },
    frame(): Frame {
      return { ...frame, styles: sheets.map((sheet) => sheet.text) }
    },
  }
}
