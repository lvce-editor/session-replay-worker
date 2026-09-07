import * as api from '../session-replay-worker/src/api/index.ts'
window.api = api

declare global {
  interface Window {
    api: typeof api
    client: api.ReplayClient
    hacked?: boolean
    localId: string
    session: api.Session
  }
}
