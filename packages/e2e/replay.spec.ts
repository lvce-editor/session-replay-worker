import type { FrameLocator, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.api)
})
const roundTrip = async (page: Page, change?: () => void): Promise<FrameLocator> => {
  if (change) await page.evaluate(change)
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
  return page.frameLocator('iframe')
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

test('replays CSS styles', async ({ page }) => {
  const replay = await roundTrip(page)
  await expect(replay.locator('.Editor')).toHaveCSS('color', 'rgb(0, 128, 0)')
})

for (const [name, html, selector, expected] of [
  ['input value', '<input value="changed">', 'input', 'changed'],
  ['textarea value', '<textarea>multiple lines</textarea>', 'textarea', 'multiple lines'],
  ['select value', '<select><option>a</option><option selected>b</option></select>', 'select', 'b'],
])
  test(`replays ${name}`, async ({ page }) => {
    await page.locator('.Editor').evaluate((node, html) => {
      node.innerHTML = html
    }, html)
    const replay = await roundTrip(page)
    await expect(replay.locator(selector)).toHaveValue(expected)
  })

test('replays changed checkbox properties', async ({ page }) => {
  const replay = await roundTrip(page, () => {
    document.querySelector('.Editor')!.innerHTML = '<input type="checkbox">'
    document.querySelector('input')!.checked = true
  })
  await expect(replay.locator('input')).toBeChecked()
})

test('password and explicitly masked content are absent from stored events', async ({ page }) => {
  await roundTrip(page, () => {
    document.querySelector('.Editor')!.innerHTML =
      '<input type="password" value="password-secret"><span data-session-replay-mask>private-secret</span>'
  })
  const content = await page.evaluate(() => JSON.stringify(window.session))
  expect(content).not.toContain('password-secret')
  expect(content).not.toContain('private-secret')
})

for (const html of [
  '<canvas width="100" height="40"></canvas>',
  '<iframe></iframe>',
  '<div class="Terminal">terminal output</div>',
  '<div data-session-replay-placeholder>native web contents</div>',
]) {
  test(`renders unsupported content as a gray box: ${html}`, async ({ page }) => {
    await page.locator('.Editor').evaluate((node, value) => {
      node.innerHTML = value
    }, html)
    const replay = await roundTrip(page)
    await expect(replay.locator('.SessionReplayPlaceholder')).toHaveCSS('background-color', 'rgb(128, 128, 128)')
  })
}

test('restores scrolling', async ({ page }) => {
  const replay = await roundTrip(page, () => {
    document.querySelector('.Editor')!.innerHTML =
      '<div id="scroll" style="overflow:auto;height:50px"><div style="height:1000px">long text</div></div>'
    document.querySelector('#scroll')!.scrollTop = 200
  })
  await expect.poll(() => replay.locator('#scroll').evaluate((node) => node.scrollTop)).toBe(200)
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
  await expect(page.frameLocator('iframe').locator('.Editor')).toContainText('const answer')
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

test('dragging the progress bar seeks forward and backward across removals', async ({ page }) => {
  await timeline(page)
  const slider = page.getByRole('slider')
  await slider.fill('1200')
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveText('edited after typing')
  await expect(page.frameLocator('iframe').locator('.Explorer')).toHaveCount(0)
  await slider.fill('0')
  await expect(page.frameLocator('iframe').locator('.Explorer')).toContainText('hello.js')
  await expect(page.frameLocator('iframe').locator('.Editor')).toContainText('const answer')
})

test('play advances in time and stops at the end', async ({ page }) => {
  await timeline(page)
  await page.getByRole('button', { exact: true, name: 'Play' }).click()
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveText('edited after typing')
  await expect(page.getByRole('button', { exact: true, name: 'Play' })).toBeVisible()
  await expect(page.getByRole('slider')).toHaveValue('1500')
})

test('local file JSON can be replayed without its original workers', async ({ page }) => {
  await roundTrip(page)
  const session = await page.evaluate(() => window.session)
  await page.reload()
  await page.waitForFunction(() => window.api)
  await page.evaluate(
    async (session) => window.api.mountPlayer(document.body, { source: { session }, workerUrl: '/dist/sessionReplayWorkerMain.js' }),
    session,
  )
  await expect(page.frameLocator('iframe').locator('.Editor')).toContainText('const answer')
})

test('captures DOM mutations and CSSOM updates while recording', async ({ page }) => {
  await page.evaluate(async () => {
    window.client = window.api.createClient('/dist/sessionReplayWorkerMain.js')
    await window.client.invoke('start', { local: false, upload: false })
    window.stopObserving = window.api.observe(
      document,
      (type, data) => window.client.invoke('record', type, data),
      (error) => {
        throw error
      },
    )
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const status = await window.client.invoke('status')
        return status.events
      }),
    )
    .toBeGreaterThan(0)
  await page.evaluate(() => {
    document.querySelector('.Editor')!.textContent = 'new content'
    document.styleSheets[0].insertRule('.Editor { color: red }', document.styleSheets[0].cssRules.length)
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const session = await window.client.invoke('export')
        return JSON.stringify(session.events.at(-1)!.data)
      }),
    )
    .toContain('new content')
  await page.evaluate(async () => {
    window.stopObserving()
    const session = await window.client.invoke('export')
    window.client.dispose()
    await window.api.mountPlayer(document.body, { source: { session }, workerUrl: '/dist/sessionReplayWorkerMain.js' })
  })
  await page.getByRole('slider').fill((await page.getByRole('slider').getAttribute('max'))!)
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveCSS('color', 'rgb(255, 0, 0)')
})

test('malicious imported commands, event handlers and resource URLs never execute', async ({ page }) => {
  const requests: string[] = []
  await page.route('https://evil.invalid/**', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.evaluate(async () => {
    const session = {
      events: [
        {
          data: {
            dom: {
              attrs: { onclick: 'parent.hacked=true' },
              children: [
                { children: [{ text: 'parent.hacked=true' }], tag: 'script' },
                { attrs: { onerror: 'parent.hacked=true', src: 'https://evil.invalid/image' }, tag: 'img' },
                { attrs: { srcdoc: '<script>parent.hacked=true</script>' }, tag: 'iframe' },
                { attrs: { href: 'javascript:parent.hacked=true' }, children: [{ text: 'link' }], tag: 'a' },
              ],
              tag: 'div',
            },
            styles: ['@import "https://evil.invalid/style"; div { background:url(https://evil.invalid/pixel) }'],
            viewport: [800, 600],
          },
          sequence: 0,
          timestamp: 0,
          type: 'frame',
        },
      ],
      version: 1,
    }
    await window.api.mountPlayer(document.body, { source: { session }, workerUrl: '/dist/sessionReplayWorkerMain.js' })
  })
  await expect(page.frameLocator('iframe').locator('script, iframe, [onclick], [onerror], [href], [src]')).toHaveCount(0)
  expect(await page.evaluate(() => window.hacked)).toBeUndefined()
  expect(requests).toEqual([])
})

test('missing local replay displays a useful error', async ({ page }) => {
  await page.evaluate(async () =>
    window.api.mountPlayer(document.body, { source: { localId: 'missing' }, workerUrl: '/dist/sessionReplayWorkerMain.js' }),
  )
  await expect(page.locator('output')).toContainText('not found')
  await expect(page.getByRole('slider')).toBeDisabled()
})

test('invalid replay version is rejected', async ({ page }) => {
  await page.evaluate(async () =>
    window.api.mountPlayer(document.body, { source: { session: { events: [], version: 99 } }, workerUrl: '/dist/sessionReplayWorkerMain.js' }),
  )
  await expect(page.locator('output')).toContainText('Unsupported')
})

test('preserves imported reset CSS, the body root and document theme variables', async ({ page }) => {
  await page.evaluate(async () => {
    const style = document.createElement('style')
    style.textContent = '@import url("/imported.css");'
    document.head.append(style)
    document.documentElement.style.setProperty('--replay-color', 'rgb(100, 20, 30)')
    await new Promise((resolve) => {
      style.onload = resolve
    })
  })
  const replay = await roundTrip(page)
  await expect(replay.locator('body > .Workspace')).toHaveCSS('height', '720px')
  await expect(replay.locator('body > .Workspace')).toHaveCSS('color', 'rgb(100, 20, 30)')
})

test('records transferred worker ports and replays virtual DOM commands without a MutationObserver', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const client = window.api.createClient('/dist/sessionReplayWorkerMain.js')
    const initial = window.api.capture(document)
    initial.dom.children = []
    await client.invoke('start', { local: true, upload: false }, initial)
    const root = new MessageChannel()
    const rendererPort = await client.invokeAndTransfer('proxy', root.port2)
    const receive = (port: MessagePort): Promise<any> =>
      new Promise((resolve) => {
        port.onmessage = ({ data }): void => resolve(data)
        port.start()
      })
    // Div=4 and Text=12 are the stable LVCE virtual DOM protocol element ids.
    const commands = [
      ['Viewlet.createFunctionalRoot', 'Editor', 1, true],
      [
        'Viewlet.setDom2',
        1,
        [
          { childCount: 1, className: 'Editor', 'data-uid': 1, type: 4 },
          { text: 'message recorded', type: 12 },
        ],
      ],
      ['Viewlet.appendToBody', 1],
      ['Viewlet.setCss', 1, '.Editor[data-uid="1"] { color: rgb(10, 20, 30) }'],
    ]
    let response = receive(rendererPort)
    root.port1.postMessage({ method: 'Viewlet.sendMultiple', params: [commands] })
    await response
    const child = new MessageChannel()
    response = receive(rendererPort)
    root.port1.postMessage({ method: 'HandleMessagePort.handleMessagePort', params: [child.port2, 'Editor'] }, [child.port2])
    const connection = await response
    const directPort = connection.params[0]
    response = receive(directPort)
    child.port1.postMessage({
      id: 7,
      method: 'Viewlet.queueCommands',
      params: [
        1,
        [
          [
            'Viewlet.setTreePatches',
            1,
            [
              { navigations: [7, 0], type: 18 },
              { type: 1, value: 'committed edit' },
            ],
          ],
        ],
      ],
    })
    await response
    response = receive(child.port1)
    directPort.postMessage({ id: 7, result: 81 })
    await response
    const before = await client.invoke('export')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    response = receive(rendererPort)
    root.port1.postMessage({ method: 'Viewlet.sendMultiple', params: [[['Viewlet.commitPending', 1, 81]]] })
    await response
    window.session = await client.invoke('export')
    await client.invoke('stop')
    response = receive(rendererPort)
    root.port1.postMessage({ method: 'still-forwarding' })
    const afterStop = await response
    const stopped = await client.invoke('export')
    root.port1.close()
    rendererPort.close()
    directPort.close()
    child.port1.close()
    client.dispose()
    await window.api.mountPlayer(document.body, { source: { session: window.session }, workerUrl: '/dist/sessionReplayWorkerMain.js' })
    return {
      afterStop,
      before: before.events.at(-1)!.timestamp,
      finalCount: window.session.events.length,
      frames: window.session.events.filter((event) => event.type === 'frame').length,
      stoppedCount: stopped.events.length,
    }
  })
  expect(result.frames).toBe(1)
  expect(result.stoppedCount).toBe(result.finalCount)
  expect(result.afterStop).toEqual({ method: 'still-forwarding' })
  const slider = page.getByRole('slider')
  await slider.fill((await slider.getAttribute('max')) || '0')
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveText('committed edit')
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveCSS('color', 'rgb(10, 20, 30)')
  await slider.fill(String(Math.floor(result.before)))
  await expect(page.frameLocator('iframe').locator('.Editor')).toHaveText('message recorded')
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
