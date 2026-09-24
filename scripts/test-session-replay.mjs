import { execFileSync } from 'node:child_process'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const fixture = new URL('../.tmp/lvce-editor/', import.meta.url)
const tests = new URL('packages/extension-host-worker-tests/', fixture)
const target = new URL('src/session-replay.settings.ts', tests)
const original = await readFile(target).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})
try {
  await copyFile(new URL('session-replay.settings.ts', import.meta.url), target)
  const args = ['src/_all.js', '--headless', '--test-name-prefix=session-replay.settings']
  const options = { cwd: fileURLToPath(tests), stdio: 'inherit' }
  execFileSync(process.execPath, args, options)
  execFileSync(
    process.execPath,
    [...args, '--initial-settings={"sessionReplay.enabled":true}', '--expect-console=Session replay command recording verified'],
    options,
  )
} finally {
  if (original) await writeFile(target, original)
  else await rm(target, { force: true })
}
