import type { ReplaySource, Session } from '../../session-replay-worker/src/parts/Types/Types.ts'
import * as api from '../../session-replay-worker/src/parts/Api/Api.ts'
import { capture, createClient, mountPlayer, observe } from '../../session-replay-worker/src/parts/Api/Api.ts'

const workerUrl = new URL('../dist/sessionReplayWorkerMain.js', import.meta.url)

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

const eventually = async (condition: () => boolean): Promise<void> => {
  const deadline = performance.now() + 5000
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for replay')
    // Poll the DOM because this runner also executes without Playwright.
    // eslint-disable-next-line e2e/no-timeouts
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const editor = (): HTMLElement => document.querySelector('.Editor')!
const replay = (): HTMLElement => document.querySelector('.SessionReplaySurface')!
const slider = (): HTMLInputElement => document.querySelector('input[type=range]')!
const text = (selector: string): string => replay().querySelector(selector)?.textContent || ''
const css = (selector: string, property: string): string => {
  const node = replay().querySelector(selector)!
  return replay().ownerDocument.defaultView!.getComputedStyle(node).getPropertyValue(property)
}

const record = async (): Promise<Session> => {
  const client = createClient(workerUrl)
  try {
    await client.invoke('start', { local: false, upload: false })
    await client.invoke('record', 'frame', capture(document))
    return await client.invoke('export')
  } finally {
    client.dispose()
  }
}

const withPlayer = async (source: ReplaySource, test: () => void | Promise<void>): Promise<void> => {
  const dispose = await mountPlayer(document.body, { source, workerUrl })
  try {
    await test()
  } finally {
    dispose()
  }
}

const roundTrip = async (test: () => void | Promise<void>): Promise<void> => withPlayer({ session: await record() }, test)

const timeline = (): Session => {
  const before = capture(document)
  editor().textContent = 'edited after typing'
  document.querySelector('.Explorer')!.remove()
  const after = capture(document)
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    events: [
      { data: before, sequence: 0, timestamp: 0, type: 'frame' },
      { data: after, sequence: 1, timestamp: 1000, type: 'frame' },
      { data: {}, sequence: 2, timestamp: 1500, type: 'message' },
    ],
    id: 'timeline',
    version: 1,
  }
}

const seek = (position: string): void => {
  slider().value = position
  slider().dispatchEvent(new Event('input'))
}

