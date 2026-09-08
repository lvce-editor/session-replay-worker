import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.api)
})

test('identical frames reuse DOM nodes and adopted sheets without mutations', async ({ page }) => {
  const result = await page.evaluate(() => {
    const frame = window.api.capture(document)
    window.api.renderFrame(document, frame)
    const host = document.querySelector('.SessionReplaySurface')!
    const surface = host
    const editor = surface.querySelector('.Editor')!
    const sheet = document.adoptedStyleSheets[0]
    const observer = new MutationObserver(() => {})
    observer.observe(host, { attributes: true })
    observer.observe(surface, { attributes: true, characterData: true, childList: true, subtree: true })
    for (let index = 0; index < 10; index++) window.api.renderFrame(document, structuredClone(frame))
    const mutations = observer.takeRecords().length
    observer.disconnect()
    return { mutations, sameNode: editor === surface.querySelector('.Editor'), sameSheet: sheet === document.adoptedStyleSheets[0] }
  })
  expect(result).toEqual({ mutations: 0, sameNode: true, sameSheet: true })
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.locator('.SessionReplaySurface').evaluate((node) => node.shadowRoot)).toBeNull()
  await expect(page.locator('.SessionReplaySurface html')).toHaveCount(0)
  await expect(page.locator('.SessionReplaySurface style, .SessionReplaySurface head')).toHaveCount(0)
})

test('text edits patch only the text node and keyed siblings survive insertion and removal', async ({ page }) => {
  const result = await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.dom.children = [{ attrs: { id: 'editor' }, children: [{ text: 'before' }], tag: 'div' }]
    window.api.renderFrame(document, frame)
    const surface = document.querySelector<HTMLElement>('.SessionReplaySurface')!
    const editor = surface.querySelector('#editor')!
    const text = editor.firstChild
    const observer = new MutationObserver(() => {})
    observer.observe(surface, { attributes: true, characterData: true, childList: true, subtree: true })
    frame.dom.children.at(0)!.children!.at(0)!.text = 'after'
    window.api.renderFrame(document, frame)
    const edits = observer.takeRecords().map(({ type }) => type)
    frame.dom.children.unshift({ attrs: { id: 'explorer' }, children: [{ text: 'files' }], tag: 'aside' })
    window.api.renderFrame(document, frame)
    frame.dom.children.shift()
    window.api.renderFrame(document, frame)
    observer.disconnect()
    return { edits, sameNode: editor === surface.querySelector('#editor'), sameText: text === editor.firstChild, text: text?.textContent }
  })
  expect(result).toEqual({ edits: ['characterData'], sameNode: true, sameText: true, text: 'after' })
})

test('seeking backwards resets attributes, form properties, scroll and namespaces', async ({ page }) => {
  const result = await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.dom.children = [
      { attrs: { id: 'input', type: 'checkbox' }, tag: 'input' },
      {
        attrs: { id: 'select' },
        children: [
          { children: [{ text: 'a' }], tag: 'option' },
          { children: [{ text: 'b' }], tag: 'option' },
        ],
        tag: 'select',
        value: 'a',
      },
      { attrs: { id: 'scroll', style: 'height:20px;overflow:auto' }, children: [{ attrs: { style: 'height:1000px' }, tag: 'div' }], tag: 'div' },
      { attrs: { id: 'namespace' }, tag: 'a' },
    ]
    const after = structuredClone(frame)
    after.dom.children![0].checked = true
    after.dom.children![0].attrs!.title = 'changed'
    after.dom.children![1].value = 'b'
    after.dom.children![2].scroll = [0, 100]
    after.dom.children![3].svg = true
    window.api.renderFrame(document, frame)
    const surface = document.querySelector<HTMLElement>('.SessionReplaySurface')!
    const input = surface.querySelector('input')!
    const select = surface.querySelector('select')!
    window.api.renderFrame(document, after)
    const changed = [input.checked, select.value, surface.querySelector('#scroll')!.scrollTop, surface.querySelector('#namespace')!.namespaceURI]
    window.api.renderFrame(document, frame)
    return {
      changed,
      reset: [
        input.checked,
        input.hasAttribute('title'),
        select.value,
        surface.querySelector('#scroll')!.scrollTop,
        surface.querySelector('#namespace')!.namespaceURI,
      ],
      sameInput: input === surface.querySelector('input'),
    }
  })
  expect(result).toEqual({
    changed: [true, 'b', 100, 'http://www.w3.org/2000/svg'],
    reset: [false, false, 'a', 0, 'http://www.w3.org/1999/xhtml'],
    sameInput: true,
  })
})

