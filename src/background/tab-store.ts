// @ts-nocheck

const TAB_DATA_PREFIX = 'tab:'
const POPUP_DATA_PREFIX = 'popup:'

export function storageKey(tabId: number): string {
  return `${TAB_DATA_PREFIX}${tabId}`
}

export function popupStorageKey(tabId: number): string {
  return `${POPUP_DATA_PREFIX}${tabId}`
}

export async function getTabData(tabId: number): Promise<any> {
  const key = storageKey(tabId)
  try {
    const stored = await chrome.storage.session.get(key)
    return stored[key] || {}
  } catch {
    return {}
  }
}

export async function getPopupCache(tabId: number): Promise<any> {
  const key = popupStorageKey(tabId)
  try {
    const stored = await chrome.storage.session.get(key)
    return stored[key] || null
  } catch {
    return null
  }
}

export async function writeTabData(tabId: number, tabData: Record<string, unknown>, popupRecord: any): Promise<void> {
  await chrome.storage.session.set({
    [storageKey(tabId)]: tabData,
    [popupStorageKey(tabId)]: popupRecord
  })
}

export async function clearTabSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove([storageKey(tabId), popupStorageKey(tabId)]).catch(() => {})
}

export async function getTabSnapshot(tabId: number): Promise<{ id: number; url: string; title: string }> {
  try {
    const tab = await chrome.tabs.get(tabId)
    return {
      id: tab.id ?? tabId,
      url: tab.url || '',
      title: tab.title || ''
    }
  } catch {
    return { id: tabId, url: '', title: '' }
  }
}

export function formatBadgeCount(count: number): string {
  if (!count) return ''
  return count > 99 ? '99+' : String(count)
}

export async function updateBadgeForTab(tabId: number, popup: any): Promise<void> {
  const count = Number(popup?.counts?.total || 0)
  const text = formatBadgeCount(count)
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#0f766e' })
    await chrome.action.setBadgeText({ tabId, text })
    await chrome.action.setTitle({
      tabId,
      title: count > 0 ? `StackPrism 栈棱镜 · 已识别 ${count} 项技术` : 'StackPrism 栈棱镜'
    })
  } catch {
    return
  }
}

export function clearBadge(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
  chrome.action.setTitle({ tabId, title: 'StackPrism 栈棱镜' }).catch(() => {})
}
