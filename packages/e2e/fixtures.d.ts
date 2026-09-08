import type * as api from '../session-replay-worker/src/parts/Api/Api.ts'

declare global {
  interface Window {
    api: typeof api
    client: api.ReplayClient
    hacked?: boolean
    localId: string
    session: api.Session
    stopObserving: () => void
  }
}
