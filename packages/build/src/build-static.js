import './build.js'
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const output = resolve(root, '.tmp/static')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(resolve(root, 'packages/build/static'), output, { recursive: true })
await cp(resolve(root, '.tmp/dist/dist'), resolve(output, 'dist'), { recursive: true })
