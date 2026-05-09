export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'stackPrismTheme'

const isThemeMode = (value: unknown): value is ThemeMode => value === 'auto' || value === 'light' || value === 'dark'

const applyTheme = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return
  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }
}

export const getStoredTheme = async (): Promise<ThemeMode> => {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY)
    const value = stored[STORAGE_KEY]
    return isThemeMode(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export const setStoredTheme = async (mode: ThemeMode): Promise<void> => {
  applyTheme(mode)
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: mode })
  } catch {
    return
  }
}

export const initTheme = async (): Promise<ThemeMode> => {
  const mode = await getStoredTheme()
  applyTheme(mode)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[STORAGE_KEY]) return
      const next = changes[STORAGE_KEY].newValue
      applyTheme(isThemeMode(next) ? next : 'auto')
    })
  } catch {
    // 内容脚本或不支持 storage.onChanged 的环境忽略
  }
  return mode
}

export const cycleTheme = (current: ThemeMode): ThemeMode => {
  if (current === 'auto') return 'light'
  if (current === 'light') return 'dark'
  return 'auto'
}

export const themeLabel = (mode: ThemeMode): string => {
  if (mode === 'light') return '浅色'
  if (mode === 'dark') return '深色'
  return '自动'
}
