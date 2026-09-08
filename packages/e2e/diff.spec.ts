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
    const shadow = host.shadowRoot!
    const editor = shadow.querySelector('.Editor')!
    const sheet = shadow.adoptedStyleSheets[1]
    const observer = new MutationObserver(() => {})
    observer.observe(host, { attributes: true })
    observer.observe(shadow, { attributes: true, characterData: true, childList: true, subtree: true })
    for (let index = 0; index < 10; index++) window.api.renderFrame(document, structuredClone(frame))
    const mutations = observer.takeRecords().length
    observer.disconnect()
    return { mutations, sameNode: editor === shadow.querySelector('.Editor'), sameSheet: sheet === shadow.adoptedStyleSheets[1] }
  })
  expect(result).toEqual({ mutations: 0, sameNode: true, sameSheet: true })
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('.SessionReplaySurface style, .SessionReplaySurface head')).toHaveCount(0)
})

test('text edits patch only the text node and keyed siblings survive insertion and removal', async ({ page }) => {
  const result = await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.dom.children = [{ attrs: { id: 'editor' }, children: [{ text: 'before' }], tag: 'div' }]
    window.api.renderFrame(document, frame)
    const shadow = document.querySelector('.SessionReplaySurface')!.shadowRoot!
    const editor = shadow.querySelector('#editor')!
    const text = editor.firstChild
    const observer = new MutationObserver(() => {})
    observer.observe(shadow, { attributes: true, characterData: true, childList: true, subtree: true })
    frame.dom.children.at(0)!.children!.at(0)!.text = 'after'
    window.api.renderFrame(document, frame)
    const edits = observer.takeRecords().map(({ type }) => type)
    frame.dom.children.unshift({ attrs: { id: 'explorer' }, children: [{ text: 'files' }], tag: 'aside' })
    window.api.renderFrame(document, frame)
    frame.dom.children.shift()
    window.api.renderFrame(document, frame)
    observer.disconnect()
    return { edits, sameNode: editor === shadow.querySelector('#editor'), sameText: text === editor.firstChild, text: text?.textContent }
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
    const shadow = document.querySelector('.SessionReplaySurface')!.shadowRoot!
    const input = shadow.querySelector('input')!
    const select = shadow.querySelector('select')!
    window.api.renderFrame(document, after)
    const changed = [input.checked, select.value, shadow.querySelector('#scroll')!.scrollTop, shadow.querySelector('#namespace')!.namespaceURI]
    window.api.renderFrame(document, frame)
    return {
      changed,
      reset: [
        input.checked,
        input.hasAttribute('title'),
        select.value,
        shadow.querySelector('#scroll')!.scrollTop,
        shadow.querySelector('#namespace')!.namespaceURI,
      ],
      sameInput: input === shadow.querySelector('input'),
    }
  })
  expect(result).toEqual({
    changed: [true, 'b', 100, 'http://www.w3.org/2000/svg'],
    reset: [false, false, 'a', 0, 'http://www.w3.org/1999/xhtml'],
    sameInput: true,
  })
})

test('adopted stylesheet updates preserve other sheets and stay inside the replay', async ({ page }) => {
  const result = await page.evaluate(() => {
    const frame = window.api.capture(document)
    frame.styles = [':root { --replay-color: rgb(1, 2, 3) }', 'body { color: var(--replay-color) }']
    window.api.renderFrame(document, frame)
    const shadow = document.querySelector('.SessionReplaySurface')!.shadowRoot!
    const body = shadow.querySelector('body')!
    const sheets = [...shadow.adoptedStyleSheets]
    const before = getComputedStyle(body).color
    frame.styles[0] = ':root { --replay-color: rgb(4, 5, 6) }'
    window.api.renderFrame(document, frame)
    const after = getComputedStyle(body).color
    const retained = shadow.adoptedStyleSheets[2] === sheets[2]
    const replaced = shadow.adoptedStyleSheets[1] !== sheets[1]
    frame.styles = []
    window.api.renderFrame(document, frame)
    return { after, before, count: shadow.adoptedStyleSheets.length, hostColor: getComputedStyle(document.body).color, replaced, retained }
  })
  expect(result.before).toBe('rgb(1, 2, 3)')
  expect(result.after).toBe('rgb(4, 5, 6)')
  expect(result.hostColor).not.toBe('rgb(4, 5, 6)')
  expect(result.count).toBe(1)
  expect(result.retained).toBe(true)
  expect(result.replaced).toBe(true)
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

test('reuses registered fonts between frames and releases them when the player is disposed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const initialCount = document.fonts.size
    const frame = window.api.capture(document)
    frame.styles = ['@font-face { font-family: ReplayTest; src:local(Arial) } body { font-family:ReplayTest }']
    const dispose = await window.api.mountPlayer(document.body, {
      source: { session: { events: [{ data: frame, sequence: 0, timestamp: 0, type: 'frame' }], version: 1 } },
      workerUrl: '/dist/sessionReplayWorkerMain.js',
    })
    const loaded = document.fonts.size - initialCount
    const shadow = document.querySelector('.SessionReplaySurface')!.shadowRoot!
    window.api.renderFrame(shadow, structuredClone(frame))
    const repeated = document.fonts.size - initialCount
    dispose()
    return { loaded, remaining: document.fonts.size - initialCount, repeated }
  })
  expect(result).toEqual({ loaded: 1, remaining: 0, repeated: 1 })
})
