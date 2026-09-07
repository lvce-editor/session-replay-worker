import { mountPlayer } from './dist/player.js'

const input = document.querySelector('#session')
const error = document.querySelector('#error')
const player = document.querySelector('#player')

input.addEventListener('change', async () => {
  const [file] = input.files
  if (!file) return
  input.disabled = true
  error.textContent = ''
  try {
    const session = JSON.parse(await file.text())
    await mountPlayer(player, { workerUrl: new URL('./dist/sessionReplayWorkerMain.js', import.meta.url), source: { session } })
  } catch (cause) {
    error.textContent = `Cannot open recording: ${cause.message}`
  } finally {
    input.disabled = false
    input.value = ''
  }
})
