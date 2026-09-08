import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from '@jest/globals'
import { pathToFileURL } from 'node:url'

beforeAll(() => {
  execFileSync(process.execPath, [resolve(import.meta.dirname, '../src/build.ts')])
})

test('the built package contains runnable exports without monorepo files', async () => {
  const dist = resolve(import.meta.dirname, '../../../.tmp/dist')
  const manifest = JSON.parse(await readFile(resolve(dist, 'package.json'), 'utf8'))
  expect(manifest.name).toBe('@lvce-editor/session-replay-worker')
  expect(manifest.main).toBe('dist/sessionReplayWorkerMain.js')
  expect(manifest.scripts).toBeUndefined()
  expect(manifest.workspaces).toBeUndefined()
  const [packed] = JSON.parse(
    execFileSync(process.execPath, [process.env.npm_execpath!, 'pack', '--dry-run', '--json'], { cwd: dist, encoding: 'utf8' }),
  )
  expect(packed.files.map(({ path }: { path: string }) => path).sort()).toEqual([
    'LICENSE',
    'README.md',
    'dist/api/assetUrls.d.ts',
    'dist/api/assetUrls.js',
    'dist/api/capture.d.ts',
    'dist/api/capture.js',
    'dist/api/client.d.ts',
    'dist/api/client.js',
    'dist/api/index.d.ts',
    'dist/api/index.js',
    'dist/api/player.d.ts',
    'dist/api/player.js',
    'dist/api/playerStyles.d.ts',
    'dist/api/playerStyles.js',
    'dist/api/transfer.d.ts',
    'dist/api/transfer.js',
    'dist/api/types.d.ts',
    'dist/api/types.js',
    'dist/capture.js',
    'dist/client.js',
    'dist/parts/Api/Api.d.ts',
    'dist/parts/Api/Api.js',
    'dist/parts/AssetUrls/AssetUrls.d.ts',
    'dist/parts/AssetUrls/AssetUrls.js',
    'dist/parts/Capture/Capture.d.ts',
    'dist/parts/Capture/Capture.js',
    'dist/parts/Client/Client.d.ts',
    'dist/parts/Client/Client.js',
    'dist/parts/Player/Player.d.ts',
    'dist/parts/Player/Player.js',
    'dist/parts/PlayerStyles/PlayerStyles.d.ts',
    'dist/parts/PlayerStyles/PlayerStyles.js',
    'dist/parts/Transfer/Transfer.d.ts',
    'dist/parts/Transfer/Transfer.js',
    'dist/parts/Types/Types.d.ts',
    'dist/parts/Types/Types.js',
    'dist/player.js',
    'dist/sessionReplayWorkerMain.js',
    'dist/settings.json',
    'package.json',
  ])
  for (const [name, exportedFunction] of [
    ['api', 'createClient'],
    ['capture', 'capture'],
    ['client', 'createClient'],
    ['player', 'mountPlayer'],
  ]) {
    const module = await import(pathToFileURL(resolve(dist, manifest.exports[`./${name}`].default)).href)
    expect(typeof module[exportedFunction]).toBe('function')
  }
  expect(manifest.exports['./worker']).toBe(`./${manifest.main}`)
})

test('a packed install exposes the renderer API, worker asset and TypeScript declarations', async () => {
  const root = resolve(import.meta.dirname, '../../..')
  const dist = resolve(root, '.tmp/dist')
  const consumer = await mkdtemp(resolve(tmpdir(), 'session-replay-consumer-'))
  try {
    const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath!, 'pack', '--json'], { cwd: dist, encoding: 'utf8' }))
    await writeFile(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    execFileSync(
      process.execPath,
      [process.env.npm_execpath!, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', resolve(dist, packed.filename)],
      { cwd: consumer, stdio: 'pipe' },
    )
    await writeFile(
      resolve(consumer, 'consumer.mjs'),
      `
      import assert from 'node:assert/strict'
      import settings from '@lvce-editor/session-replay-worker/settings' with { type: 'json' }
      import { capture, createClient, mountPlayer } from '@lvce-editor/session-replay-worker/api'
      import { createClient as legacyClient } from '@lvce-editor/session-replay-worker/client'
      assert.equal(createClient, legacyClient)
      assert.equal(typeof capture, 'function')
      assert.equal(typeof mountPlayer, 'function')
      assert.ok(import.meta.resolve('@lvce-editor/session-replay-worker/worker').endsWith('/dist/sessionReplayWorkerMain.js'))
      assert.deepEqual(settings.map(({ id }) => id), ['sessionReplay.enabled', 'sessionReplay.uploadEnabled', 'sessionReplay.allowAnonymousUploads'])
      assert.ok(settings.every(({ category, description, heading, type, value }) => category && description && heading && type === 'boolean' && value === false))
    `,
    )
    execFileSync(process.execPath, ['consumer.mjs'], { cwd: consumer, stdio: 'pipe' })
    await writeFile(
      resolve(consumer, 'consumer.mts'),
      `
      import { capture, createClient, mountPlayer, type Frame, type Session } from '@lvce-editor/session-replay-worker/api'
      import { observe } from '@lvce-editor/session-replay-worker/capture'
      import { createClient as legacyClient } from '@lvce-editor/session-replay-worker/client'
      import { renderFrame } from '@lvce-editor/session-replay-worker/player'
      const client = createClient(new URL('https://example.test/worker.js'))
      const frame: Frame = capture(document)
      const id: string = await client.invoke('start', { local: true, upload: false })
      await client.invoke('record', 'frame', frame)
      const session: Session = await client.invoke('export')
      const result = await client.invoke('seek', 100)
      renderFrame(document, result.frame)
      observe(document, (type, data) => client.invoke('record', type, data), console.error)
      await mountPlayer(document.body, { workerUrl: 'worker.js', source: { session } })
      legacyClient('worker.js').dispose()
      // @ts-expect-error unknown command
      await client.invoke('execute')
      // @ts-expect-error seek requires a number
      await client.invoke('seek', '100')
      // @ts-expect-error a frame requires visual data
      await client.invoke('record', 'frame', {})
      // @ts-expect-error export returns a session
      const invalid: string = await client.invoke('export')
    `,
    )
    for (const [module, moduleResolution] of [
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler'],
    ]) {
      execFileSync(
        process.execPath,
        [
          resolve(root, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--strict',
          '--target',
          'ES2022',
          '--module',
          module,
          '--moduleResolution',
          moduleResolution,
          'consumer.mts',
        ],
        { cwd: consumer, stdio: 'pipe' },
      )
    }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}, 30_000)
