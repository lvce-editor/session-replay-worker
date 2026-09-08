import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import * as Protocol from '../Protocol/Protocol.ts'

export const loadContent = (state: SessionReplayState, session: unknown): SessionReplayState => {
  const content = Protocol.loadContent(session)
  return {
    ...state,
    ...content.seek(0),
    activity: content.activity,
    content,
    error: '',
    origin: 0,
    playing: false,
    pointerId: undefined,
    preview: undefined,
  }
}
