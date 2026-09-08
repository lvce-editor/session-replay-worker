import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import type { ViewRender } from '../ViewRender/ViewRender.ts'
import { getSessionReplayVirtualDom } from '../GetSessionReplayVirtualDom/GetSessionReplayVirtualDom.ts'
import { prepareFrame } from '../PrepareFrame/PrepareFrame.ts'

export const render = (oldState: SessionReplayState, state: SessionReplayState): ViewRender => {
  const result: ViewRender = {
    delay: state.playing ? 50 : undefined,
    dom: getSessionReplayVirtualDom(state),
    frame: state.frame && state.frame !== oldState.frame ? prepareFrame(state.frame, state.assetBaseUrl) : undefined,
    previewEnabled: state.previewEnabled,
  }
  if (state.preview) {
    const { frame, position, width: windowWidth, x, y } = state.preview
    const [width, height] = frame.viewport
    const scale = Math.min(280 / width, 158 / height, Math.max(1, windowWidth - 24) / width)
    result.preview = { frame, height, position, scale, time: `${(position / 1000).toFixed(1)} s`, width, x, y }
  }
  return result
}
