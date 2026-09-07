export interface ReplayNode {
  attrs?: Record<string, string>
  checked?: boolean
  children?: ReplayNode[]
  scroll?: [number, number]
  svg?: boolean
  tag?: string
  text?: string | null
  value?: string
}

export interface Frame {
  documentElement?: { className: string; style: string }
  dom: ReplayNode
  styles: string[]
  viewport: [number, number]
}

export type ReplayEvent = { sequence: number; timestamp: number } & ({ type: 'frame'; data: Frame } | { type: 'message'; data: unknown })

export interface SessionMetadata {
  createdAt: string
  id: string
  version: number
}

export interface Session extends SessionMetadata {
  events: ReplayEvent[]
}

export interface RecordingOptions {
  endpoint?: string
  local: boolean
  token?: string
  upload: boolean
}

export interface RecordingStatus {
  bytes: number
  error: string
  events: number
  id?: string
  pending: number
  saved: number
  uploaded: number
}

export interface SeekResult {
  duration: number
  frame: Frame
  position: number
}

// Imported recordings are untrusted until validated by the worker.
export type ReplaySource = { localId: string } | { url: string } | { session: unknown }
export type RecordParams = [type: 'frame', data: Frame] | [type: 'message', data: unknown]

export interface WorkerCommands {
  export(): Session
  flush(): Promise<void>
  load(source: ReplaySource): Promise<SeekResult>
  record(...params: RecordParams): Promise<void>
  seek(timestamp: number): SeekResult
  start(options: RecordingOptions): Promise<string>
  status(): RecordingStatus
  stop(): Promise<void>
}

export interface ReplayClient {
  dispose(): void
  invoke<K extends keyof WorkerCommands>(method: K, ...params: Parameters<WorkerCommands[K]>): Promise<Awaited<ReturnType<WorkerCommands[K]>>>
}

export interface PlayerOptions {
  source: ReplaySource
  workerUrl: string | URL
}
