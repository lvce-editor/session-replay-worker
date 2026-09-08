import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'

export const seek = (state: SessionReplayState, position: number, now: number): SessionReplayState => {
  if (!state.content) return state
  const result = state.content.seek(position)
  return { ...state, ...result, error: '', origin: now - result.position, playing: state.playing && result.position < result.duration }
}
