import { serializeMessage } from '../Capture/Capture.ts'

const redacted = '[redacted]'
const isMasked = (node: Record<string, unknown>): boolean =>
  node.inputType === 'password' || Object.hasOwn(node, 'data-session-replay-mask') || Object.hasOwn(node, 'data-session-replay-ignore')
const structuralKeys = new Set(['type', 'childCount', 'uid'])
const redactNode = (node: Record<string, unknown>): void => {
  for (const key of Object.keys(node)) {
    if (structuralKeys.has(key)) continue
    if (['text', 'value', 'textContent'].includes(key)) node[key] = redacted
    else if (key === 'inputType' && node[key] === 'password') continue
    else if (['data-session-replay-mask', 'data-session-replay-ignore'].includes(key)) node[key] = ''
    else delete node[key]
  }
}
const redactUpdates = (method: string, params: unknown[]): void => {
  if (method === 'Viewlet.setValueByName') params[2] = redacted
  else if (method === 'Viewlet.setProperty') params[3] = redacted
  const updates = params[1]
  if (!Array.isArray(updates)) return
  if (method === 'Viewlet.setInputValues') for (const item of updates) item.value = redacted
  if (!['Viewlet.setPatches', 'Viewlet.setTreePatches'].includes(method)) return
  for (const patch of updates) {
    if ([1, 3].includes(patch.type)) patch.value = redacted
  }
}

// Preserve flat DOM/patch positions; never alter the live transport message.
export const createMessageSerializer = (): ((message: unknown) => unknown) => {
  const maskedViews = new Set<number>()
  const sanitizeCommand = (method: string, params: unknown[], masked: boolean): void => {
    if (!method.startsWith('Viewlet.') || typeof params[0] !== 'number') return
    const uid = params[0]
    const patches = params[1]
    const masksInput = Array.isArray(patches) && patches.some((patch) => patch?.key === 'inputType' && patch.value === 'password')
    if (masked || masksInput) maskedViews.add(uid)
    if (maskedViews.has(uid)) redactUpdates(method, params)
  }
  const sanitizeArray = (array: unknown[]): boolean => {
    let remaining = 0
    let masked = false
    for (const entry of array) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const node = entry as Record<string, unknown>
        if (remaining > 0 || isMasked(node)) {
          remaining = Math.max(0, remaining - 1) + (typeof node.childCount === 'number' ? node.childCount : 0)
          redactNode(node)
          masked = true
        }
      }
      masked = sanitize(entry) || masked
    }
    if (typeof array[0] === 'string' && array[0].startsWith('Viewlet.')) {
      const params = array.slice(1)
      sanitizeCommand(array[0], params, masked)
      array.splice(1, array.length - 1, ...params)
    }
    return masked
  }
  const sanitize = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return sanitizeArray(value)
    const object = value as Record<string, unknown>
    let masked = isMasked(object)
    if (masked) redactNode(object)
    for (const child of Object.values(object)) masked = sanitize(child) || masked
    if (typeof object.method === 'string' && Array.isArray(object.params)) sanitizeCommand(object.method, object.params, masked)
    return masked
  }
  return (message: unknown): unknown => {
    const result = serializeMessage(message)
    sanitize(result)
    return result
  }
}
