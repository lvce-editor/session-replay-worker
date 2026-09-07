interface ReplaySession {
  events: { sequence: number; timestamp: number; type: string; data: unknown }[]
  version: number
}

interface ReplayClient {
  dispose(): void
  invoke(method: 'start', options: { local: boolean; upload: boolean }): Promise<string>
  invoke(method: 'record', type: string, data: unknown): Promise<void>
  invoke(method: 'export'): Promise<ReplaySession>
  invoke(method: 'status'): Promise<{ events: number }>
  invoke(method: 'stop'): Promise<void>
}

interface Window {
  api: {
    capture(document: Document): unknown
    createClient(url: string): ReplayClient
    mountPlayer(container: HTMLElement, options: { workerUrl: string; source: { localId: string } | { session: ReplaySession } }): Promise<() => void>
    observe(document: Document, record: (type: string, data: unknown) => Promise<void>, onError: (error: Error) => void): () => void
  }
  client: ReplayClient
  hacked?: boolean
  localId: string
  session: ReplaySession
  stopObserving: () => void
}
