// @ts-nocheck
/* eslint-disable */

import { loadStackPrismRules } from './rule-loader'
import { attachTechnologyLinks, getTechnologyUrl } from './tech-links'
import { injectContentObserverIntoOpenTabs } from './content-injector'
import { augmentPageWithWordPressThemeStyles, detectWordPressThemeStylesFromPage } from './wordpress'
import {
  cleanWordPressThemeSlug,
  isFrontendFallback,
  mergeTechnologyRecords,
  normalizeDynamicFallbackTechName,
  shortHeaderUrl,
  strongerConfidence
} from './merge'
import { clearBadge, clearTabSession, getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { clearDynamicSnapshotTimer, clearPendingDynamicSnapshot, configureDynamicSnapshot, queueDynamicSnapshot } from './dynamic-snapshot'
import { addStoredCustomHeaderRules, buildHeaderRecord, dedupeApiRecords } from './headers'
import {
  buildPopupCacheRecord,
  buildPopupRawResult,
  cleanPageDetectionRecord,
  cleanTechnologyRecords,
  configurePopupCache,
  getPopupResultResponse
} from './popup-cache'
import { cleanStringArray, normalizeSettings } from '@/utils/normalize-settings'

const SETTINGS_STORAGE_KEY = 'stackPrismSettings'

let techRulesPromise = null
let detectorSettingsPromise = null
let detectorSettingsCache = null
const activeDetectionTimers = new Map()

configurePopupCache({ loadDetectorSettings })

configureDynamicSnapshot({
  scheduleActivePageDetection,
  saveTabDataAndBadge,
  loadTechRules,
  loadDetectorSettings,
  buildEffectivePageRules
})

chrome.runtime.onInstalled.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

chrome.runtime.onStartup.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false
  }

  if (message.type === 'GET_HEADER_DATA') {
    Promise.all([getTabData(message.tabId), loadDetectorSettings()])
      .then(([data, settings]) => sendResponse({ ok: true, data: addStoredCustomHeaderRules(data, settings) }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'GET_POPUP_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    getPopupResultResponse(tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'GET_POPUP_RAW_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadDetectorSettings(), getTabSnapshot(tabId)])
      .then(([data, settings, tab]) => buildPopupRawResult(addStoredCustomHeaderRules(data, settings), settings, tab))
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'GET_TECH_LINK') {
    loadDetectorSettings()
      .then(settings => getTechnologyUrl(message.name, settings))
      .then(url => sendResponse({ ok: true, url }))
      .catch(error => sendResponse({ ok: false, error: String(error), url: '' }))
    return true
  }

  if (message.type === 'START_BACKGROUND_DETECTION') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    sendResponse({ ok: true })
    runActivePageDetection(tabId).catch(() => {})
    return false
  }

  if (message.type === 'GET_WORDPRESS_THEME_DETAILS') {
    detectWordPressThemeStylesFromPage(message.page)
      .then(technologies => sendResponse({ ok: true, technologies: cleanTechnologyRecords(technologies) }))
      .catch(error => sendResponse({ ok: false, error: String(error), technologies: [] }))
    return true
  }

  if (message.type === 'DYNAMIC_PAGE_SNAPSHOT') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number' || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    queueDynamicSnapshot(tabId, message.snapshot)
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'PAGE_DETECTION_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadDetectorSettings()])
      .then(async ([data, settings]) => {
        const page = await augmentPageWithWordPressThemeStyles(message.page)
        data.page = cleanPageDetectionRecord(page)
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(tabId, data, settings)
      })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  return false
})

