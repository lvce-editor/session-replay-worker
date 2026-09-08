import type { SessionReplayState, TimelinePoint } from '../SessionReplayState/SessionReplayState.ts'

export const getTimelinePosition = (state: SessionReplayState, point: TimelinePoint): number => {
  const inset = point.slider ? 6.5 : 0
  const width = point.width - inset * 2
  return width > 0 ? Math.max(0, Math.min(1, (point.x - point.left - inset) / width)) * state.duration : 0
}

export const hidePreview = (state: SessionReplayState): SessionReplayState => ({ ...state, preview: undefined })
export const setPreviewEnabled = (state: SessionReplayState, enabled: boolean): SessionReplayState => ({
  ...state,
  preview: undefined,
  previewEnabled: enabled,
})
export const preview = (state: SessionReplayState, point: TimelinePoint): SessionReplayState => {
  if (!state.previewEnabled || !state.content || point.pointerType === 'touch' || point.width <= (point.slider ? 13 : 0)) return state
  try {
    const result = state.content.preview(getTimelinePosition(state, point))
    return { ...state, preview: { frame: result.frame, position: result.position, width: point.windowWidth, x: point.x, y: point.top } }
  } catch {
    return hidePreview(state)
  }
}
