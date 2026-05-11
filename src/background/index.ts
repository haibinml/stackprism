import { injectContentObserverIntoOpenTabs } from './content-injector'
import { clearBadge, clearTabSession } from './tab-store'
import { clearDynamicSnapshotTimer, clearPendingDynamicSnapshot } from './dynamic-snapshot'
import { buildHeaderRecord, dedupeApiRecords, mergeHeaderRecords, shouldMergeHeaderRecords } from './headers'
import { clearActiveDetectionTimer, refreshAllBadges, saveTabDataAndBadge, scheduleActivePageDetection } from './detection'
import { getTabData, getTabSnapshot } from './tab-store'
import { SETTINGS_STORAGE_KEY, applyDetectorSettingsUpdate, loadDetectorSettings, loadTechRules } from './detector-settings'
import { registerMessageRouter } from './message-router'
import { clearBundleLicenseTimer } from './bundle-license'
import { isDetectablePageUrl, isObservableRequestUrl } from '@/utils/page-support'

registerMessageRouter()
refreshAllBadges().catch(() => {})

chrome.runtime.onInstalled.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

chrome.runtime.onStartup.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

chrome.tabs.onRemoved.addListener(tabId => {
  clearActiveDetectionTimer(tabId)
  clearBundleLicenseTimer(tabId)
  clearDynamicSnapshotTimer(tabId)
  clearPendingDynamicSnapshot(tabId)
  clearTabSession(tabId)
})

const clearTabDetectionState = (tabId: number) => {
  clearActiveDetectionTimer(tabId)
  clearBundleLicenseTimer(tabId)
  clearDynamicSnapshotTimer(tabId)
  clearPendingDynamicSnapshot(tabId)
  clearBadge(tabId)
  clearTabSession(tabId).catch(() => {})
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || ''
  if (url && !isDetectablePageUrl(url)) {
    clearTabDetectionState(tabId)
    return
  }

  if (changeInfo.status === 'loading') {
    clearActiveDetectionTimer(tabId)
    clearDynamicSnapshotTimer(tabId)
    clearPendingDynamicSnapshot(tabId)
    clearBadge(tabId)
    return
  }

  if (changeInfo.status === 'complete') {
    if (isDetectablePageUrl(url)) {
      scheduleActivePageDetection(tabId, 600)
    } else {
      clearTabDetectionState(tabId)
    }
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
    applyDetectorSettingsUpdate(changes[SETTINGS_STORAGE_KEY].newValue)
    refreshAllBadges()
  }
})

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.tabId < 0 || !details.responseHeaders) return
    if (!isObservableRequestUrl(details.url)) return

    Promise.all([getTabData(details.tabId), loadTechRules(), loadDetectorSettings(), getTabSnapshot(details.tabId)])
      .then(([data, rules, settings, tab]) => {
        if (details.type === 'main_frame' && !isDetectablePageUrl(details.url)) {
          clearTabDetectionState(details.tabId)
          return
        }
        if (details.type !== 'main_frame' && !isDetectablePageUrl(tab.url)) {
          clearTabDetectionState(details.tabId)
          return
        }
        const record = buildHeaderRecord(details, rules.headers || {}, settings)
        if (details.type === 'main_frame') {
          data.main = shouldMergeHeaderRecords(data.main, record) ? mergeHeaderRecords(data.main, record) : record
          data.apis = []
          data.frames = []
          delete data.page
          delete data.dynamic
        } else if (details.type === 'xmlhttprequest' || (details.type as string) === 'fetch' || details.type === 'websocket') {
          data.apis = dedupeApiRecords([record, ...(data.apis || [])])
        } else if (details.type === 'sub_frame') {
          data.frames = dedupeApiRecords([record, ...(data.frames || [])]).slice(0, 10)
        }
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(details.tabId, data, settings)
      })
      .catch(() => {})
  },
  { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
  ['responseHeaders', 'extraHeaders']
)
