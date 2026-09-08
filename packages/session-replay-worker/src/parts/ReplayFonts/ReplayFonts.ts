interface ReplayFont {
  css: string
  face: FontFace
}

const createFont = (document: Document, style: CSSStyleDeclaration): FontFace => {
  const descriptors: FontFaceDescriptors = {}
  for (const name of ['stretch', 'style', 'weight'] as const) {
    const value = style.getPropertyValue(`font-${name}`)
    if (value) descriptors[name] = value
  }
  const unicodeRange = style.getPropertyValue('unicode-range')
  if (unicodeRange) descriptors.unicodeRange = unicodeRange
  return new document.defaultView!.FontFace(style.getPropertyValue('font-family'), style.getPropertyValue('src'), descriptors)
}

// Chromium does not register @font-face rules adopted inside a shadow root.
// Register only rules from the already-filtered sheets and release our faces on disposal.
export const createReplayFonts = (document: Document): { dispose: () => void; update: (sheets: CSSStyleSheet[]) => void } => {
  let fonts: ReplayFont[] = []
  const dispose = (): void => {
    for (const { face } of fonts) document.fonts.delete(face)
    fonts = []
  }
  const update = (sheets: CSSStyleSheet[]): void => {
    const next: ReplayFont[] = []
    const visit = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if (rule instanceof document.defaultView!.CSSFontFaceRule) {
          if (!rule.style.getPropertyValue('src')) continue
          const existing = fonts.find(({ css }) => css === rule.cssText)
          if (existing) next.push(existing)
          else {
            const face = createFont(document, rule.style)
            document.fonts.add(face)
            next.push({ css: rule.cssText, face })
          }
        } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
      }
    }
    for (const sheet of sheets) visit(sheet.cssRules)
    for (const font of fonts) if (!next.includes(font)) document.fonts.delete(font.face)
    fonts = next
  }
  return { dispose, update }
}
