import { test, expect } from '@playwright/test'

test('opens an exported recording from the GitHub Pages subdirectory', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => {
    workers.push(worker.url())
  })
  await page.goto('/session-replay-worker/replay/')
  await page.getByLabel('Open session recording').setInputFiles({
    buffer: Buffer.from(
      JSON.stringify({
        events: [
          {
            data: { dom: { children: [{ text: 'Recorded editor' }], tag: 'body' }, styles: [], viewport: [800, 600] },
            sequence: 0,
            timestamp: 0,
            type: 'frame',
          },
        ],
        version: 1,
      }),
    ),
    mimeType: 'application/json',
    name: 'session.json',
  })
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('Recorded editor')
  expect(workers).toEqual(['http://127.0.0.1:4317/session-replay-worker/dist/sessionReplayWorkerMain.js'])
})

test('reports malformed JSON and allows another file to be selected', async ({ page }) => {
  await page.goto('/session-replay-worker/replay/')
  await page.getByLabel('Open session recording').setInputFiles({
    buffer: Buffer.from('not json'),
    mimeType: 'application/json',
    name: 'invalid.json',
  })
  await expect(page.getByRole('alert')).toContainText('Cannot open recording:')
  await expect(page.getByLabel('Open session recording')).toBeEnabled()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('exports a landing page linking the tests and manual player', async ({ page }) => {
  await page.goto('/session-replay-worker/')
  await page.getByRole('link', { name: 'End-to-end tests' }).click()
  await expect(page).toHaveURL(/\/session-replay-worker\/tests\/$/)
  await page.getByRole('link', { name: 'Manual replay' }).click()
  await expect(page.getByLabel('Open session recording')).toBeVisible()
})

test('runs the exported browser suite from the GitHub Pages subdirectory', async ({ page }) => {
  // The browser suite runs every scenario twice to verify repeatability.
  // eslint-disable-next-line e2e/no-timeouts
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.route('https://evil.invalid/**', (route) => {
    errors.push(`Unsafe replay request: ${route.request().url()}`)
    return route.abort()
  })
  await page.goto('/session-replay-worker/tests')
  await expect(page).toHaveURL(/\/session-replay-worker\/tests\/$/)
  await page.getByRole('button', { name: 'Run all tests' }).click()
  await expect(page.locator('#summary')).toHaveAttribute('data-state', 'passed', { timeout: 60_000 })
  await expect(page.locator('li[data-state="passed"]')).toHaveCount(21)
  expect(errors).toEqual([])
  await page.getByRole('button', { name: 'Run all tests' }).click()
  await expect(page.locator('#summary')).toHaveAttribute('data-state', 'passed', { timeout: 60_000 })
  await expect(page.locator('#stage iframe')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('exports direct test links and reports unknown tests', async ({ page }) => {
  await page.goto('/session-replay-worker/tests/?test=replays%20CSS%20styles')
  await expect(page.locator('#summary')).toHaveText('1 passed, 0 failed')
  await page.reload()
  await expect(page.locator('#summary')).toHaveText('1 passed, 0 failed')
  await page.goto('/session-replay-worker/tests/?test=unknown')
  await expect(page.locator('#summary')).toHaveText('Unknown test: unknown')
  await expect(page.getByRole('button', { name: 'Run all tests' })).toBeDisabled()
})

test('reports a failed browser scenario when the published worker cannot load', async ({ page }) => {
  await page.route('**/dist/sessionReplayWorkerMain.js', (route) => route.abort())
  await page.goto('/session-replay-worker/tests/?test=replays%20CSS%20styles')
  await expect(page.locator('#summary')).toHaveText('0 passed, 1 failed')
  await expect(page.locator('li[data-state="failed"]')).toContainText('Session replay worker failed to load')
  await expect(page.getByRole('button', { name: 'Run test', exact: true })).toBeEnabled()
})
