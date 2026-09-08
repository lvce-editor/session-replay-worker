import { build } from 'esbuild'
import './build.ts'
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const output = resolve(root, '.tmp/static')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(resolve(root, 'packages/build/static/index.html'), resolve(output, 'index.html'))
await build({
  entryPoints: [resolve(root, 'packages/build/static/main.ts')],
  outdir: output,
  format: 'esm',
  target: 'es2022',
  bundle: true,
  external: ['../../session-replay-worker/src/parts/Player/Player.ts'],
  plugins: [
    {
      name: 'api-path',
      setup(build) {
        build.onResolve({ filter: /Player\/Player\.ts$/ }, () => ({ path: './dist/api/player.js', external: true }))
      },
    },
  ],
})
await cp(resolve(root, '.tmp/dist/dist'), resolve(output, 'dist'), { recursive: true })
