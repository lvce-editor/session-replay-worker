import { expect, test } from '@playwright/test'

for (const prefix of ['/static/old/extensions/', 'file:///opt/lvce/static/old/extensions/', 'lvce://-/remote/home/test/.lvce/extensions/']) {
  test(`replays extension-contributed icons from ${prefix}`, async ({ page }) => {
    const loaded: string[] = []
    await page.route('**/replay-assets/extensions/**/*.svg', async (route) => {
      loaded.push(new URL(route.request().url()).pathname)
      await route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M0 0h16v16H0z"/></svg>',
        contentType: 'image/svg+xml',
      })
    })
    await page.goto('/')
    await page.waitForFunction(() => window.api)
    await page.evaluate(async (prefix) => {
      const frame = window.api.capture(document)
      frame.dom.children = [
        { attrs: { class: 'MaskIconCustomViewChat' }, tag: 'span' },
        { attrs: { class: 'ExtensionImage', src: `${prefix}builtin.git/icons/dark/status-added.svg` }, tag: 'img' },
      ]
      frame.styles = [
        `.MaskIconCustomViewChat { display:block;width:24px;height:24px;background:white;mask-image:url("${prefix}builtin.chat-view-2/chat.svg") }`,
      ]
      await window.api.mountPlayer(document.body, {
        assetBaseUrl: '/replay-assets/',
        source: { session: { events: [0, 1000].map((timestamp, sequence) => ({ data: frame, sequence, timestamp, type: 'frame' })), version: 1 } },
        workerUrl: '/dist/sessionReplayWorkerMain.js',
      })
    }, prefix)
    const replay = page.locator('.SessionReplaySurface')
    for (const position of ['0', '1000', '0']) {
      await page.getByRole('slider').fill(position)
      await expect(replay.locator('.MaskIconCustomViewChat')).toHaveCSS(
        'mask-image',
        'url("http://127.0.0.1:4317/replay-assets/extensions/builtin.chat-view-2/chat.svg")',
      )
      await expect.poll(() => replay.locator('.ExtensionImage').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(16)
    }
    await expect
      .poll(() => [...new Set(loaded)].toSorted((a, b) => a.localeCompare(b)))
      .toEqual(['/replay-assets/extensions/builtin.chat-view-2/chat.svg', '/replay-assets/extensions/builtin.git/icons/dark/status-added.svg'])
  })
}

for (const prefix of ['/icons/', '/static/0123456789abcdef/icons/', 'file:///opt/lvce/static/old-commit/icons/']) {
  test(`replays title bar and activity bar icons from ${prefix}`, async ({ page }) => {
    const loaded: string[] = []
    await page.route('**/replay-assets/icons/*.svg', async (route) => {
      loaded.push(new URL(route.request().url()).pathname)
      await route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="red" d="M0 0h16v16H0z"/></svg>',
        contentType: 'image/svg+xml',
      })
    })
    await page.goto('/')
    await page.waitForFunction(() => window.api)
    await page.evaluate(async (prefix) => {
      document.querySelector('.Editor')!.innerHTML =
        `<img class="TitleBarIconIcon" src="${prefix}icon.svg"><span class="ActivityBarIcon" style="display:block;width:24px;height:24px;background:white;mask-image:url(${prefix}files.svg)"></span>`
      const style = document.createElement('style')
      style.textContent = `.StatusBarIcon { display:block;width:16px;height:16px;background:white;mask-image:url('${prefix}source-control.svg') }`
      document.head.append(style)
      document.querySelector('.Editor')!.append(Object.assign(document.createElement('span'), { className: 'StatusBarIcon' }))
      const frame = window.api.capture(document)
      await window.api.mountPlayer(document.body, {
        assetBaseUrl: '/replay-assets/',
        source: { session: { events: [0, 1000].map((timestamp, sequence) => ({ data: frame, sequence, timestamp, type: 'frame' })), version: 1 } },
        workerUrl: '/dist/sessionReplayWorkerMain.js',
      })
    }, prefix)
    const replay = page.locator('.SessionReplaySurface')
    for (const position of ['0', '1000', '0']) {
      await page.getByRole('slider').fill(position)
      await expect.poll(() => replay.locator('.TitleBarIconIcon').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(16)
      await expect(replay.locator('.ActivityBarIcon')).toHaveCSS('mask-image', 'url("http://127.0.0.1:4317/replay-assets/icons/files.svg")')
      await expect(replay.locator('.StatusBarIcon')).toHaveCSS('mask-image', 'url("http://127.0.0.1:4317/replay-assets/icons/source-control.svg")')
    }
    await expect
      .poll(() => loaded.filter((url, index) => loaded.indexOf(url) === index).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(['/replay-assets/icons/files.svg', '/replay-assets/icons/icon.svg', '/replay-assets/icons/source-control.svg'])
  })
}

test('configured replay assets do not allow unrelated recorded network requests', async ({ page }) => {
  const requests: string[] = []
  await page.goto('/')
  await page.waitForFunction(() => window.api)
  await page.route('**/private/**', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.evaluate(async () => {
    const frame = window.api.capture(document)
    frame.dom.children = [
      { attrs: { src: '/private/image' }, tag: 'img' },
      { attrs: { style: 'background:url(/private/pixel);width:10px;height:10px' }, tag: 'div' },
    ]
    frame.styles.push('@import url(/private/style);')
    await window.api.mountPlayer(document.body, {
      assetBaseUrl: '/replay-assets/',
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  await page.getByRole('slider').fill('0')
  await expect(page.locator('.SessionReplaySurface').locator('img')).not.toHaveAttribute('src')
  expect(requests).toEqual([])
})

test('restores the title bar logo in legacy snapshots that omitted image sources', async ({ page }) => {
  await page.route('**/replay-assets/icons/icon.svg', (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M0 0h16v16H0z"/></svg>',
      contentType: 'image/svg+xml',
    }),
  )
  await page.goto('/')
  await page.waitForFunction(() => window.api)
  await page.evaluate(async () => {
    const frame = window.api.capture(document)
    frame.dom.children = [{ attrs: { class: 'TitleBarIconIcon' }, tag: 'img' }]
    await window.api.mountPlayer(document.body, {
      assetBaseUrl: '/replay-assets/',
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  await expect
    .poll(() =>
      page
        .locator('.SessionReplaySurface')
        .locator('.TitleBarIconIcon')
        .evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBe(16)
})
