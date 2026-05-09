export async function injectContentObserverIntoOpenTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.allSettled(tabs.filter(canInjectContentObserver).map(tab => injectContentObserver(tab.id!)))
  } catch {
    return
  }
}

function canInjectContentObserver(tab: chrome.tabs.Tab): boolean {
  return typeof tab?.id === 'number' && /^https?:\/\//i.test(String(tab.url || ''))
}

export async function injectContentObserver(tabId: number): Promise<void> {
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
