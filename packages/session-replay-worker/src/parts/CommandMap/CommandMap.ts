import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import type { ViewEvent } from '../ViewEvent/ViewEvent.ts'
import * as HandlePointer from '../HandlePointer/HandlePointer.ts'
import * as Preview from '../Preview/Preview.ts'
import { seek } from '../Seek/Seek.ts'
import { tick } from '../Tick/Tick.ts'
import { togglePlay } from '../TogglePlay/TogglePlay.ts'

export const dispatch = (state: SessionReplayState, event: ViewEvent): SessionReplayState => {
  switch (event.type) {
    case 'hidePreview':
      return Preview.hidePreview(state)
    case 'pointerDown':
      return HandlePointer.pointerDown(state, event.point, event.now)
    case 'pointerMove':
      return HandlePointer.pointerMove(state, event.point, event.now)
    case 'pointerUp':
      return HandlePointer.pointerUp(state, event.pointerId)
    case 'preview':
      return Preview.preview(state, event.point)
    case 'seek':
      return seek(state, event.position, event.now)
    case 'setPreviewEnabled':
      return Preview.setPreviewEnabled(state, event.enabled)
    case 'tick':
      return tick(state, event.now)
    case 'togglePlay':
      return togglePlay(state, event.now)
  }
}
