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
