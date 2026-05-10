import { augmentPageWithWordPressThemeStyles } from './wordpress'
import { buildPopupCacheRecord, cleanPageDetectionRecord } from './popup-cache'
import { fetchMainHeadersFallback } from './headers'
import { clearBadge, clearTabSession, getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { buildEffectivePageRules, loadDetectorSettings, loadTechRules } from './detector-settings'
import { isDetectablePageUrl } from '@/utils/page-support'

const activeDetectionTimers = new Map<number, ReturnType<typeof setTimeout>>()

export const saveTabDataAndBadge = async (tabId: number, data: any, settings: any) => {
  const tab = await getTabSnapshot(tabId)
  if (!isDetectablePageUrl(tab.url)) {
    await clearTabSession(tabId)
    clearBadge(tabId)
    return
  }
  const popup = buildPopupCacheRecord(data, settings, tab)
  const { popup: _legacyPopup, ...tabData } = data || {}
  await writeTabData(tabId, tabData, popup)
  await updateBadgeForTab(tabId, popup)
}

export const refreshAllBadges = async () => {
  try {
    const [tabs, settings] = await Promise.all([chrome.tabs.query({}), loadDetectorSettings()])
    for (const tab of tabs) {
      if (typeof tab.id !== 'number' || tab.id < 0) continue
      if (!isDetectablePageUrl(tab.url)) {
        await clearTabSession(tab.id)
        clearBadge(tab.id)
        continue
      }
      const data = await getTabData(tab.id)
      if (data && Object.keys(data).length) {
        await saveTabDataAndBadge(tab.id, data, settings)
      } else {
        clearBadge(tab.id)
      }
    }
  } catch {
    return
  }
}

export const runActivePageDetection = async (tabId: number) => {
  if (typeof tabId !== 'number' || tabId < 0) return

  try {
    const tab = await getTabSnapshot(tabId)
    if (!isDetectablePageUrl(tab.url)) {
      await clearTabSession(tabId)
      clearBadge(tabId)
      return
    }
    const [data, rules, settings] = await Promise.all([getTabData(tabId), loadTechRules(), loadDetectorSettings()])
    const pageRules = buildEffectivePageRules(rules.page || {}, settings)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: r => {
        ;(window as any).__SP_RULES__ = r
      },
      args: [pageRules]
    })
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['injected/page-detector.iife.js']
    })
    const page = injection?.[0]?.result
    if (!page) return

    const augmentedPage = await augmentPageWithWordPressThemeStyles(page)
    data.page = cleanPageDetectionRecord(augmentedPage)

    if (!data.main) {
      const fallback = await fetchMainHeadersFallback((page as any).url || '', rules.headers || {}, settings)
      if (fallback) data.main = fallback
    }

    data.updatedAt = Date.now()
    await saveTabDataAndBadge(tabId, data, settings)
  } catch {
    return
  }
}

export const clearActiveDetectionTimer = (tabId: number) => {
  const timer = activeDetectionTimers.get(tabId)
  if (timer) {
    clearTimeout(timer)
    activeDetectionTimers.delete(tabId)
  }
}

export const scheduleActivePageDetection = (tabId: number, delay = 600) => {
  if (typeof tabId !== 'number' || tabId < 0) return
  clearActiveDetectionTimer(tabId)
  const timer = setTimeout(() => {
    activeDetectionTimers.delete(tabId)
    runActivePageDetection(tabId)
  }, delay)
  activeDetectionTimers.set(tabId, timer)
}
