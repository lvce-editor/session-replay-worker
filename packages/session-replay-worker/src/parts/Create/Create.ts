import type { SessionReplayState } from '../SessionReplayState/SessionReplayState.ts'

export const create = (uid: number, previewEnabled = true, assetBaseUrl?: string): SessionReplayState => ({
  activity: [],
  assetBaseUrl,
  duration: 0,
  error: '',
  origin: 0,
  playing: false,
  position: 0,
  previewEnabled,
  sequence: 0,
  uid,
})
