import type { ProxyMessage } from '../Proxy/Proxy.ts'
import type { Frame, ReplayEvent, ReplayNode } from '../Types/Types.ts'
import { createVisualState } from '../VisualState/VisualState.ts'

const hasWorkbench = (node: ReplayNode): boolean => {
  if (node.attrs?.id === 'Workbench' && node.children?.length) return true
  return node.children?.some(hasWorkbench) || false
}

// The editor assembles its layout off-screen, then attaches the complete workbench.
// Keep all earlier commands for reconstruction, but omit this startup time from playback.
export const getPlaybackStart = (events: readonly ReplayEvent[], initial: Frame): number => {
  const visual = initial.commandReplay ? createVisualState(initial) : undefined
  for (const event of events) {
    if (visual) {
      if (event.type === 'message') visual.accept(event.data as ProxyMessage)
      if (hasWorkbench(visual.frame().dom)) return event.timestamp
    } else if (event.type === 'frame' && hasWorkbench(event.data.dom)) return event.timestamp
  }
  // Older and non-editor recordings may not contain a workbench boundary.
  return 0
}
