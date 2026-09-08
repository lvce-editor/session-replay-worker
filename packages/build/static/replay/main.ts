import { mountPlayer } from '../../../session-replay-worker/src/parts/Player/Player.ts'

const input = document.querySelector<HTMLInputElement>('#session')!
const error = document.querySelector<HTMLElement>('#error')!
const player = document.querySelector<HTMLElement>('#player')!

input.addEventListener('change', async () => {
  const [file] = input.files!
  if (!file) return
  input.disabled = true
  error.textContent = ''
  try {
    const session = JSON.parse(await file.text())
    await mountPlayer(player, { workerUrl: new URL('../dist/sessionReplayWorkerMain.js', import.meta.url), source: { session } })
  } catch (cause) {
    error.textContent = `Cannot open recording: ${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    input.disabled = false
    input.value = ''
  }
})
