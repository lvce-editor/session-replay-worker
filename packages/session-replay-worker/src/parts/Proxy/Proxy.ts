import { getTransferrables } from '../Transfer/Transfer.ts'

export interface RpcMessage {
  error?: unknown
  id?: number | string
  method?: string
  params?: any[]
  result?: unknown
}

export interface ProxyMessage {
  connection: number
  direction: 'to-renderer' | 'from-renderer'
  label: string
  message: RpcMessage
  renderer: boolean
}

interface ProxyOptions {
  record: (message: ProxyMessage) => void
  report?: (error: unknown) => void
}

const wrapPorts = (
  value: unknown,
  replacePort: (port: MessagePort) => MessagePort,
  seen: { original: object; replacement: unknown }[] = [],
): unknown => {
  if (!value || typeof value !== 'object') return value
  const previous = seen.find((entry) => entry.original === value)
  if (previous) return previous.replacement
  if (value instanceof MessagePort) {
    const replacement = replacePort(value)
    seen.push({ original: value, replacement })
    return replacement
  }
  seen.push({ original: value, replacement: value })
  if (value instanceof Map) {
    const entries = [...value]
    value.clear()
    for (const [key, entry] of entries) value.set(wrapPorts(key, replacePort, seen), wrapPorts(entry, replacePort, seen))
  } else if (value instanceof Set) {
    const entries = [...value]
    value.clear()
    for (const entry of entries) value.add(wrapPorts(entry, replacePort, seen))
  } else if (Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]') {
    const object = value as Record<string, unknown>
    for (const key of Object.keys(object)) object[key] = wrapPorts(object[key], replacePort, seen)
  }
  return value
}

// A raw transport bridge: RPC ids, notifications, errors and replies stay intact.
export const createProxyRegistry = ({
  record,
  report = (): void => {},
}: ProxyOptions): { create: (port: MessagePort, label?: string, renderer?: boolean) => MessagePort; dispose: () => void } => {
  const connections: Record<number, () => void> = Object.create(null)
  let nextId = 0
  const createNestedPort = (connection: number, renderer: boolean, port: MessagePort): MessagePort => create(port, `${connection}/port`, renderer)
  const create = (port: MessagePort, label = 'renderer', renderer = true): MessagePort => {
    const channel = new MessageChannel()
    const peer = channel.port1
    const connection = ++nextId
    const close = (): void => {
      for (const endpoint of [port, peer]) {
        endpoint.removeEventListener('close', close)
        endpoint.onmessage = null
        endpoint.onmessageerror = null
        endpoint.close()
      }
      delete connections[connection]
    }
    connections[connection] = close
    const ignoredReplies: Record<ProxyMessage['direction'], unknown[]> = { 'from-renderer': [], 'to-renderer': [] }
    const forward = (source: MessagePort, target: MessagePort, direction: ProxyMessage['direction']): void => {
      source.onmessage = ({ data }: MessageEvent<RpcMessage>): void => {
        const opposite = direction === 'to-renderer' ? 'from-renderer' : 'to-renderer'
        const ignored = typeof data?.method === 'string' && data.method.startsWith('SessionReplay.')
        if (ignored && data.id !== undefined && !ignoredReplies[opposite].includes(data.id)) ignoredReplies[opposite].push(data.id)
        const ignoredReply = !data?.method && ignoredReplies[direction].includes(data?.id)
        if (ignoredReply) ignoredReplies[direction] = ignoredReplies[direction].filter((id) => ![id].includes(data?.id))
        if (!ignored && !ignoredReply) {
          try {
            record({ connection, direction, label, message: data, renderer })
          } catch (error) {
            report(error)
          }
        }
        // Replace ports before transfer, retaining cycles and repeated references.
        const directRenderer = renderer && data?.method === 'HandleMessagePort.handleMessagePort'
        const message = wrapPorts(data, createNestedPort.bind(null, connection, directRenderer))
        target.postMessage(message, getTransferrables(message))
        if (data?.method === 'Exit.exit') close()
      }
      source.onmessageerror = (): void => report(new Error(`Cannot decode session replay proxy message (${connection})`))
      source.addEventListener('close', close)
      source.start()
    }
    forward(port, peer, 'to-renderer')
    forward(peer, port, 'from-renderer')
    return channel.port2
  }
  return {
    create,
    dispose(): void {
      for (const close of Object.values(connections)) close()
    },
  }
}
