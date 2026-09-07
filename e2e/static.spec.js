import { test, expect } from '@playwright/test'

test('opens an exported recording from the GitHub Pages subdirectory', async ({ page }) => {
  const workers = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('/session-replay-worker/')
  await page.getByLabel('Open session recording').setInputFiles({
    name: 'session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        events: [
          {
            sequence: 0,
            timestamp: 0,
            type: 'frame',
            data: { dom: { tag: 'body', children: [{ text: 'Recorded editor' }] }, viewport: [800, 600], styles: [] },
          },
        ],
      }),
    ),
  })
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('Recorded editor')
  expect(workers).toEqual(['http://127.0.0.1:4317/session-replay-worker/src/worker.js'])
})

test('reports malformed JSON and allows another file to be selected', async ({ page }) => {
  await page.goto('/session-replay-worker/')
  await page.getByLabel('Open session recording').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  })
  await expect(page.getByRole('alert')).toContainText('Cannot open recording:')
  await expect(page.getByLabel('Open session recording')).toBeEnabled()
  await expect(page.locator('iframe')).toHaveCount(0)
})
