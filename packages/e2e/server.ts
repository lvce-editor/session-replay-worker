import { build } from 'esbuild'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'

const fixtures = import.meta.dirname
const dist = resolve(fixtures, '../../.tmp/dist/dist')
const site = resolve(fixtures, '../../.tmp/static')
const fixture = await build({
  bundle: true,
  entryPoints: [resolve(fixtures, 'fixture.ts')],
  format: 'esm',
  plugins: [
    {
      name: 'api-path',
      setup(build): void {
        build.onResolve({ filter: /api\/index\.ts$/ }, () => ({ external: true, path: '/dist/api/index.js' }))
      },
    },
  ],
  write: false,
})
const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const path = new URL(req.url || '/', 'http://localhost').pathname
    if (path === '/fixture.js') {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(fixture.outputFiles[0].contents)
      return
    }
    let root = fixtures
    if (path.startsWith('/session-replay-worker/')) root = site
    else if (path.startsWith('/dist/')) root = dist
    let relativePath = path === '/' ? 'index.html' : path.slice(1)
    if (root === site) relativePath = path.slice('/session-replay-worker/'.length) || 'index.html'
    else if (root === dist) relativePath = path.slice('/dist/'.length)

    let file = resolve(root, relativePath)
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end()
      return
    }
    const info = await stat(file)
    if (info.isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(301, { Location: `${path}/${new URL(req.url || '/', 'http://localhost').search}` }).end()
        return
      }
      file = resolve(file, 'index.html')
    }
    const data = await readFile(file)
    let contentType = 'text/html'
    if (file.endsWith('.js')) contentType = 'text/javascript'
    else if (file.endsWith('.css')) contentType = 'text/css'
    res.setHeader('Content-Type', contentType)
    res.end(data)
  } catch {
    res.writeHead(404).end()
  }
}
createServer((req, res) => {
  void serve(req, res)
}).listen(4317, '127.0.0.1')
