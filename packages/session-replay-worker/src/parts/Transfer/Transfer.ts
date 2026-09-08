// Walk the structured-clone graph, including collections and shared buffer views.
export const getTransferrables = (value: unknown): Transferable[] => {
  const seen: object[] = []
  const result: Transferable[] = []
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object' || seen.includes(item)) return
    seen.push(item)
    if (Object.prototype.toString.call(item) === '[object ArrayBuffer]') result.push(item as Transferable)
    else if (ArrayBuffer.isView(item)) visit(item.buffer)
    else if (
      ['MessagePort', 'OffscreenCanvas', 'ImageBitmap', 'AudioData', 'VideoFrame', 'ReadableStream', 'WritableStream', 'TransformStream'].some(
        (name) =>
          typeof (globalThis as unknown as Record<string, typeof MessagePort>)[name] === 'function' &&
          item instanceof (globalThis as unknown as Record<string, typeof MessagePort>)[name],
      )
    )
      result.push(item as Transferable)
    else if (Object.prototype.toString.call(item) === '[object Map]') {
      for (const [key, entry] of item as Map<unknown, unknown>) {
        visit(key)
        visit(entry)
      }
    } else if (Object.prototype.toString.call(item) === '[object Set]') {
      for (const entry of item as Set<unknown>) visit(entry)
    } else for (const entry of Object.values(item)) visit(entry)
  }
  visit(value)
  return result
}
