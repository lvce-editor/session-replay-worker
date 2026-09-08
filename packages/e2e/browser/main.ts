import { cases } from './cases.ts'

const list = document.querySelector('ol')!
const summary = document.querySelector<HTMLOutputElement>('#summary')!
const runAll = document.querySelector<HTMLButtonElement>('#run-all')!
const stage = document.querySelector<HTMLElement>('#stage')!
const selected = new URL(location.href).searchParams.get('test')
const visible = selected ? cases.filter((item) => item.name === selected) : cases

const runCase = (name: string): Promise<string> =>
  new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.title = name
    frame.width = '1280'
    frame.height = '720'
    const finish = (error: string): void => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      frame.remove()
      resolve(error)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow || event.origin !== location.origin) return
      if (event.data?.type !== 'replay-test-result' || event.data.name !== name || typeof event.data.error !== 'string') return
      finish(event.data.error)
    }
    // Bound a hung worker or missing fixture so the remaining tests can still run.
    // eslint-disable-next-line e2e/no-timeouts
    const timer = setTimeout(finish, 15_000, 'Test timed out after 15 seconds')
    window.addEventListener('message', onMessage)
    frame.src = `./fixture/?test=${encodeURIComponent(name)}`
    stage.replaceChildren(frame)
  })

const rows = visible.map(({ name }) => {
  const row = document.createElement('li')
  const link = document.createElement('a')
  link.href = `?test=${encodeURIComponent(name)}`
  link.textContent = name
  const result = document.createElement('span')
  result.textContent = ' — Not run'
  row.append(link, result)
  list.append(row)
  return { name, result, row }
})

const run = async (): Promise<void> => {
  runAll.disabled = true
  let failed = 0
  summary.dataset.state = 'running'
  for (const [index, { name, result, row }] of rows.entries()) {
    summary.textContent = `Running ${index + 1} of ${rows.length}`
    row.dataset.state = 'running'
    result.textContent = ' — Running'
    const error = await runCase(name)
    if (error) failed++
    row.dataset.state = error ? 'failed' : 'passed'
    result.textContent = error ? ` — Failed: ${error}` : ' — Passed'
  }
  summary.textContent = `${rows.length - failed} passed, ${failed} failed`
  summary.dataset.state = failed ? 'failed' : 'passed'
  runAll.disabled = false
}

runAll.addEventListener('click', () => {
  void run()
})
if (visible.length === 0) {
  summary.textContent = `Unknown test: ${selected}`
  summary.dataset.state = 'failed'
  runAll.disabled = true
} else if (selected) {
  runAll.textContent = 'Run test'
  await run()
} else {
  summary.textContent = `${rows.length} tests ready`
}
