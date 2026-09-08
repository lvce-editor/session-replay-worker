import { expect, test } from '@jest/globals'
import { resolveAssetUrl, rewriteAssetUrls } from '../src/parts/AssetUrls/AssetUrls.ts'

const base = 'https://lvce-editor.dev/session-replay-assets/lvce-editor/'

for (const [url, expected] of [
  ['/icons/icon.svg', 'icons/icon.svg'],
  ['/static/old-commit/icons/files.svg', 'icons/files.svg'],
  ['http://localhost:3000/old-commit/icons/files.svg', 'icons/files.svg'],
  ['file:///opt/lvce/static/old-commit/fonts/FiraCode-VariableFont.ttf', 'fonts/FiraCode-VariableFont.ttf'],
  ['/static/old-commit/extensions/builtin.vscode-icons/icons/file_type_json.svg', 'file-icons/file_type_json.svg'],
  ['/static/old-commit/file-icons/file_type_json.svg?etag=old', 'file-icons/file_type_json.svg'],
  ['/static/old/extensions/builtin.chat-view-2/chat.svg', 'extensions/builtin.chat-view-2/chat.svg'],
  ['lvce://-/remote/opt/lvce/static/old/extensions/builtin.gpt-voice/media/voice-chat.svg', 'extensions/builtin.gpt-voice/media/voice-chat.svg'],
  ['file:///opt/lvce/extensions/builtin.git/icons/dark/status-added.svg', 'extensions/builtin.git/icons/dark/status-added.svg'],
  ['http://localhost:3000/remote/home/test/.lvce/extensions/hetzner/hetzner.svg', 'extensions/hetzner/hetzner.svg'],
]) {
  test(`remaps ${url}`, () => {
    expect(resolveAssetUrl(url, base)).toBe(base + expected)
    expect(resolveAssetUrl(url)).toBeUndefined()
  })
}

for (const url of [
  '/private/image.svg',
  '/icons/../private/image.svg',
  '/icons/%2e%2e/image.svg',
  '/icons//image.svg',
  '/icons/script.js',
  '/extensions/builtin.chat-view-2/../chat.svg',
  '/extensions/builtin.chat-view-2/%2e%2e/chat.svg',
  '/extensions/builtin.chat-view-2//chat.svg',
  '/extensions/builtin.chat-view-2/src/main.js',
  '/extensions/builtin.chat-view-2/extension.json',
  '/extensions/builtin.chat-view-2/icons/../chat.svg',
]) {
  test(`does not map ${url}`, () => {
    expect(resolveAssetUrl(url, base)).toBeUndefined()
  })
}

test('rewrites CSS URLs in stylesheets, inline styles and custom properties', () => {
  expect(rewriteAssetUrls(`.Icon { mask-image: url('/old/icons/files.svg'); --image: url(/icons/icon.svg) }`, base)).toBe(
    `.Icon { mask-image: url("${base}icons/files.svg"); --image: url("${base}icons/icon.svg") }`,
  )
  expect(rewriteAssetUrls('div { background: url(data:image/png;base64,abc) }', base)).toBe('div { background: url(data:image/png;base64,abc) }')
})
