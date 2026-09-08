import type { ViewRender } from '../Render/Render.ts'
import type { SessionReplayState, ViewEvent } from '../SessionReplayState/SessionReplayState.ts'
import type { ReplayStorage } from '../Storage/Storage.ts'
import type { ReplaySource } from '../Types/Types.ts'
import { dispatch } from '../CommandMap/CommandMap.ts'
import { create } from '../Create/Create.ts'
import { loadContent } from '../LoadContent/LoadContent.ts'
import { loadSource } from '../LoadSource/LoadSource.ts'
import { render } from '../Render/Render.ts'

export interface SessionReplayView {
  create: (uid: number, enabled: boolean, assetBaseUrl?: string) => ViewRender
  dispatch: (uid: number, event: ViewEvent, sequence: number) => ViewRender
  dispose: (uid: number) => void
  loadContent: (uid: number, source: ReplaySource) => Promise<ViewRender>
  render: (uid: number) => ViewRender
}

export const createSessionReplayView = (getStorage: () => Promise<ReplayStorage>): SessionReplayView => {
  const states = new Map<number, SessionReplayState>()
  const get = (uid: number): SessionReplayState => {
    const state = states.get(uid)
    if (!state) throw new Error('Unknown session replay view')
    return state
  }
  const update = (oldState: SessionReplayState, state: SessionReplayState): ViewRender => {
    try {
      const result = render(oldState, state)
      states.set(state.uid, state)
      return result
    } catch (error) {
      const failed = { ...oldState, error: error instanceof Error ? error.message : String(error), playing: false, preview: undefined }
      states.set(state.uid, failed)
      return render(failed, failed)
    }
  }
  return {
    create(uid: number, enabled: boolean, assetBaseUrl?: string): ViewRender {
      const state = create(uid, enabled, assetBaseUrl)
      states.set(uid, state)
      return render(state, state)
    },
    dispatch(uid: number, event: ViewEvent, sequence: number): ViewRender {
      const previous = get(uid)
      if (sequence < previous.sequence) return render(previous, previous)
      try {
        return update(previous, { ...dispatch(previous, event), sequence })
      } catch (error) {
        return update(previous, { ...previous, error: error instanceof Error ? error.message : String(error), playing: false, sequence })
      }
    },
    dispose(uid: number): void {
      states.delete(uid)
    },
    async loadContent(uid: number, source: ReplaySource): Promise<ViewRender> {
      const previous = get(uid)
      try {
        const session = await loadSource(source, getStorage)
        if (states.get(uid) !== previous) throw new Error('Session replay view was replaced')
        return update(previous, loadContent(previous, session))
      } catch (error) {
        if (states.get(uid) !== previous) throw error
        return update(previous, { ...previous, error: error instanceof Error ? error.message : String(error), playing: false })
      }
    },
    render(uid: number): ViewRender {
      const state = get(uid)
      return render({ ...state, frame: undefined }, state)
    },
  }
}
