import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    const file = resolve(root, `.${path === '/' ? '/e2e/index.html' : path}`)
    if (!file.startsWith(`${root}/`)) {
      res.writeHead(403).end()
      return
    }
    const data = await readFile(file)
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html')
    res.end(data)
  } catch {
    res.writeHead(404).end()
  }
}).listen(4317, '127.0.0.1')
