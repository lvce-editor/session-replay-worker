import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const fixtures = import.meta.dirname
const dist = resolve(fixtures, '../../.tmp/dist/dist')
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    const root = path.startsWith('/dist/') ? dist : fixtures
    const relativePath = root === dist ? path.slice('/dist/'.length) : path === '/' ? 'index.html' : path.slice(1)
    const file = resolve(root, relativePath)
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end()
      return
    }
    const data = await readFile(file)
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
    res.end(data)
  } catch {
    res.writeHead(404).end()
  }
}).listen(4317, '127.0.0.1')
