import { augmentPageWithWordPressThemeStyles } from './wordpress'
import { buildPopupCacheRecord, cleanPageDetectionRecord } from './popup-cache'
import { fetchMainHeadersFallback, mergeHeaderRecords } from './headers'
import { clearBadge, clearTabSession, getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { buildEffectivePageRules, loadDetectorSettings, loadTechRules } from './detector-settings'
import { scheduleBundleLicenseDetection } from './bundle-license'
import { injectContentObserver } from './content-injector'
import { isDetectablePageUrl } from '@/utils/page-support'

const activeDetectionTimers = new Map<number, ReturnType<typeof setTimeout>>()

const normalizePageUrl = (value: unknown): string => {
  try {
    const url = new URL(String(value || ''))
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

const needsMainHeadersFallback = (record: any, currentUrl: string): boolean => {
  if (!record) return true
  const recordUrl = normalizePageUrl(record.url)
  const tabUrl = normalizePageUrl(currentUrl)
  if (recordUrl && tabUrl && recordUrl !== tabUrl) return true
  return Number(record.headerCount || 0) <= 1 && !Object.keys(record.headers || {}).length && !(record.technologies || []).length
}

const headerRecordMatchesUrl = (record: any, currentUrl: string): boolean => {
  const recordUrl = normalizePageUrl(record?.url)
  const tabUrl = normalizePageUrl(currentUrl)
  return Boolean(recordUrl && tabUrl && recordUrl === tabUrl)
}

const headerRecordSharesPagePath = (record: any, currentUrl: string): boolean => {
  try {
    const recordUrl = new URL(String(record?.url || ''))
    const tabUrl = new URL(String(currentUrl || ''))
    return recordUrl.origin === tabUrl.origin && recordUrl.pathname === tabUrl.pathname
  } catch {
    return false
  }
}

const hasUsefulHeaderRecord = (record: any): boolean =>
  Boolean(record && (Number(record.headerCount || 0) > 1 || Object.keys(record.headers || {}).length || (record.technologies || []).length))

const shouldPreserveMainHeaderRecord = (record: any, currentUrl: string): boolean =>
  headerRecordMatchesUrl(record, currentUrl) || (headerRecordSharesPagePath(record, currentUrl) && hasUsefulHeaderRecord(record))

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
    await injectContentObserver(tabId)
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

    if (needsMainHeadersFallback(data.main, (page as any).url || tab.url)) {
      const fallback = await fetchMainHeadersFallback((page as any).url || '', rules.headers || {}, settings)
      if (fallback) {
        data.main = shouldPreserveMainHeaderRecord(data.main, (page as any).url || tab.url)
          ? mergeHeaderRecords(data.main, fallback)
          : fallback
      } else if (data.main && !shouldPreserveMainHeaderRecord(data.main, (page as any).url || tab.url)) {
        delete data.main
      }
    }

    data.updatedAt = Date.now()
    await saveTabDataAndBadge(tabId, data, settings)
    scheduleBundleLicenseDetection(tabId)
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
