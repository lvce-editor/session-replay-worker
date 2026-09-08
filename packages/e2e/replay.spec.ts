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

test('worker captures the recording browser metadata in local storage and export', async ({ page }) => {
  await roundTrip(page)
  const result = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lvce-session-replays', 1)
      request.onsuccess = (): void => resolve(request.result)
      request.onerror = (): void => reject(request.error || new Error('Could not read local session metadata'))
    })
    const stored = await new Promise((resolve, reject) => {
      const request = database.transaction('sessions').objectStore('sessions').get(window.localId)
      request.onsuccess = (): void => resolve(request.result)
      request.onerror = (): void => reject(request.error || new Error('Could not read local session metadata'))
    })
    database.close()
    return { expected: { platform: navigator.platform, userAgent: navigator.userAgent }, exported: window.session, stored }
  })
  expect(result.expected.userAgent).toContain('Chrome/')
  expect(result.exported).toMatchObject(result.expected)
  expect(result.stored).toMatchObject(result.expected)
})

test('activity chart shows quiet gaps and peaks, and clicking it keeps playback running', async ({ page }) => {
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
  await expect(page.getByRole('button', { exact: true, name: 'Pause' })).toBeVisible()
  await expect(page.locator('.SessionReplaySurface').locator('.Editor')).toHaveText('activity near the end')
  expect(Number(await slider.inputValue())).toBeGreaterThanOrEqual(8100)
  expect(Number(await slider.inputValue())).toBeLessThan(8300)
  await expect(slider).toBeFocused()
  await page.getByRole('button', { exact: true, name: 'Pause' }).click()
  await slider.focus()
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

test('timeline hover previews seek independently and leave the playing frame untouched', async ({ page }) => {
  await timeline(page)
  const slider = page.getByRole('slider')
  const bounds = (await slider.boundingBox())!
  await slider.hover({ position: { x: bounds.width - 7, y: 14 } })
  const popup = page.locator('.SessionReplayPreview')
  const preview = page.frameLocator('iframe[title="Session replay preview"]')
  await expect(popup).toBeVisible()
  await expect(preview.locator('.Editor')).toHaveText('edited after typing')
  await expect(preview.locator('.Explorer')).toHaveCount(0)
  await expect(page.locator('.SessionReplaySurface .Editor')).toContainText('const answer = 42')
  await expect(slider).toHaveValue('0')
  await slider.hover({ position: { x: 7, y: 14 } })
  await expect(preview.locator('.Editor')).toContainText('const answer = 42')
  await expect(preview.locator('.Explorer')).toContainText('hello.js')
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.getByRole('button', { exact: true, name: 'Play' }).click()
  await slider.hover({ position: { x: bounds.width - 7, y: 14 } })
  await page.clock.runFor(100)
  await expect(preview.locator('.Editor')).toHaveText('edited after typing')
  await expect(page.getByRole('button', { exact: true, name: 'Pause' })).toBeVisible()
  expect(Number(await slider.inputValue())).toBeLessThan(1000)
  await page.mouse.move(0, 0)
  await expect(popup).toBeHidden()
})

test('preview styles, root themes and media queries are isolated from playback', async ({ page }) => {
  await page.evaluate(async () => {
    const before = window.api.capture(document)
    before.documentElement = { className: 'before', style: '--editor-color: rgb(0, 128, 0)' }
    before.styles = ['.Editor { color: var(--editor-color) }']
    const after = structuredClone(before)
    after.documentElement = { className: 'after', style: '--editor-color: rgb(255, 0, 0)' }
    after.viewport = [800, 600]
    after.styles = ['.Editor { color: var(--editor-color) } @media (width: 800px) { .Editor { background: rgb(0, 0, 255) } }']
    await window.api.mountPlayer(document.body, {
      source: {
        session: {
          events: [
            { data: before, sequence: 0, timestamp: 0, type: 'frame' },
            { data: after, sequence: 1, timestamp: 1000, type: 'frame' },
          ],
          version: 1,
        },
      },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  const bounds = (await chart.boundingBox())!
  await chart.dispatchEvent('pointermove', { clientX: bounds.x + bounds.width, pointerType: 'mouse' })
  const preview = page.frameLocator('iframe[title="Session replay preview"]')
  await expect(preview.locator('.Editor')).toHaveCSS('color', 'rgb(255, 0, 0)')
  await expect(preview.locator('.Editor')).toHaveCSS('background-color', 'rgb(0, 0, 255)')
  await expect(preview.locator('html')).toHaveClass('after')
  await expect(page.locator('html')).toHaveClass('before')
  await expect(page.locator('.SessionReplaySurface .Editor')).toHaveCSS('color', 'rgb(0, 128, 0)')
})

test('preview setting persists and disables preview requests and rendering', async ({ page }) => {
  await timeline(page)
  const setting = page.getByRole('checkbox', { name: 'Timeline previews' })
  await expect(setting).toBeChecked()
  await page.getByRole('slider').hover()
  await expect(page.locator('.SessionReplayPreview')).toBeVisible()
  await setting.uncheck()
  await page.getByRole('slider').hover()
  await expect(page.locator('.SessionReplayPreview')).toBeHidden()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.reload()
  await page.waitForFunction(() => window.api)
  await timeline(page)
  await expect(setting).not.toBeChecked()
  await page.getByRole('slider').hover()
  await expect(page.locator('iframe')).toHaveCount(0)
  await setting.check()
  await page.getByRole('slider').hover()
  await expect(page.locator('.SessionReplayPreview')).toBeVisible()
})

test('preview stays within a narrow viewport and dismisses on Escape', async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 })
  await timeline(page)
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  await chart.hover()
  const popup = page.locator('.SessionReplayPreview')
  await expect(popup).toBeVisible()
  const bounds = (await popup.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeLessThan((await chart.boundingBox())!.y)
  await page.keyboard.press('Escape')
  await expect(popup).toBeHidden()
})

test('leaving the timeline discards delayed previews and disabling stops further requests', async ({ page }) => {
  await page.evaluate(() => {
    // Preserve the native receiver while simulating a slow worker under the fake clock.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: { method: string }): void {
      if (message.method === 'preview') {
        document.documentElement.dataset.previewRequests = String(Number(document.documentElement.dataset.previewRequests || 0) + 1)
        // eslint-disable-next-line e2e/no-timeouts, unicorn/no-this-outside-of-class
        setTimeout(() => original.call(this, message), 500)
        // eslint-disable-next-line unicorn/no-this-outside-of-class
      } else original.call(this, message)
    }
  })
  await timeline(page)
  await page.clock.install()
  await page.getByRole('slider').hover()
  await page.clock.runFor(100)
  await expect(page.locator('html')).toHaveAttribute('data-preview-requests', '1')
  await page.mouse.move(0, 0)
  await page.clock.runFor(1000)
  await expect(page.locator('.SessionReplayPreview')).toBeHidden()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Timeline previews' }).uncheck()
  await page.getByRole('slider').hover()
  await page.clock.runFor(1000)
  await expect(page.locator('html')).toHaveAttribute('data-preview-requests', '1')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('an explicit preview option overrides the saved setting and player disposal removes the preview', async ({ page }) => {
  await page.evaluate(async () => {
    localStorage.setItem('sessionReplay.timelinePreviewEnabled', 'true')
    const frame = window.api.capture(document)
    window.stopObserving = await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      timelinePreviewEnabled: false,
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  const setting = page.getByRole('checkbox', { name: 'Timeline previews' })
  await expect(setting).not.toBeChecked()
  await setting.check()
  await page.getByRole('slider').hover()
  await expect(page.locator('.SessionReplayPreview')).toBeVisible()
  await expect(page.locator('.SessionReplayPreviewTime')).toHaveText('0.0 s')
  await page.evaluate(() => window.stopObserving())
  await expect(page.locator('.SessionReplayPreview')).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('dragging the activity timeline updates the preview and progress before release and captures the pointer outside the chart', async ({ page }) => {
  await timeline(page)
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  const bounds = (await chart.boundingBox())!
  const slider = page.getByRole('slider')
  const preview = page.frameLocator('iframe[title="Session replay preview"]')
  const cursor = chart.locator('line')
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2)
  await page.mouse.down()
  for (const fraction of [0.75, 0.25]) {
    await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2, { steps: 5 })
    const text = fraction > 0.5 ? 'edited after typing' : 'const answer'
    await expect(page.locator('.SessionReplaySurface .Editor')).toContainText(text)
    await expect(preview.locator('.Editor')).toContainText(text)
    await expect(slider).toHaveValue(String(1500 * fraction))
    await expect(slider).toHaveCSS('--replay-progress', `${fraction * 100}%`)
    await expect(cursor).toHaveAttribute('x1', String(fraction * 240))
  }
  await page.mouse.move(bounds.x + bounds.width + 20, bounds.y - 20)
  await expect(slider).toHaveValue('1500')
  await expect(slider).toHaveCSS('--replay-progress', '100%')
  await page.mouse.move(bounds.x - 20, bounds.y - 20)
  await expect(slider).toHaveValue('0')
  await expect(slider).toHaveCSS('--replay-progress', '0%')
  await page.mouse.up()
  await chart.hover({ position: { x: bounds.width * 0.75, y: bounds.height / 2 } })
  await expect(preview.locator('.Editor')).toHaveText('edited after typing')
  await expect(slider).toHaveValue('0')
})

test('cancelling an activity timeline drag stops seeking', async ({ page }) => {
  await timeline(page)
  const chart = page.getByRole('img', { name: 'Session replay activity' })
  const bounds = (await chart.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await expect(page.getByRole('slider')).toHaveValue('375')
  await chart.dispatchEvent('pointercancel', { pointerId: 1 })
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2)
  await expect(page.frameLocator('iframe[title="Session replay preview"]').locator('.Editor')).toHaveText('edited after typing')
  await expect(page.getByRole('slider')).toHaveValue('375')
  await page.mouse.up()
})

for (const playing of [false, true]) {
  const buttonName = playing ? 'Pause' : 'Play'
  const advance = playing ? 50 : 0
  for (const control of ['slider click', 'slider drag', 'activity chart', 'activity drag']) {
    test(`${control} preserves ${playing ? 'playing' : 'paused'} playback when seeking forward and backward`, async ({ page }) => {
      await timeline(page)
      await page.clock.install({ time: 0 })
      await page.clock.pauseAt(1000)
      const slider = page.getByRole('slider')
      if (playing) await page.getByRole('button', { exact: true, name: 'Play' }).click()
      const target = control.startsWith('activity') ? page.getByRole('img', { name: 'Session replay activity' }) : slider
      const bounds = (await target.boundingBox())!
      if (control.endsWith('drag')) {
        await page.mouse.move(bounds.x + 7, bounds.y + bounds.height / 2)
        await page.mouse.down()
      }
      for (const fraction of [0.75, 0.25]) {
        if (control.endsWith('drag')) {
          await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2, { steps: 5 })
        } else {
          await target.click({ position: { x: bounds.width * fraction, y: bounds.height / 2 } })
        }
        await expect(page.locator('.SessionReplaySurface .Editor')).toContainText(fraction > 0.5 ? 'edited after typing' : 'const answer')
        await expect(page.getByRole('button', { exact: true, name: buttonName })).toBeVisible()
        const position = Number(await slider.inputValue())
        expect(position).toBeGreaterThan(1500 * fraction - 30)
        expect(position).toBeLessThan(1500 * fraction + 30)
        await page.clock.runFor(50)
        await expect(slider).toHaveValue(String(position + advance))
      }
      if (control.endsWith('drag')) await page.mouse.up()
      const position = Number(await slider.inputValue())
      await page.clock.runFor(50)
      await expect(slider).toHaveValue(String(position + advance))
      await expect(page.getByRole('button', { exact: true, name: buttonName })).toBeVisible()
    })
  }
}
