import type { ProxyMessage } from '../Proxy/Proxy.ts'
import { replayCommands } from '../ReplayCommand/ReplayCommand.ts'

// Select before serialization and storage. Transport forwarding remains unfiltered.
export const createReplayMessageFilter = (): ((data: ProxyMessage) => boolean) => {
  const replies: Record<number, (number | string)[]> = Object.create(null)
  return ({ connection, direction, message, renderer }): boolean => {
    if (!renderer || !message || typeof message !== 'object') return false
    const { id, method } = message
    if (direction === 'to-renderer') {
      if (!(replayCommands as readonly unknown[]).includes(method)) return false
      if (method === 'Viewlet.queueCommands' && id !== undefined) {
        const pending = (replies[connection] ||= [])
        if (!pending.includes(id)) pending.push(id)
      }
      return true
    }
    if (method || id === undefined) return false
    const pending = replies[connection]
    const index = pending?.indexOf(id) ?? -1
    if (index === -1) return false
    pending.splice(index, 1)
    if (pending.length === 0) delete replies[connection]
    return true
  }
}
