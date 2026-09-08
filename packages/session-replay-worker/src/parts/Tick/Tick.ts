import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import { seek } from '../Seek/Seek.ts'

export const tick = (state: SessionReplayState, now: number): SessionReplayState => (state.playing ? seek(state, now - state.origin, now) : state)