export const cases: { name: string; run: () => Promise<void> }[] = [
  {
    name: 'replays the assembled explorer and editor DOM',
    run: async () =>
      roundTrip(() => {
        check(text('.Explorer').includes('hello.js'), 'Explorer file is missing')
        check(text('.Editor').includes('const answer = 42'), 'Editor text is missing')
      }),
  },
  {
    name: 'replays CSS styles',
    run: async () => roundTrip(() => check(css('.Editor', 'color') === 'rgb(0, 128, 0)', 'Editor color was not restored')),
  },
  ...[
    ['input value', '<input value="changed">', 'input', 'changed'],
    ['textarea value', '<textarea>multiple lines</textarea>', 'textarea', 'multiple lines'],
    ['select value', '<select><option>a</option><option selected>b</option></select>', 'select', 'b'],
  ].map(([name, html, selector, expected]) => ({
    name: `replays ${name}`,
    run: async (): Promise<void> => {
      editor().innerHTML = html
      await roundTrip(() => check(replay().querySelector<HTMLInputElement>(selector)!.value === expected, `${name} was not restored`))
    },
  })),
  {
    name: 'replays changed checkbox properties',
    run: async (): Promise<void> => {
      editor().innerHTML = '<input type="checkbox">'
      document.querySelector('input')!.checked = true
      await roundTrip(() => check(replay().querySelector('input')!.checked, 'Checkbox was not restored'))
    },
  },
  {
    name: 'redacts passwords and explicitly masked content',
    run: async (): Promise<void> => {
      editor().innerHTML = '<input type="password" value="password-secret"><span data-session-replay-mask>private-secret</span>'
      const content = JSON.stringify(await record())
      check(!content.includes('password-secret') && !content.includes('private-secret'), 'Stored recording contains masked text')
    },
  },
  ...[
    ['canvas', '<canvas width="100" height="40"></canvas>'],
    ['iframe', '<iframe></iframe>'],
    ['terminal', '<div class="Terminal">terminal output</div>'],
    ['native content', '<div data-session-replay-placeholder>native web contents</div>'],
  ].map(([name, html]) => ({
    name: `renders unsupported ${name} as a gray box`,
    run: async (): Promise<void> => {
      editor().innerHTML = html
      await roundTrip(() => check(css('.SessionReplayPlaceholder', 'background-color') === 'rgb(128, 128, 128)', 'Placeholder is missing'))
    },
  })),
  {
    name: 'restores scrolling',
    run: async (): Promise<void> => {
      editor().innerHTML = '<div id="scroll" style="overflow:auto;height:50px"><div style="height:1000px">long text</div></div>'
      document.querySelector('#scroll')!.scrollTop = 200
      await roundTrip(() => check(replay().querySelector('#scroll')!.scrollTop === 200, 'Scroll position was not restored'))
    },
  },
  {
    name: 'seeks forward and backward across removals',
    run: async () =>
      withPlayer({ session: timeline() }, async () => {
        seek('1200')
        await eventually(() => text('.Editor') === 'edited after typing')
        check(!replay().querySelector('.Explorer'), 'Removed explorer is still visible')
        seek('0')
        await eventually(() => text('.Explorer').includes('hello.js'))
        check(text('.Editor').includes('const answer'), 'Editor was not restored after backward seek')
      }),
  },
  {
    name: 'play advances in time and stops at the end',
    run: async () =>
      withPlayer({ session: timeline() }, async () => {
        document.querySelector('button')!.click()
        // The slider rounds milliseconds, so it can reach 1500 before playback has stopped.
        await eventually(() => slider().value === '1500' && document.querySelector('button')!.ariaLabel === 'Play')
        check(text('.Editor') === 'edited after typing', 'Final frame is missing')
        check(document.querySelector('button')!.ariaLabel === 'Play', 'Playback did not stop')
      }),
  },
  {
    name: 'replays exported JSON without the original worker',
    run: async (): Promise<void> => {
      const json = JSON.stringify(await record())
      const session = JSON.parse(json)
      await withPlayer({ session }, () => check(text('.Editor').includes('const answer'), 'Exported recording did not replay'))
    },
  },
  {
    name: 'captures DOM mutations and CSSOM updates',
    run: async (): Promise<void> => {
      const client = createClient(workerUrl)
      let stop: (() => void) | undefined
      try {
        await client.invoke('start', { local: false, upload: false })
        let error: Error | undefined
        let latest = ''
        stop = observe(
          document,
          async (type, data) => {
            await client.invoke('record', type, data)
            latest = JSON.stringify(data)
          },
          (cause) => {
            error = cause instanceof Error ? cause : new Error('Recording failed')
          },
        )
        await eventually(() => latest.includes('const answer'))
        editor().textContent = 'new content'
        document.styleSheets[0].insertRule('.Editor { color: red }', document.styleSheets[0].cssRules.length)
        await eventually(() => latest.includes('new content') && latest.includes('red'))
        stop()
        if (error) throw error
        const session = await client.invoke('export')
        await withPlayer({ session }, async () => {
          seek(slider().max)
          await eventually(() => text('.Editor') === 'new content')
          check(css('.Editor', 'color') === 'rgb(255, 0, 0)', 'CSSOM change was not restored')
        })
      } finally {
        stop?.()
        client.dispose()
      }
    },
  },
  {
    name: 'rejects malicious markup and resource URLs',
    run: async (): Promise<void> => {
      const session: Session = {
        createdAt: '2026-01-01T00:00:00.000Z',
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
        id: 'malicious',
        version: 1,
      }
      await withPlayer({ session }, () => {
        check(!replay().querySelector('script, iframe, [onclick], [onerror], [href], [src]'), 'Unsafe markup survived replay')
        check(!window.hacked, 'Recorded script executed')
      })
    },
  },
  {
    name: 'missing local recording displays an error',
    run: async () =>
      withPlayer({ localId: `missing-${crypto.randomUUID()}` }, () => {
        check(document.querySelector('output')!.textContent.includes('not found'), 'Missing-recording error was not displayed')
        check(slider().disabled, 'Seek control should be disabled')
      }),
  },
  {
    name: 'invalid recording version is rejected',
    run: async () =>
      withPlayer({ session: { events: [], version: 99 } }, () => {
        check(document.querySelector('output')!.textContent.includes('Unsupported'), 'Invalid recording was not rejected')
      }),
  },
  {
    name: 'preserves imported CSS, body root and theme variables',
    run: async (): Promise<void> => {
      const style = document.createElement('style')
      style.textContent = '@import url("./imported.css");'
      document.head.append(style)
      await eventually(() => {
        const imported = style.sheet?.cssRules[0] as CSSImportRule | undefined
        return Boolean(imported?.styleSheet?.cssRules.length)
      })
      document.documentElement.style.setProperty('--replay-color', 'rgb(100, 20, 30)')
      const height = `${window.innerHeight}px`
      await roundTrip(() => {
        check(css('body > .Workspace', 'height') === height, 'Body root height was not restored')
        check(css('body > .Workspace', 'color') === 'rgb(100, 20, 30)', 'Theme color was not restored')
      })
    },
  },
  {
    name: 'records transferred worker ports and replays committed virtual DOM commands',
    run: async (): Promise<void> => {
      const client = api.createClient(workerUrl)
      const initial = api.capture(document)
      initial.dom.children = []
      await client.invoke('start', { local: false, upload: false }, initial)
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
      response = receive(rendererPort)
      root.port1.postMessage({ method: 'Viewlet.sendMultiple', params: [[['Viewlet.commitPending', 1, 81]]] })
      await response
      const session = await client.invoke('export')
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

      check(session.events.filter((event) => event.type === 'frame').length === 1, 'Expected exactly one initial frame')
      check(stopped.events.length === session.events.length, 'Recording continued after stop')
      check(afterStop.method === 'still-forwarding', 'Proxy stopped forwarding')
      // Range controls seek in whole milliseconds; keep command boundaries distinct on fast runners.
      const replaySession = { ...session, events: session.events.map((event) => ({ ...event, timestamp: event.sequence * 10 })) }
      await withPlayer({ session: replaySession }, async () => {
        seek(slider().max)
        await eventually(() => text('.Editor') === 'committed edit')
        check(css('.Editor', 'color') === 'rgb(10, 20, 30)', 'Command stylesheet was not restored')
        const beforeCommit = before.events.at(-1)!.sequence * 10
        seek(String(beforeCommit))
        await eventually(() => text('.Editor') === 'message recorded')
      })
    },
  },
]
