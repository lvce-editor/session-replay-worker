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
        if (node.type === 'Rule') {
          let unsafe = false
          walk(node.prelude, (selector) => {
            if (selector.type === 'PseudoClassSelector' && /^host(?:-context)?$/i.test(ident.decode(selector.name))) unsafe = true
          })
          if (unsafe) {
            list.remove(item)
            return this.skip
          }
        }
        if (node.type === 'PseudoClassSelector' && ident.decode(node.name).toLowerCase() === 'root') {
          item.data = { name: 'html', type: 'TypeSelector' }
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
