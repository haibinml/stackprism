// @ts-nocheck

import { loadStackPrismRules } from './rule-loader'
import { normalizeSettings } from '@/utils/normalize-settings'

export const SETTINGS_STORAGE_KEY = 'stackPrismSettings'

let techRulesPromise: Promise<any> | null = null
let detectorSettingsPromise: Promise<any> | null = null
let detectorSettingsCache: any = null

export async function loadTechRules() {
  if (!techRulesPromise) {
    techRulesPromise = loadStackPrismRules().catch(() => {
      techRulesPromise = null
      return {}
    })
  }
  return techRulesPromise
}

export async function loadDetectorSettings() {
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

export function applyDetectorSettingsUpdate(rawValue: unknown) {
  detectorSettingsCache = normalizeSettings(rawValue)
  detectorSettingsPromise = Promise.resolve(detectorSettingsCache)
  return detectorSettingsCache
}

export function buildEffectivePageRules(pageRules: any, settings: any) {
  return {
    ...pageRules,
    customRules: settings?.customRules || []
  }
}
