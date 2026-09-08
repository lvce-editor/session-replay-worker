import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
    sessionReplayWorkerMain: join(worker, 'src/sessionReplayWorkerMain.ts'),
  },
  outdir: join(dist, 'dist'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})

const manifest = JSON.parse(await readFile(join(worker, 'package.json'), 'utf8'))
delete manifest.scripts
delete manifest.jest
delete manifest.devDependencies
manifest.version = getVersion()
manifest.main = 'dist/sessionReplayWorkerMain.js'
manifest.files = ['dist']
manifest.exports = {
  './api': { types: './dist/api/index.d.ts', default: './dist/api/index.js' },
  './capture': { types: './dist/api/capture.d.ts', default: './dist/api/capture.js' },
  './client': { types: './dist/api/client.d.ts', default: './dist/api/client.js' },
  './player': { types: './dist/api/player.d.ts', default: './dist/api/player.js' },
  './worker': './dist/sessionReplayWorkerMain.js',
}
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(worker, 'tsconfig.build.json')], { stdio: 'inherit' })
// TypeScript rewrites runtime imports but retains .ts specifiers in declarations.
const parts = join(dist, 'dist/parts')
for (const name of await readdir(parts, { recursive: true })) {
  if (!name.endsWith('.d.ts')) continue
  const file = join(parts, name)
  const declaration = await readFile(file, 'utf8')
  await writeFile(file, declaration.replace(/\.ts(['"])/g, '.js$1'))
}
await mkdir(join(dist, 'dist/api'), { recursive: true })
for (const [name, moduleName] of [
  ['index', 'Api'],
  ['capture', 'Capture'],
  ['client', 'Client'],
  ['player', 'Player'],
  ['playerStyles', 'PlayerStyles'],
  ['transfer', 'Transfer'],
  ['types', 'Types'],
]) {
  for (const extension of ['js', 'd.ts']) {
    await writeFile(join(dist, `dist/api/${name}.${extension}`), `export * from '../parts/${moduleName}/${moduleName}.js'\n`)
  }
}
// Keep the existing browser asset URLs working alongside the npm subpath aliases.
for (const name of ['capture', 'client', 'player']) {
  await writeFile(join(dist, `dist/${name}.js`), `export * from './api/${name}.js'\n`)
}

await writeFile(join(dist, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await cp(join(root, 'README.md'), join(dist, 'README.md'))
await cp(join(root, 'LICENSE'), join(dist, 'LICENSE'))
