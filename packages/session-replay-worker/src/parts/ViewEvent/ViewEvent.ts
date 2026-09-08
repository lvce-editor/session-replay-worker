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
