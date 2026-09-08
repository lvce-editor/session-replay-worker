import { expect, test } from '@jest/globals'
import { replayCss } from '../src/parts/ReplayCss/ReplayCss.ts'

test('maps root selectors, preserves theme variables and filters host selectors', () => {
  expect(replayCss(':root { --color: red } body { color: var(--color) } :host { display:none }')).toBe('html{--color:red}body{color:var(--color)}')
})

test('removes resource imports and unsafe URLs including escaped and custom-property sources', () => {
  expect(replayCss(String.raw`@import '/private/style'; div { --image:u\72l('/private/image'); background:var(--image); color:red }`)).toBe(
    'div{background:var(--image);color:red}',
  )
  expect(replayCss('background:image-set("/private/image" 1x);cursor:url(/private/cursor),auto;color:blue', undefined, true)).toBe('color:blue')
})

test('remaps trusted assets inside CSS and preserves safe inline raster images', () => {
  expect(replayCss('div { mask-image:url(/icons/files.svg); background:url(data:image/png;base64,AAAA) }', 'https://example.com/assets/')).toBe(
    'div{mask-image:url(https://example.com/assets/icons/files.svg);background:url(data:image/png;base64,AAAA)}',
  )
})

test('retains nested CSS rules and discards unsupported raw syntax', () => {
  expect(replayCss('@media (min-width:1px) { :root { color:red } }')).toBe('@media (min-width:1px){html{color:red}}')
  expect(replayCss('div { color: red; broken }')).not.toContain('broken')
})
