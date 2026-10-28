// css-tree binds traversal controls to the visitor receiver.
/* eslint-disable unicorn/no-this-outside-of-class */
// cspell:ignore Atrule
import type { WalkOptionsNoVisit } from 'css-tree'
import { generate, ident, parse, walk } from 'css-tree'
import { resolveAssetUrl } from '../AssetUrls/AssetUrls.ts'

const allowedRules = ['media', 'supports', 'container', 'layer', 'font-face', 'keyframes', '-webkit-keyframes', 'property']
// String-valued image sources and dynamic attr() URLs cannot be constrained to the asset directory.
const blockedFunctions = ['url', 'image-set', '-webkit-image-set', 'image', 'src', 'attr', 'paint']

export const replayCss = (css: string, assetBaseUrl?: string, inline = false): string => {
  try {
    const ast = parse(css, { context: inline ? 'declarationList' : 'stylesheet', parseCustomProperty: true })
    if (!inline) {
      walk(ast, (node, item, list) => {
        if (node.type !== 'TypeSelector' || ident.decode(node.name).toLowerCase() !== 'body' || !item || !list) return
        const selector = node as { name: string; type: string }
        selector.type = 'ClassSelector'
        selector.name = 'SessionReplaySurface'
        const combinator = { name: '>' as const, type: 'Combinator' } as const
        const div = { name: 'div' as const, type: 'TypeSelector' } as const
        if (item.next) {
          list.insertData(combinator, item.next)
          if (item.next.next) list.insertData(div, item.next.next)
          else list.appendData(div)
        } else {
          list.appendData(combinator)
          list.appendData(div)
        }
      })
    }
    walk(ast, {
      enter(node, item, list): symbol | undefined {
        if (node.type === 'Atrule' && !allowedRules.includes(ident.decode(node.name).toLowerCase())) {
          list.remove(item)
          return this.skip
        }
        if (node.type === 'Raw') {
          list.remove(item)
          return this.skip
        }
        if (node.type !== 'Declaration') return undefined
        let unsafe = false
        walk(node.value, (value) => {
          if (value.type === 'Raw' || (value.type === 'Function' && blockedFunctions.includes(ident.decode(value.name).toLowerCase()))) unsafe = true
          if (value.type === 'Url') {
            const resolved = resolveAssetUrl(value.value, assetBaseUrl)
            if (resolved) value.value = resolved
            else if (
              !/^data:(?:image\/(?:png|jpeg|gif|webp)|font\/[\w-]+);base64,[a-z\d+/=\s]+$/i.test(value.value) &&
              !/^#[\w-]+$/.test(value.value)
            )
              unsafe = true
          }
        })
        if (unsafe) list.remove(item)
        return this.skip
      },
    } satisfies WalkOptionsNoVisit)
    return generate(ast)
  } catch {
    return ''
  }
}