test('adopts ordinary document CSS and preserves unrelated stylesheets across updates', async ({ page }) => {
  const result = await page.evaluate(() => {
    const existing = new CSSStyleSheet()
    existing.replaceSync(':root { --host-marker: preserved }')
    document.adoptedStyleSheets = [existing]
    const frame = window.api.capture(document)
    frame.styles = [':root { --replay-color: rgb(1, 2, 3) }', 'body { color: var(--replay-color) }']
    window.api.renderFrame(document, frame)
    const body = document.querySelector('.SessionReplaySurface body')!
    const sheets = [...document.adoptedStyleSheets]
    const before = getComputedStyle(body).color
    frame.styles[0] = ':root { --replay-color: rgb(4, 5, 6) }'
    window.api.renderFrame(document, frame)
    const after = getComputedStyle(body).color
    const shared = getComputedStyle(document.body).color
    const retained = document.adoptedStyleSheets[2] === sheets[2]
    const replaced = document.adoptedStyleSheets[1] !== sheets[1]
    frame.styles = []
    window.api.renderFrame(document, frame)
    return {
      after,
      before,
      preserved: document.adoptedStyleSheets.length === 1 && document.adoptedStyleSheets[0] === existing,
      replaced,
      retained,
      shared,
    }
  })
  expect(result).toEqual({ after: 'rgb(4, 5, 6)', before: 'rgb(1, 2, 3)', preserved: true, replaced: true, retained: true, shared: 'rgb(4, 5, 6)' })
})

test('escaped CSS URLs and string image sources cannot request external resources', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/private/**', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.dom.children = [{ attrs: { style: 'width:100px;height:100px;background:image-set("/private/inline" 1x)' }, tag: 'div' }]
    frame.styles = [
      String.raw`
      @import '/private/import';
      :host { display:none !important }
      body { --image: u\72l('/private/escaped'); background:var(--image); cursor:url('/private/cursor'),auto; }
      div { background-image: image-set('/private/string' 1x); }
    `,
    ]
    window.api.renderFrame(document, frame)
  })
  await expect(page.locator('.SessionReplaySurface')).toBeVisible()
  await expect(page.locator('.SessionReplaySurface div')).toHaveCSS('background-image', 'none')
  expect(requests).toEqual([])
})

test('loads recorded fonts from the configured asset directory', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/replay-assets/fonts/test.woff2', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.styles = ['@font-face { font-family: ReplayTest; src:url(/fonts/test.woff2) } body { font-family: ReplayTest }']
    window.api.renderFrame(document, frame, `${location.origin}/replay-assets/`)
  })
  await expect.poll(() => requests.length).toBe(1)
})

test('reuses CSS font faces between frames and releases replay sheets when disposed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const initialCount = document.fonts.size
    const frame = window.api.capture(document)
    frame.styles = ['@font-face { font-family: ReplayTest; src:local(Arial) } body { font-family:ReplayTest }']
    const dispose = await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
    const loaded = document.fonts.size - initialCount
    const surface = document.querySelector<HTMLElement>('.SessionReplaySurface')!
    window.api.renderFrame(surface, structuredClone(frame))
    const repeated = document.fonts.size - initialCount
    dispose()
    return { loaded, remaining: document.fonts.size - initialCount, repeated }
  })
  expect(result).toEqual({ loaded: 1, remaining: 0, repeated: 1 })
})

test('normal root and body CSS preserve replay layout and usable controls', async ({ page }) => {
  await page.evaluate(async () => {
    const frame = window.api.capture(document)
    frame.documentElement = { className: 'RecordedTheme', style: '--editor-color: rgb(12, 34, 56)' }
    frame.styles = [
      ':root.RecordedTheme { --workspace-height: 100% } html, body { margin:0; height:100% } body > .Workspace { height:var(--workspace-height); color:var(--editor-color) } button, input { padding:20px; border:10px solid red }',
    ]
    await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
  })
  await expect(page.locator('html')).toHaveCount(1)
  await expect(page.locator('html')).toHaveClass('RecordedTheme')
  await expect(page.locator('.SessionReplaySurface .Workspace')).toHaveCSS('height', '720px')
  await expect(page.locator('.SessionReplaySurface .Workspace')).toHaveCSS('color', 'rgb(12, 34, 56)')
  const controls = page.getByRole('group', { name: 'Session replay controls' })
  await expect(controls.getByRole('button')).toHaveCSS('padding', '0px')
  await expect(controls.getByRole('slider')).toHaveCSS('border-width', '0px')
  await controls.getByRole('button', { exact: true, name: 'Play' }).click()
  await expect(controls.getByRole('slider')).toBeEnabled()
  await expect(controls.locator('output')).toHaveText('0.0 / 0.0 s')
})

test('disposing replay restores the page theme and preserves stylesheets added by the page', async ({ page }) => {
  const result = await page.evaluate(async () => {
    document.documentElement.className = 'PageTheme'
    document.documentElement.style.setProperty('--page-color', 'red')
    const originalStyle = document.documentElement.style.cssText
    const existing = new CSSStyleSheet()
    existing.replaceSync('body { color:red }')
    document.adoptedStyleSheets = [existing]
    const frame = window.api.capture(document)
    frame.documentElement = { className: 'RecordedTheme', style: '--page-color: blue' }
    frame.styles = ['body { color:blue }']
    const dispose = await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
    const added = new CSSStyleSheet()
    document.adoptedStyleSheets.push(added)
    dispose()
    return {
      className: document.documentElement.className,
      restored: document.documentElement.style.cssText === originalStyle,
      sheets: document.adoptedStyleSheets.length === 2 && document.adoptedStyleSheets[0] === existing && document.adoptedStyleSheets[1] === added,
    }
  })
  expect(result).toEqual({ className: 'PageTheme', restored: true, sheets: true })
})