chrome.tabs.onRemoved.addListener(tabId => {
  clearActiveDetectionTimer(tabId)
  clearDynamicSnapshotTimer(tabId)
  clearPendingDynamicSnapshot(tabId)
  clearTabSession(tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearActiveDetectionTimer(tabId)
    clearDynamicSnapshotTimer(tabId)
    clearPendingDynamicSnapshot(tabId)
    clearTabSession(tabId)
    clearBadge(tabId)
    return
  }

  if (changeInfo.status === 'complete') {
    scheduleActivePageDetection(tabId, 600)
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
    detectorSettingsCache = normalizeSettings(changes[SETTINGS_STORAGE_KEY].newValue)
    detectorSettingsPromise = Promise.resolve(detectorSettingsCache)
    refreshAllBadges()
  }
})

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.tabId < 0 || !details.responseHeaders) {
      return
    }

    Promise.all([getTabData(details.tabId), loadTechRules(), loadDetectorSettings()])
      .then(([data, rules, settings]) => {
        const record = buildHeaderRecord(details, rules.headers || {}, settings)
        if (details.type === 'main_frame') {
          data.main = record
          data.apis = []
        } else if (details.type === 'xmlhttprequest' || details.type === 'fetch') {
          data.apis = dedupeApiRecords([record, ...(data.apis || [])])
        } else if (details.type === 'sub_frame') {
          data.frames = dedupeApiRecords([record, ...(data.frames || [])]).slice(0, 10)
        }
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(details.tabId, data, settings)
      })
      .catch(() => {})
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
)

async function loadTechRules() {
  if (!techRulesPromise) {
    techRulesPromise = loadStackPrismRules().catch(error => {
      techRulesPromise = null
      return {}
    })
  }
  return techRulesPromise
}

async function loadDetectorSettings() {
  if (detectorSettingsCache) {
    return detectorSettingsCache
  }

  if (!detectorSettingsPromise) {
    detectorSettingsPromise = chrome.storage.sync
      .get(SETTINGS_STORAGE_KEY)
      .then(stored => {
        detectorSettingsCache = normalizeSettings(stored[SETTINGS_STORAGE_KEY])
        return detectorSettingsCache
      })
      .catch(() => {
        detectorSettingsCache = normalizeSettings()
        return detectorSettingsCache
      })
  }
  return detectorSettingsPromise
}

function buildEffectivePageRules(pageRules, settings) {
  return {
    ...pageRules,
    customRules: settings?.customRules || []
  }
}

async function saveTabDataAndBadge(tabId, data, settings) {
  const popup = buildPopupCacheRecord(data, settings, await getTabSnapshot(tabId))
  const { popup: _legacyPopup, ...tabData } = data || {}
  await writeTabData(tabId, tabData, popup)
  await updateBadgeForTab(tabId, popup)
}

async function refreshAllBadges() {
  try {
    const [tabs, settings] = await Promise.all([chrome.tabs.query({}), loadDetectorSettings()])
    for (const tab of tabs) {
      if (typeof tab.id !== 'number' || tab.id < 0) {
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

async function runActivePageDetection(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return
  }

  try {
    const [data, rules, settings] = await Promise.all([getTabData(tabId), loadTechRules(), loadDetectorSettings()])
    const pageRules = buildEffectivePageRules(rules.page || {}, settings)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: r => {
        window.__SP_RULES__ = r
      },
      args: [pageRules]
    })
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['injected/page-detector.iife.js']
    })
    const page = injection?.[0]?.result
    if (!page) {
      return
    }
    const augmentedPage = await augmentPageWithWordPressThemeStyles(page)
    data.page = cleanPageDetectionRecord(augmentedPage)
    data.updatedAt = Date.now()
    await saveTabDataAndBadge(tabId, data, settings)
  } catch {
    return
  }
}

function scheduleActivePageDetection(tabId, delay = 600) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return
  }
  clearActiveDetectionTimer(tabId)
  const timer = setTimeout(() => {
    activeDetectionTimers.delete(tabId)
    runActivePageDetection(tabId)
  }, delay)
  activeDetectionTimers.set(tabId, timer)
}

function clearActiveDetectionTimer(tabId) {
  const timer = activeDetectionTimers.get(tabId)
  if (timer) {
    clearTimeout(timer)
    activeDetectionTimers.delete(tabId)
  }
}

