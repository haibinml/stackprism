const STYLE_ID = 'stackPrismCustomCss'

export function applyCustomCss(css: string): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.documentElement.append(style)
  }
  style.textContent = String(css ?? '')
}
