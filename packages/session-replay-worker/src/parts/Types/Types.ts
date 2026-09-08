import type { ViewRender } from '../Render/Render.ts'
import type { ViewEvent } from '../SessionReplayState/SessionReplayState.ts'
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
  commandReplay?: boolean
  documentElement?: { className: string; style: string }
  dom: ReplayNode
  styles: string[]
  viewport: [number, number]
}

export type ReplayEvent = { sequence: number; timestamp: number } & ({ type: 'frame'; data: Frame } | { type: 'message'; data: unknown })

export interface SessionMetadata {
  createdAt: string
  id: string
  platform?: string
  userAgent?: string
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
  'SessionReplay.create'(uid: number, enabled: boolean, assetBaseUrl?: string): ViewRender
  'SessionReplay.dispatch'(uid: number, event: ViewEvent, sequence: number): ViewRender
  'SessionReplay.dispose'(uid: number): void
  'SessionReplay.loadContent'(uid: number, source: ReplaySource): Promise<ViewRender>
  'SessionReplay.render'(uid: number): ViewRender
  export(): Session | Promise<Session>
  flush(): Promise<void>
  load(source: ReplaySource): Promise<SeekResult & { activity: number[] }>
  preview(timestamp: number): SeekResult
  proxy(port: MessagePort): MessagePort
  record(...params: RecordParams): Promise<void>
  seek(timestamp: number): SeekResult
  start(options: RecordingOptions, initialFrame?: Frame): Promise<string>
  status(): RecordingStatus
  stop(): Promise<void>
}

export interface ReplayClient {
  dispose(): void
  invoke<K extends keyof WorkerCommands>(method: K, ...params: Parameters<WorkerCommands[K]>): Promise<Awaited<ReturnType<WorkerCommands[K]>>>
  invokeAndTransfer<K extends keyof WorkerCommands>(
    method: K,
    ...params: Parameters<WorkerCommands[K]>
  ): Promise<Awaited<ReturnType<WorkerCommands[K]>>>
}

export interface PlayerOptions {
  /** Same-origin directory containing trusted icons, fonts, file-icons and extension images. */
  assetBaseUrl?: string | URL
  source: ReplaySource
  /** Enable timeline hover previews; otherwise use the saved player setting (default true). */
  timelinePreviewEnabled?: boolean
  workerUrl: string | URL
}
