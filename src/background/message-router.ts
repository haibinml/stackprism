import { getTechnologyUrl } from './tech-links'
import { augmentPageWithWordPressThemeStyles, detectWordPressThemeStylesFromPage } from './wordpress'
import { getTabData, getTabSnapshot } from './tab-store'
import { queueDynamicSnapshot } from './dynamic-snapshot'
import { addStoredCustomHeaderRules } from './headers'
import { buildPopupRawResult, cleanPageDetectionRecord, cleanTechnologyRecords, getPopupResultResponse } from './popup-cache'
import { runActivePageDetection, saveTabDataAndBadge } from './detection'
import { loadDetectorSettings } from './detector-settings'

export const registerMessageRouter = () => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false

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
}
