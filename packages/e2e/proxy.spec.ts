import { expect, test } from '@playwright/test'

test('startup IPC bursts do not stop visual command recording', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.api)
  const result = await page.evaluate(async () => {
    const client = window.api.createClient('/dist/sessionReplayWorkerMain.js')
    const { port1, port2 } = new MessageChannel()
    const initial = { dom: { children: [], tag: 'body' }, styles: [], viewport: [800, 600] as [number, number] }
    await client.invoke('start', { local: true, upload: false }, initial)
    const renderer = await client.invokeAndTransfer('proxy', port2)
    const received = new Promise<void>((resolve) => {
      renderer.onmessage = ({ data }): void => {
        if (data.method === 'Viewlet.appendToBody') resolve()
      }
    })
    try {
      for (let id = 0; id < 2000; id++) port1.postMessage({ id, method: 'Preferences.get', params: ['editor.fontSize'] })
      port1.postMessage({ method: 'Viewlet.create', params: ['Editor', 1] })
      port1.postMessage({
        method: 'Viewlet.setDom2',
        params: [
          1,
          [
            { childCount: 1, className: 'Editor', type: 4 },
            { childCount: 0, text: 'before proxied edit', type: 12 },
          ],
        ],
      })
      port1.postMessage({ method: 'Viewlet.appendToBody', params: [1] })
      await received
      const session = await client.invoke('export')
      const status = await client.invoke('status')
      await client.invoke('load', { session })
      const replay = await client.invoke('seek', session.events.at(-1)!.timestamp)
      await client.invoke('load', { localId: session.id })
      const saved = await client.invoke('seek', session.events.at(-1)!.timestamp)
      return { replay, saved, session, status }
    } finally {
      port1.close()
      renderer.close()
      client.dispose()
    }
  })
  expect(result.status.error).toBe('')
  expect(result.session.events).toHaveLength(4)
  expect(JSON.stringify(result.replay.frame.dom)).toContain('before proxied edit')
  expect(result.saved.frame).toEqual(result.replay.frame)
})
