import type { Locator, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.api)
})
const roundTrip = async (page: Page): Promise<Locator> => {
  await page.evaluate(async () => {
    const client = window.api.createClient('/dist/sessionReplayWorkerMain.js')
    const id = await client.invoke('start', { local: true, upload: false })
    await client.invoke('record', 'frame', window.api.capture(document))
    window.session = await client.invoke('export')
    window.localId = id
    await client.invoke('stop')
    client.dispose()
    await window.api.mountPlayer(document.body, { source: { localId: id }, workerUrl: '/dist/sessionReplayWorkerMain.js' })
  })
  return page.locator('.SessionReplaySurface')
}

test('replays the assembled explorer and editor DOM using only the replay worker', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => {
    workers.push(worker.url())
  })
  const replay = await roundTrip(page)
  await expect(replay.locator('.Explorer')).toContainText('hello.js')
  await expect(replay.locator('.Editor')).toContainText('const answer = 42')
  expect(workers.every((url) => url.endsWith('/dist/sessionReplayWorkerMain.js'))).toBe(true)
})

const timeline = async (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const before = window.api.capture(document)
    document.querySelector('.Editor')!.textContent = 'edited after typing'
    document.querySelector('.Explorer')!.remove()
    const after = window.api.capture(document)
    await window.api.mountPlayer(document.body, {
      source: {
        session: {
          events: [
            { data: before, sequence: 0, timestamp: 0, type: 'frame' },
            { data: after, sequence: 1, timestamp: 1000, type: 'frame' },
            { data: {}, sequence: 2, timestamp: 1500, type: 'message' },
          ],
          version: 1,
        },
      },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })

test('local recordings survive page reload', async ({ page }) => {
  await roundTrip(page)
  const id = await page.evaluate(() => window.localId)
  await page.reload()
  await page.waitForFunction(() => window.api)
  await page.evaluate(
    async (localId) => window.api.mountPlayer(document.body, { source: { localId }, workerUrl: '/dist/sessionReplayWorkerMain.js' }),
    id,
  )
  await expect(page.locator('.SessionReplaySurface').locator('.Editor')).toContainText('const answer')
})

test('replay icon button supports keyboard play, pause and seeking', async ({ page }) => {
  await timeline(page)
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  const controls = page.getByRole('group', { name: 'Session replay controls' })
  const play = controls.getByRole('button', { exact: true, name: 'Play' })
  await expect(play.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  const playIcon = await play.locator('path').getAttribute('d')
  await play.focus()
  await page.keyboard.press('Space')
  const pause = controls.getByRole('button', { exact: true, name: 'Pause' })
  await expect(pause).toBeFocused()
  await expect(pause.locator('path')).not.toHaveAttribute('d', playIcon!)
  await page.keyboard.press('Space')
  await expect(play).toBeFocused()
  await expect(play.locator('path')).toHaveAttribute('d', playIcon!)
  await page.keyboard.press('Tab')
  const slider = controls.getByRole('slider')
  await expect(slider).toBeFocused()
  await page.keyboard.press('End')
  await expect(slider).toHaveValue('1500')
  await expect(slider).toHaveJSProperty('ariaValueText', '1.5 / 1.5 s')
  await expect(slider).toHaveCSS('--replay-progress', '100%')
  await page.keyboard.press('Home')
  await expect(slider).toHaveValue('0')
  await expect(slider).toHaveCSS('--replay-progress', '0%')
})

test('replay controls fit a narrow viewport with usable pointer targets', async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 })
  await timeline(page)
  const controls = page.getByRole('group', { name: 'Session replay controls' })
  const button = await controls.getByRole('button').boundingBox()
  const slider = await controls.getByRole('slider').boundingBox()
  const status = await controls.locator('output').boundingBox()
  expect(button!.width).toBeGreaterThanOrEqual(44)
  expect(button!.height).toBeGreaterThanOrEqual(44)
  expect(slider!.height).toBeGreaterThanOrEqual(24)
  expect(slider!.width).toBeGreaterThan(50)
  expect(button!.x + button!.width).toBeLessThan(slider!.x)
  expect(slider!.x + slider!.width).toBeLessThan(status!.x)
  expect(status!.x + status!.width).toBeLessThanOrEqual(320)
})

test('activity chart shows quiet gaps and peaks, and clicking it pauses and seeks', async ({ page }) => {
  await page.evaluate(async () => {
    const before = window.api.capture(document)
    document.querySelector('.Editor')!.textContent = 'activity near the end'
    const after = window.api.capture(document)
    await window.api.mountPlayer(document.body, {
      source: {
        session: {
          events: [
            { data: before, sequence: 0, timestamp: 0, type: 'frame' },
            { data: {}, sequence: 1, timestamp: 2000, type: 'message' },
            { data: {}, sequence: 2, timestamp: 2100, type: 'message' },
            { data: after, sequence: 3, timestamp: 8000, type: 'frame' },
            { data: {}, sequence: 4, timestamp: 8050, type: 'message' },
            { data: {}, sequence: 5, timestamp: 8100, type: 'message' },
            { data: {}, sequence: 6, timestamp: 10_000, type: 'message' },
          ],
          version: 1,
        },
      },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  await expect(chart).toBeVisible()
  const fills = await chart.locator('path').evaluate((node) => {
    const path = node as SVGPathElement
    return [
      path.isPointInFill(new DOMPoint(1, 47)),
      path.isPointInFill(new DOMPoint(120, 47)),
      path.isPointInFill(new DOMPoint(49, 47)),
      path.isPointInFill(new DOMPoint(49, 10)),
      path.isPointInFill(new DOMPoint(193, 10)),
    ]
  })
  expect(fills).toEqual([false, false, true, false, true])
  const bounds = (await chart.boundingBox())!
  const slider = page.getByRole('slider')
  const sliderBounds = (await slider.boundingBox())!
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(sliderBounds.y)
  expect(bounds.x).toBeCloseTo(sliderBounds.x + 6.5)
  expect(bounds.width).toBeCloseTo(sliderBounds.width - 13)
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.getByRole('button', { exact: true, name: 'Play' }).click()
  await expect(page.getByRole('button', { exact: true, name: 'Pause' })).toBeVisible()
  await chart.click({ position: { x: bounds.width * 0.82, y: 24 } })
  await expect(page.getByRole('button', { exact: true, name: 'Play' })).toBeVisible()
  await expect(page.locator('.SessionReplaySurface').locator('.Editor')).toHaveText('activity near the end')
  expect(Number(await slider.inputValue())).toBeGreaterThanOrEqual(8100)
  expect(Number(await slider.inputValue())).toBeLessThan(8300)
  await expect(slider).toBeFocused()
  await page.keyboard.press('Home')
  await expect(slider).toHaveValue('0')
  await expect(chart.locator('line')).toHaveAttribute('x1', '0')
  await page.keyboard.press('End')
  await expect(slider).toHaveValue('10000')
  await expect(chart.locator('line')).toHaveAttribute('x1', '240')
})

test('a zero-duration replay has a flat activity chart and can be clicked safely', async ({ page }) => {
  await page.evaluate(async () => {
    const frame = window.api.capture(document)
    await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  await expect(chart.locator('path')).toHaveAttribute('d', '')
  await chart.click()
  await expect(page.getByRole('slider')).toHaveValue('0')
  await expect(page.locator('output')).toHaveText('0.0 / 0.0 s')
})
