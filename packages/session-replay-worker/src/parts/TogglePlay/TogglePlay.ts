import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import { seek } from '../Seek/Seek.ts'

export const togglePlay = (state: SessionReplayState, now: number): SessionReplayState => {
  if (!state.content) return state
  if (state.playing) return { ...state, playing: false }
  return seek({ ...state, playing: true }, state.position >= state.duration ? 0 : state.position, now)
}
