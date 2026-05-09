const canInjectContentObserver = (tab: chrome.tabs.Tab): boolean =>
  typeof tab?.id === 'number' && /^https?:\/\//i.test(String(tab.url || ''))

export const injectContentObserver = async (tabId: number): Promise<void> => {
  const observerFile = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0]
  if (!observerFile) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [observerFile]
    })
  } catch {
    return
  }
}

export const injectContentObserverIntoOpenTabs = async (): Promise<void> => {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.allSettled(tabs.filter(canInjectContentObserver).map(tab => injectContentObserver(tab.id!)))
  } catch {
    return
  }
}
