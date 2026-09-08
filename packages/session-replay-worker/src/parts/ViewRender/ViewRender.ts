import type { Frame, ReplayNode } from '../Types/Types.ts'

export interface ViewRender {
  delay?: number
  dom: ReplayNode
  frame?: Frame
  preview?: { frame: Frame; position: number; x: number; y: number; width: number; height: number; scale: number; time: string }
  previewEnabled: boolean
}
