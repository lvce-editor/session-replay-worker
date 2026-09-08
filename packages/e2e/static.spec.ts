import { test, expect } from '@playwright/test'

test('opens an exported recording from the GitHub Pages subdirectory', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => {
    workers.push(worker.url())
  })
  await page.goto('/session-replay-worker/')
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
  await expect(page.locator('.SessionReplaySurface').locator('body')).toHaveText('Recorded editor')
  expect(workers).toEqual(['http://127.0.0.1:4317/session-replay-worker/dist/sessionReplayWorkerMain.js'])
})

test('reports malformed JSON and allows another file to be selected', async ({ page }) => {
  await page.goto('/session-replay-worker/')
  await page.getByLabel('Open session recording').setInputFiles({
    buffer: Buffer.from('not json'),
    mimeType: 'application/json',
    name: 'invalid.json',
  })
  await expect(page.getByRole('alert')).toContainText('Cannot open recording:')
  await expect(page.getByLabel('Open session recording')).toBeEnabled()
  await expect(page.locator('iframe')).toHaveCount(0)
})
