import type { Frame } from '../Types/Types.ts'
import { replayCss } from '../ReplayCss/ReplayCss.ts'
import { normalizeDom } from '../ReplayDom/ReplayDom.ts'

export const prepareFrame = (frame: Frame, assetBaseUrl?: string): Frame => ({
  documentElement: {
    className: typeof frame.documentElement?.className === 'string' ? frame.documentElement.className : '',
    style: replayCss(typeof frame.documentElement?.style === 'string' ? frame.documentElement.style : '', assetBaseUrl, true),
  },
  dom: normalizeDom(frame.dom, assetBaseUrl),
  styles: (frame.styles || []).filter((value) => typeof value === 'string').map((css) => replayCss(css, assetBaseUrl)),
  viewport: frame.viewport.map((value) => Math.max(1, Math.min(16_384, value))) as [number, number],
})
