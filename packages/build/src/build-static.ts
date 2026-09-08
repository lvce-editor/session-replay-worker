import { build } from 'esbuild'
import './build.ts'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const output = resolve(root, '.tmp/static')
const fixtures = resolve(root, 'packages/e2e')

await rm(output, { recursive: true, force: true })
await mkdir(resolve(output, 'replay'), { recursive: true })
await mkdir(resolve(output, 'tests/fixture'), { recursive: true })
await cp(resolve(root, 'packages/build/static/index.html'), resolve(output, 'index.html'))
await cp(resolve(root, 'packages/build/static/replay/index.html'), resolve(output, 'replay/index.html'))
await cp(resolve(fixtures, 'browser/index.html'), resolve(output, 'tests/index.html'))
const fixture = await readFile(resolve(fixtures, 'index.html'), 'utf8')
await writeFile(resolve(output, 'tests/fixture/index.html'), fixture.replace('src="/fixture.js"', 'src="../fixture.js"'))
await cp(resolve(fixtures, 'imported.css'), resolve(output, 'tests/fixture/imported.css'))
await writeFile(resolve(output, '.nojekyll'), '')
await build({
  entryPoints: {
    'replay/main': resolve(root, 'packages/build/static/replay/main.ts'),
    'tests/main': resolve(fixtures, 'browser/main.ts'),
    'tests/fixture': resolve(fixtures, 'browser/fixture.ts'),
  },
  outdir: output,
  format: 'esm',
  target: 'es2022',
  bundle: true,
  plugins: [
    {
      name: 'api-path',
      setup(build) {
        build.onResolve({ filter: /(Api\/Api|Player\/Player)\.ts$/ }, (args) => ({
          path: `../dist/api/${args.path.endsWith('Player.ts') ? 'player' : 'index'}.js`,
          external: true,
        }))
      },
    },
  ],
})
await cp(resolve(root, '.tmp/dist/dist'), resolve(output, 'dist'), { recursive: true })
