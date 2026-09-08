import type { PlayerOptions, SeekResult } from '../Types/Types.ts'
import { createClient } from '../Client/Client.ts'
import { createReplayRoot, renderFrame } from '../RenderFrame/RenderFrame.ts'
import { playerStyles } from '../PlayerStyles/PlayerStyles.ts'
export { renderFrame } from '../RenderFrame/RenderFrame.ts'

export const mountPlayer = async (container: HTMLElement, { assetBaseUrl, source, workerUrl }: PlayerOptions): Promise<() => void> => {
  const { ownerDocument } = container
  const assets = assetBaseUrl ? new URL(assetBaseUrl, ownerDocument.baseURI) : undefined
  if (
    assets &&
    (assets.origin !== new URL(ownerDocument.baseURI).origin ||
      !/^https?:$/.test(assets.protocol) ||
      !/^[\w/.-]+$/.test(assets.pathname) ||
      assets.username ||
      assets.password)
  )
    throw new Error('Replay assets must be served from the same origin')
  if (assets) {
    assets.search = assets.hash = ''
    if (!assets.pathname.endsWith('/')) assets.pathname += '/'
  }
  const client = createClient(workerUrl)
  container.replaceChildren()
  container.className = 'SessionReplay'
  container.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;background:#202020;color:white;z-index:2147483647'
  const document = container.ownerDocument
  const style = document.createElement('style')
  style.textContent = playerStyles
  const viewport = document.createElement('div')
  viewport.style.cssText = 'flex:1;min-height:0;overflow:auto;position:relative'
  const surface = createReplayRoot(document)
  viewport.append(surface)
  const controls = document.createElement('div')
  controls.className = 'SessionReplayControls'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', 'Session replay controls')
  const play = document.createElement('button')
  play.type = 'button'
  play.className = 'SessionReplayPlay'
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  icon.append(path)
  play.append(icon)
  const updatePlayButton = (playing: boolean): void => {
    const label = playing ? 'Pause' : 'Play'
    play.setAttribute('aria-label', label)
    play.title = label
    path.setAttribute('d', playing ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M8 4v16l12-8z')
  }
  updatePlayButton(false)
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.step = '1'
  slider.value = '0'
  slider.setAttribute('aria-label', 'Session replay position')
  slider.className = 'SessionReplayPosition'
  const status = document.createElement('output')
  status.className = 'SessionReplayTime'
  // Playback updates frequently; announce the position only when the slider is used.
  status.setAttribute('aria-live', 'off')
  controls.append(play, slider, status)
  container.append(style, viewport, controls)
  let disposed = false
  let playing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0
  let position = 0
  let duration = 0
  const show = (result: SeekResult): void => {
    ;({ duration, position } = result)
    slider.max = String(Math.ceil(duration))
    slider.value = String(Math.round(position))
    slider.style.setProperty('--replay-progress', `${duration > 0 ? (position / duration) * 100 : 0}%`)
    const time = `${(position / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} s`
    slider.ariaValueText = time
    status.textContent = time
    renderFrame(surface.shadowRoot!, result.frame, assets?.href)
  }
  const pause = (): void => {
    playing = false
    clearTimeout(timer)
    updatePlayButton(false)
  }
  const seek = async (time: number): Promise<void> => {
    const id = ++requestId
    const result = await client.invoke('seek', time)
    if (!disposed && id === requestId) show(result)
  }
  const report = (error: unknown): void => {
    pause()
    status.setAttribute('role', 'alert')
    status.setAttribute('aria-live', 'assertive')
    status.textContent = error instanceof Error ? error.message : String(error)
  }
  slider.oninput = (): void => {
    pause()
    void seek(Number(slider.value)).catch(report)
  }
  play.onclick = (): void => {
    if (playing) {
      pause()
      return
    }
    playing = true
    updatePlayButton(true)
    const origin = performance.now() - (position >= duration ? 0 : position)
    const tick = async (): Promise<void> => {
      if (!playing || disposed) return
      try {
        await seek(performance.now() - origin)
        if (position >= duration) pause()
        else if (playing)
          timer = setTimeout(() => {
            void tick()
          }, 50)
      } catch (error) {
        report(error)
      }
    }
    void tick()
  }
  try {
    const initial = await client.invoke('load', source)
    show(initial)
  } catch (error) {
    play.disabled = slider.disabled = true
    report(error)
  }
  return () => {
    disposed = true
    pause()
    client.dispose()
    container.replaceChildren()
  }
}
