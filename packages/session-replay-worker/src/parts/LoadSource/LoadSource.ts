import type { ReplayStorage } from '../Storage/Storage.ts'
import type { ReplaySource } from '../Types/Types.ts'

export const loadSource = async (source: ReplaySource, getStorage: () => Promise<ReplayStorage>): Promise<unknown> => {
  if ('localId' in source) {
    const storage = await getStorage()
    return storage.read(source.localId)
  }
  if ('url' in source) {
    const response = await fetch(source.url, { credentials: 'include', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Cannot load session replay (${response.status})`)
    return response.json()
  }
  return source.session
}
