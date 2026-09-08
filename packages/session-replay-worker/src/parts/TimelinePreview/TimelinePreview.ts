import type { ViewRender } from '../ViewRender/ViewRender.ts'
import { disposeFrame, renderPreparedFrame } from '../RenderFrame/RenderFrame.ts'

export const createTimelinePreview = (
  container: HTMLElement,
): { render: (preview: ViewRender['preview'], enabled: boolean) => void; dispose: () => void } => {
  const document = container.ownerDocument
  const view = document.defaultView!
  const popup = container.querySelector<HTMLElement>(':scope > .SessionReplay > .SessionReplayPreview')!
  const image = popup.querySelector<HTMLElement>('.SessionReplayPreviewImage')!
  let frame: HTMLIFrameElement | undefined
  const removeFrame = (): void => {
    if (frame?.contentDocument) disposeFrame(frame.contentDocument)
    frame?.remove()
    frame = undefined
  }
  return {
    dispose(): void {
      removeFrame()
      popup.remove()
    },
    render(preview: ViewRender['preview'], enabled: boolean): void {
      if (!enabled) removeFrame()
      if (!preview) return
      if (!frame) {
        frame = document.createElement('iframe')
        frame.title = 'Session replay preview'
        frame.tabIndex = -1
        frame.setAttribute('sandbox', 'allow-same-origin')
        image.append(frame)
      }
      const { height, scale, width, x, y } = preview
      frame.style.width = `${width}px`
      frame.style.height = `${height}px`
      frame.style.transform = `scale(${scale})`
      image.style.width = `${width * scale}px`
      image.style.height = `${height * scale}px`
      renderPreparedFrame(frame.contentDocument!, preview.frame)
      const bounds = popup.getBoundingClientRect()
      popup.style.left = `${Math.max(8, Math.min(view.innerWidth - bounds.width - 8, x - bounds.width / 2))}px`
      popup.style.top = `${Math.max(8, y - bounds.height - 8)}px`
    },
  }
}
