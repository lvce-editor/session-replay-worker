import type { loadContent } from '../Protocol/Protocol.ts'
import type { Frame } from '../Types/Types.ts'

export interface SessionReplayState {
  readonly activity: readonly number[]
  readonly assetBaseUrl?: string
  readonly content?: ReturnType<typeof loadContent>
  readonly duration: number
  readonly error: string
  readonly frame?: Frame
  readonly origin: number
  readonly playing: boolean
  readonly pointerId?: number
  readonly position: number
  readonly preview?: { frame: Frame; position: number; x: number; y: number; width: number }
  readonly previewEnabled: boolean
  readonly sequence: number
  readonly uid: number
}

export interface TimelinePoint {
  left: number
  pointerId: number
  pointerType: string
  slider: boolean
  top: number
  width: number
  windowWidth: number
  x: number
}

export type ViewEvent =
  | { type: 'togglePlay'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'seek'; position: number; now: number }
  | { type: 'pointerDown'; point: TimelinePoint; now: number }
  | { type: 'pointerMove'; point: TimelinePoint; now: number }
  | { type: 'pointerUp'; pointerId: number }
  | { type: 'preview'; point: TimelinePoint }
  | { type: 'hidePreview' }
  | { type: 'setPreviewEnabled'; enabled: boolean }
