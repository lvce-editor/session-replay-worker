import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../../..')
const dist = join(root, '.tmp/dist')
const worker = join(root, 'packages/session-replay-worker')

const getVersion = (): string => {
  const configured = process.env.RG_VERSION || process.env.GIT_TAG
  if (configured) return configured.replace(/^v/, '')
  try {
    return execFileSync('git', ['describe', '--exact-match', '--tags'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .replace(/^v/, '')
  } catch {
    return '0.0.0-dev'
  }
}

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await build({
  entryPoints: {
    capture: join(worker, 'src/capture.js'),
    client: join(worker, 'src/client.js'),
    player: join(worker, 'src/player.js'),
    sessionReplayWorkerMain: join(worker, 'src/worker.js'),
  },
  outdir: join(dist, 'dist'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})

const manifest = JSON.parse(await readFile(join(worker, 'package.json'), 'utf8'))
delete manifest.scripts
manifest.version = getVersion()
manifest.main = 'dist/sessionReplayWorkerMain.js'
manifest.files = ['dist']
manifest.exports = {
  './capture': './dist/capture.js',
  './client': './dist/client.js',
  './player': './dist/player.js',
  './worker': './dist/sessionReplayWorkerMain.js',
}
await writeFile(join(dist, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await cp(join(root, 'README.md'), join(dist, 'README.md'))
await cp(join(root, 'LICENSE'), join(dist, 'LICENSE'))
