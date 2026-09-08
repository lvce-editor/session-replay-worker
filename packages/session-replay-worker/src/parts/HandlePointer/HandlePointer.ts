import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import type { TimelinePoint } from '../ViewEvent/ViewEvent.ts'
import { getTimelinePosition } from '../Preview/Preview.ts'
import { seek } from '../Seek/Seek.ts'

export const pointerDown = (state: SessionReplayState, point: TimelinePoint, now: number): SessionReplayState => {
  if (!state.content || point.width <= 0) return state
  return seek({ ...state, pointerId: point.pointerId }, getTimelinePosition(state, point), now)
}
export const pointerMove = (state: SessionReplayState, point: TimelinePoint, now: number): SessionReplayState =>
  state.pointerId === point.pointerId ? seek(state, getTimelinePosition(state, point), now) : state
export const pointerUp = (state: SessionReplayState, pointerId: number): SessionReplayState =>
  state.pointerId === pointerId ? { ...state, pointerId: undefined } : state
