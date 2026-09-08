// cspell:ignore valuetext
import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'
import type { ReplayNode } from '../Types/Types.ts'
import { getActivityChart } from '../ActivityChart/ActivityChart.ts'
import { playerStyles } from '../PlayerStyles/PlayerStyles.ts'
import { element } from '../VirtualDom/VirtualDom.ts'

const getControlsVirtualDom = (state: SessionReplayState): ReplayNode => {
  const { duration, error, playing, position, previewEnabled } = state
  const fraction = duration > 0 ? position / duration : 0
  const time = `${(position / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} s`
  const label = playing ? 'Pause' : 'Play'
  const disabled: Record<string, string> = state.content ? {} : { disabled: '' }
  const icon = element(
    'svg',
    { 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 24 24' },
    [element('path', { d: playing ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M8 4v16l12-8z' }, [], true)],
    true,
  )
  const maximum = String(Math.ceil(duration))
  return element('div', { 'aria-label': 'Session replay controls', class: 'SessionReplayControls', role: 'group' }, [
    element('button', { ...disabled, 'aria-label': label, class: 'SessionReplayPlay', title: label, type: 'button' }, [icon]),
    getActivityChart(state.activity, fraction),
    {
      ...element('input', {
        ...disabled,
        'aria-label': 'Session replay position',
        'aria-valuetext': time,
        class: 'SessionReplayPosition',
        max: maximum,
        min: '0',
        step: '1',
        style: `--replay-progress:${fraction * 100}%`,
        type: 'range',
      }),
      value: String(Math.round(position)),
    },
    element('output', { 'aria-live': error ? 'assertive' : 'off', class: 'SessionReplayTime', ...(error && { role: 'alert' }) }, [
      { text: error || time },
    ]),
    element('label', { class: 'SessionReplayPreviewSetting' }, [
      { ...element('input', { type: 'checkbox' }), checked: previewEnabled },
      { text: 'Timeline previews' },
    ]),
  ])
}

export const getSessionReplayVirtualDom = (state: SessionReplayState): ReplayNode => {
  const previewTime = state.preview ? `${(state.preview.position / 1000).toFixed(1)} s` : ''
  return element(
    'div',
    {
      class: 'SessionReplay',
      style: 'position:fixed;inset:0;margin:0;display:flex;flex-direction:column;background:#202020;color:white;z-index:2147483647',
    },
    [
      element('style', {}, [{ text: playerStyles }]),
      element('div', { style: 'flex:1;min-height:0;overflow:auto;position:relative' }, [
        element('div', { class: 'SessionReplaySurface', inert: '', style: 'display:block;contain:strict;pointer-events:none;background:white' }),
      ]),
      getControlsVirtualDom(state),
      element('div', { 'aria-hidden': 'true', class: 'SessionReplayPreview', inert: '', ...(!state.preview && { hidden: '' }) }, [
        element('div', { class: 'SessionReplayPreviewImage' }),
        element('div', { class: 'SessionReplayPreviewTime' }, [{ text: previewTime }]),
      ]),
    ],
  )
}
