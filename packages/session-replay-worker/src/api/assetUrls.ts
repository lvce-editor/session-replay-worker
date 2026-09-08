// Only known editor asset paths can be remapped into the host's trusted asset directory.
export const resolveAssetUrl = (value: string, assetBaseUrl?: string): string | undefined => {
  if (!assetBaseUrl) return undefined
  value = value.replace('/extensions/builtin.vscode-icons/icons/', '/file-icons/')
  const match = /\/(icons|fonts|file-icons)\/([\w./-]+)(?:[?#].*)?$/.exec(value)
  if (!match || match[2].split('/').some((part) => !part || part === '.' || part === '..')) return undefined
  if (!/\.(svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$/.test(match[2])) return undefined
  return `${assetBaseUrl}${match[1]}/${match[2]}`
}

export const rewriteAssetUrls = (value: string, assetBaseUrl?: string): string =>
  value.replaceAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]+))\s*\)/gi, (original, doubleQuoted, singleQuoted, unquoted) => {
    const url = resolveAssetUrl(doubleQuoted ?? singleQuoted ?? unquoted, assetBaseUrl)
    return url ? `url("${url}")` : original
  })
