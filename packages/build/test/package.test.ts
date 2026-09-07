import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

test('the built package contains runnable exports without monorepo files', async () => {
  execFileSync(process.execPath, [resolve(import.meta.dirname, '../src/build.ts')])
  const dist = resolve(import.meta.dirname, '../../../.tmp/dist')
  const manifest = JSON.parse(await readFile(resolve(dist, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@lvce-editor/session-replay-worker')
  assert.equal(manifest.main, 'dist/sessionReplayWorkerMain.js')
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.workspaces, undefined)
  const npmExecPath = process.env.npm_execpath
  assert.ok(npmExecPath, 'the packaging test must run through npm test')
  const [packed]: { files: { path: string }[] }[] = JSON.parse(
    execFileSync(process.execPath, [npmExecPath, 'pack', '--dry-run', '--json'], { cwd: dist, encoding: 'utf8' }),
  )
  assert.deepEqual(packed.files.map(({ path }) => path).sort(), [
    'LICENSE',
    'README.md',
    'dist/capture.js',
    'dist/client.js',
    'dist/player.js',
    'dist/sessionReplayWorkerMain.js',
    'package.json',
  ])
  for (const [name, exportedFunction] of [
    ['capture', 'capture'],
    ['client', 'createClient'],
    ['player', 'mountPlayer'],
  ]) {
    const module = await import(pathToFileURL(resolve(dist, manifest.exports[`./${name}`])).href)
    assert.equal(typeof module[exportedFunction], 'function')
  }
  assert.equal(manifest.exports['./worker'], `./${manifest.main}`)
})
