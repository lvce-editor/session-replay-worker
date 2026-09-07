import { expect, test } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

test('the built package contains runnable exports without monorepo files', async () => {
  execFileSync(process.execPath, [resolve(import.meta.dirname, '../src/build.ts')])
  const dist = resolve(import.meta.dirname, '../../../.tmp/dist')
  const manifest = JSON.parse(await readFile(resolve(dist, 'package.json'), 'utf8'))
  expect(manifest.name).toBe('@lvce-editor/session-replay-worker')
  expect(manifest.main).toBe('dist/sessionReplayWorkerMain.js')
  expect(manifest.scripts).toBeUndefined()
  expect(manifest.workspaces).toBeUndefined()
  const npmPath = process.env.npm_execpath
  if (!npmPath) throw new Error('Run this test through npm test')
  const [packed] = JSON.parse(execFileSync(process.execPath, [npmPath, 'pack', '--dry-run', '--json'], { cwd: dist, encoding: 'utf8' }))
  expect(packed.files.map(({ path }: { path: string }) => path).sort()).toEqual([
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
    expect(typeof module[exportedFunction]).toBe('function')
  }
  expect(manifest.exports['./worker']).toBe(`./${manifest.main}`)
})
