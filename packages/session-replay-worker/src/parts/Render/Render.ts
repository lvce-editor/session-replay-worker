import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import type { Frame, ReplayNode } from '../Types/Types.ts'
import { getSessionReplayVirtualDom } from '../GetSessionReplayVirtualDom/GetSessionReplayVirtualDom.ts'
import { prepareFrame } from '../PrepareFrame/PrepareFrame.ts'

export interface ViewRender {
  delay?: number
  dom: ReplayNode
  frame?: Frame
  preview?: { frame: Frame; position: number; x: number; y: number; width: number; height: number; scale: number; time: string }
  previewEnabled: boolean
}

export const render = (oldState: SessionReplayState, state: SessionReplayState): ViewRender => {
  const result: ViewRender = {
    delay: state.playing ? 50 : undefined,
    dom: getSessionReplayVirtualDom(state),
    frame: state.frame && state.frame !== oldState.frame ? prepareFrame(state.frame, state.assetBaseUrl) : undefined,
    previewEnabled: state.previewEnabled,
  }
  if (state.preview) {
    const { frame, position, width: windowWidth, x, y } = state.preview
    const prepared = prepareFrame(frame, state.assetBaseUrl)
    const [width, height] = prepared.viewport
    const scale = Math.min(280 / width, 158 / height, Math.max(1, windowWidth - 24) / width)
    result.preview = { frame: prepared, height, position, scale, time: `${(position / 1000).toFixed(1)} s`, width, x, y }
  }
  return result
}
