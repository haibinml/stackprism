(() => {
  const MAX_ITEMS = 300
  const MAX_DOM_MARKERS = 120
  const SEND_DELAY = 900
  const CONTEXT_INVALIDATED_PATTERN = /extension context invalidated|context invalidated/i
  const state = {
    startedAt: Date.now(),
    updatedAt: Date.now(),
    url: location.href,
    title: document.title,
    resources: [],
    scripts: [],
    stylesheets: [],
    iframes: [],
    feedLinks: [],
    domMarkers: [],
    mutationCount: 0,
    resourceCount: 0
  }
  let sendTimer = 0
  let stopped = false
  let performanceObserver = null
  let mutationObserver = null
  let navigationInterval = 0

  if (!getRuntime()) {
    return
  }

  try {
    window.addEventListener('pagehide', stopObserver, { once: true })
    collectStaticSnapshot()
    installPerformanceObserver()
    installMutationObserver()
    installNavigationObserver()
    scheduleSend()
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      throw error
    }
    stopObserver()
  }

  function collectStaticSnapshot() {
    collectScripts(document)
    collectStylesheets(document)
    collectIframes(document)
    collectFeedLinks(document)
    collectPerformanceResources()
  }

  function installPerformanceObserver() {
    if (!('PerformanceObserver' in window)) {
      return
    }
    try {
      const observer = new PerformanceObserver(list => {
        if (stopped) {
          return
        }
        for (const entry of list.getEntries()) {
          addUrl('resources', entry.name)
          state.resourceCount += 1
        }
        scheduleSend()
      })
      performanceObserver = observer
      observer.observe({ type: 'resource', buffered: true })
    } catch {
      collectPerformanceResources()
    }
  }

  function installMutationObserver() {
    const root = document.documentElement || document
    const observer = new MutationObserver(mutations => {
      if (stopped) {
        return
      }
      let changed = false
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue
          }
          state.mutationCount += 1
          changed = collectFromElement(node) || changed
        }
      }
      if (changed) {
        state.updatedAt = Date.now()
        scheduleSend()
      }
    })
    mutationObserver = observer
    observer.observe(root, { childList: true, subtree: true })
  }

  function installNavigationObserver() {
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args)
      handleUrlChange()
      return result
    }
    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args)
      handleUrlChange()
      return result
    }
    window.addEventListener('popstate', handleUrlChange)
    navigationInterval = window.setInterval(handleUrlChange, 1200)
  }

  function handleUrlChange() {
    if (stopped) {
      return
    }
    setTimeout(() => {
      if (stopped) {
        return
      }
      if (state.url !== location.href) {
        state.url = location.href
        state.title = document.title
        collectStaticSnapshot()
        addDomMarker(`route:${location.pathname}${location.search}`)
        scheduleSend()
      }
    }, 60)
  }

  function collectFromElement(element) {
    let changed = false
    changed = collectElementIfRelevant(element) || changed
    for (const node of element.querySelectorAll?.('script[src], link[href], iframe[src], [id], [class], [data-v-app], [ng-version], astro-island, astro-slot') || []) {
      changed = collectElementIfRelevant(node) || changed
    }
    return changed
  }

  function collectElementIfRelevant(element) {
    const tagName = element.tagName?.toLowerCase()
    let changed = false
    if (tagName === 'script') {
      changed = addUrl('scripts', element.src) || changed
      changed = addUrl('resources', element.src) || changed
    } else if (tagName === 'link') {
      const href = element.href || element.getAttribute('href')
      const rel = String(element.rel || element.getAttribute('rel') || '').toLowerCase()
      const type = String(element.type || '').toLowerCase()
      if (rel.includes('stylesheet') || element.as === 'style') {
        changed = addUrl('stylesheets', href) || changed
        changed = addUrl('resources', href) || changed
      }
      if (rel.includes('alternate') && /rss|atom|feed|json/.test(`${type} ${href}`.toLowerCase())) {
        changed = addFeedLink(href, type, element.title || '') || changed
      }
    } else if (tagName === 'iframe') {
      changed = addUrl('iframes', element.src) || changed
      changed = addUrl('resources', element.src) || changed
    }

    changed = collectDomMarker(element) || changed
    return changed
  }

  function collectDomMarker(element) {
    const markers = []
    const id = element.id ? `#${element.id}` : ''
    const className = typeof element.className === 'string' ? element.className : element.getAttribute?.('class') || ''
    const attrs = ['data-v-app', 'ng-version', 'data-reactroot', 'data-turbo', 'data-controller']
      .filter(name => element.hasAttribute?.(name))
      .map(name => `[${name}${element.getAttribute(name) ? `=${element.getAttribute(name)}` : ''}]`)

    if (id) {
      markers.push(id)
    }
    if (className) {
      const selectedClasses = className
        .split(/\s+/)
        .filter(token => /^(ant-|Mui|chakra-|el-|v-|svelte-|astro-|q-|van-|layui-|weui-|uk-|bp\d-|cds--|dx-|p-|tdesign-|arco-)/.test(token))
        .slice(0, 8)
      markers.push(...selectedClasses.map(token => `.${token}`))
    }
    markers.push(...attrs)

    let changed = false
    for (const marker of markers) {
      changed = addDomMarker(marker) || changed
    }
    return changed
  }

  function collectScripts(root) {
    for (const script of root.scripts || []) {
      addUrl('scripts', script.src)
      addUrl('resources', script.src)
    }
  }

  function collectStylesheets(root) {
    for (const link of root.querySelectorAll?.("link[rel~='stylesheet'], link[as='style']") || []) {
      addUrl('stylesheets', link.href)
      addUrl('resources', link.href)
    }
  }

  function collectIframes(root) {
    for (const frame of root.querySelectorAll?.('iframe[src]') || []) {
      addUrl('iframes', frame.src)
      addUrl('resources', frame.src)
    }
  }

  function collectFeedLinks(root) {
    for (const link of root.querySelectorAll?.("link[rel~='alternate']") || []) {
      const href = link.href || link.getAttribute('href')
      const type = String(link.type || '').toLowerCase()
      if (href && /rss|atom|feed|json/.test(`${type} ${href}`.toLowerCase())) {
        addFeedLink(href, type, link.title || '')
      }
    }
  }

  function collectPerformanceResources() {
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        addUrl('resources', entry.name)
      }
    } catch {
      return
    }
  }

  function addUrl(key, value) {
    if (!value) {
      return false
    }
    const normalized = String(value)
    if (!normalized || state[key].includes(normalized)) {
      return false
    }
    state[key].push(normalized)
    trimList(state[key], MAX_ITEMS)
    return true
  }

  function addFeedLink(href, type, title) {
    if (!href || state.feedLinks.some(link => link.href === href)) {
      return false
    }
    state.feedLinks.push({ href, type, title })
    trimList(state.feedLinks, 60)
    return true
  }

  function addDomMarker(marker) {
    if (!marker || state.domMarkers.includes(marker)) {
      return false
    }
    state.domMarkers.push(marker)
    trimList(state.domMarkers, MAX_DOM_MARKERS)
    return true
  }

  function trimList(list, max) {
    if (list.length > max) {
      list.splice(0, list.length - max)
    }
  }

  function scheduleSend() {
    if (stopped || !getRuntime()) {
      stopObserver()
      return
    }
    clearTimeout(sendTimer)
    sendTimer = setTimeout(sendSnapshot, SEND_DELAY)
  }

  function sendSnapshot() {
    const runtime = getRuntime()
    if (stopped || !runtime) {
      stopObserver()
      return
    }
    state.updatedAt = Date.now()
    state.title = document.title
    const snapshot = {
      ...state,
      resources: [...state.resources],
      scripts: [...state.scripts],
      stylesheets: [...state.stylesheets],
      iframes: [...state.iframes],
      feedLinks: state.feedLinks.map(link => ({ ...link })),
      domMarkers: [...state.domMarkers]
    }
    try {
      runtime.sendMessage({ type: 'DYNAMIC_PAGE_SNAPSHOT', snapshot }, () => {
        const error = getRuntimeLastError()
        if (error) {
          handleSendFailure(error)
        }
      })
    } catch (error) {
      handleSendFailure(error)
    }
  }

  function handleSendFailure(error) {
    if (isExtensionContextInvalidated(error)) {
      stopObserver()
    }
  }

  function isExtensionContextInvalidated(error) {
    return CONTEXT_INVALIDATED_PATTERN.test(String(error?.message || error))
  }

  function getRuntime() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || typeof chrome.runtime.sendMessage !== 'function') {
        return null
      }
      return chrome.runtime
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        stopObserver()
      }
      return null
    }
  }

  function getRuntimeLastError() {
    try {
      return chrome?.runtime?.lastError || null
    } catch (error) {
      return error
    }
  }

  function stopObserver() {
    stopped = true
    clearTimeout(sendTimer)
    if (navigationInterval) {
      window.clearInterval(navigationInterval)
      navigationInterval = 0
    }
    performanceObserver?.disconnect?.()
    mutationObserver?.disconnect?.()
  }
})()
