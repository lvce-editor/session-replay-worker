import type { ReplayNode } from '../Types/Types.ts'

export const element = (tag: string, attrs: Record<string, string> = {}, children: ReplayNode[] = [], svg = false): ReplayNode => ({
  attrs,
  children,
  svg,
  tag,
})
