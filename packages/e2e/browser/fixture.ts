import { cases } from './cases.ts'

const name = new URL(location.href).searchParams.get('test')
const selected = cases.find((item) => item.name === name)
try {
  if (!selected) throw new Error(`Unknown test: ${name}`)
  await selected.run()
  parent.postMessage({ error: '', name, type: 'replay-test-result' }, location.origin)
} catch (error) {
  parent.postMessage({ error: error instanceof Error ? error.message : String(error), name, type: 'replay-test-result' }, location.origin)
}
