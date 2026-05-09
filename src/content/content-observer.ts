// @ts-nocheck
;(() => {
  const MAX_ITEMS = 300
  const MAX_DOM_MARKERS = 120
  const SEND_DELAY = 900
  const CONTEXT_INVALIDATED_PATTERN = /extension context invalidated|context invalidated/i
  const OBSERVER_INSTANCE_KEY = '__stackPrismContentObserver__'
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
  let originalPushState = null
  let originalReplaceState = null
  let wrappedPushState = null
  let wrappedReplaceState = null
  let pendingMutationNodes = []
  let pendingMutationFrame = 0

  // ----- 底层 helper -----

  const trimList = (list, max) => {
    if (list.length > max) {
      list.splice(0, list.length - max)
    }
  }

  const isExtensionContextInvalidated = error => CONTEXT_INVALIDATED_PATTERN.test(String(error?.message || error))

  const getRuntimeLastError = () => {
    try {
      return chrome?.runtime?.lastError || null
    } catch (error) {
      return error
    }
  }

  const addUrl = (key, value) => {
    if (!value) return false
    const normalized = String(value)
    if (!normalized || state[key].includes(normalized)) return false
    state[key].push(normalized)
    trimList(state[key], MAX_ITEMS)
    return true
  }

  const addFeedLink = (href, type, title) => {
    if (!href || state.feedLinks.some(link => link.href === href)) return false
    state.feedLinks.push({ href, type, title })
    trimList(state.feedLinks, 60)
    return true
  }

  const addDomMarker = marker => {
    if (!marker || state.domMarkers.includes(marker)) return false
    state.domMarkers.push(marker)
    trimList(state.domMarkers, MAX_DOM_MARKERS)
    return true
  }

  // ----- 静态快照采集 -----

  const collectScripts = root => {
    for (const script of root.scripts || []) {
      addUrl('scripts', script.src)
      addUrl('resources', script.src)
    }
  }

  const collectStylesheets = root => {
    for (const link of root.querySelectorAll?.("link[rel~='stylesheet'], link[as='style']") || []) {
      addUrl('stylesheets', link.href)
      addUrl('resources', link.href)
    }
  }

  const collectIframes = root => {
    for (const frame of root.querySelectorAll?.('iframe[src]') || []) {
      addUrl('iframes', frame.src)
      addUrl('resources', frame.src)
    }
  }

  const collectFeedLinks = root => {
    for (const link of root.querySelectorAll?.("link[rel~='alternate']") || []) {
      const href = link.href || link.getAttribute('href')
      const type = String(link.type || '').toLowerCase()
      if (href && /rss|atom|feed|json/.test(`${type} ${href}`.toLowerCase())) {
        addFeedLink(href, type, link.title || '')
      }
    }
  }

  const collectPerformanceResources = () => {
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        addUrl('resources', entry.name)
      }
    } catch {
      return
    }
  }

  const collectStaticSnapshot = () => {
    collectScripts(document)
    collectStylesheets(document)
    collectIframes(document)
    collectFeedLinks(document)
    collectPerformanceResources()
  }

  // ----- 元素动态采集 -----

  const collectDomMarker = element => {
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

  const collectElementIfRelevant = element => {
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

  const SUBTREE_SCAN_LIMIT = 200
  const SUBTREE_SELECTOR = 'script[src], link[href], iframe[src], [id], [class], [data-v-app], [ng-version], astro-island, astro-slot'

  const collectFromElement = element => {
    let changed = false
    changed = collectElementIfRelevant(element) || changed
    if (!element.querySelectorAll || !element.childElementCount) return changed
    const matches = element.querySelectorAll(SUBTREE_SELECTOR)
    const limit = matches.length < SUBTREE_SCAN_LIMIT ? matches.length : SUBTREE_SCAN_LIMIT
    for (let i = 0; i < limit; i++) {
      changed = collectElementIfRelevant(matches[i]) || changed
    }
    return changed
  }

  // ----- 生命周期与发送（互相递归调用，运行时已就绪） -----

  const getRuntime = () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || typeof chrome.runtime.sendMessage !== 'function') {
        return null
      }
      return chrome.runtime
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        stopObserver({ keepErrorGuards: true })
      }
      return null
    }
  }

  const handleSendFailure = error => {
    if (isExtensionContextInvalidated(error)) {
      stopObserver({ keepErrorGuards: true })
    }
  }

  const sendSnapshot = () => {
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

  const scheduleSend = () => {
    if (stopped || !getRuntime()) {
      stopObserver()
      return
    }
    clearTimeout(sendTimer)
    sendTimer = setTimeout(sendSnapshot, SEND_DELAY)
  }

  const handleUrlChange = () => {
    if (stopped) return
    setTimeout(() => {
      if (stopped) return
      if (state.url !== location.href) {
        state.url = location.href
        state.title = document.title
        collectStaticSnapshot()
        addDomMarker(`route:${location.pathname}${location.search}`)
        scheduleSend()
      }
    }, 60)
  }

  const handleGlobalError = event => {
    if (!isExtensionContextInvalidated(event.error || event.message)) return
    event.preventDefault()
    if (!getRuntime()) {
      stopObserver({ keepErrorGuards: true })
    }
  }

  const handleUnhandledRejection = event => {
    if (!isExtensionContextInvalidated(event.reason)) return
    event.preventDefault()
    if (!getRuntime()) {
      stopObserver({ keepErrorGuards: true })
    }
  }

  const stopObserver = (options = {}) => {
    const keepErrorGuards = Boolean(options?.keepErrorGuards)
    stopped = true
    clearTimeout(sendTimer)
    if (pendingMutationFrame) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingMutationFrame)
      } else {
        clearTimeout(pendingMutationFrame)
      }
      pendingMutationFrame = 0
    }
    pendingMutationNodes = []
    if (navigationInterval) {
      window.clearInterval(navigationInterval)
      navigationInterval = 0
    }
    window.removeEventListener('popstate', handleUrlChange)
    if (history.pushState === wrappedPushState && originalPushState) {
      history.pushState = originalPushState
    }
    if (history.replaceState === wrappedReplaceState && originalReplaceState) {
      history.replaceState = originalReplaceState
    }
    if (!keepErrorGuards) {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
    performanceObserver?.disconnect?.()
    mutationObserver?.disconnect?.()
    try {
      if (window[OBSERVER_INSTANCE_KEY]?.stop === stopObserver) {
        delete window[OBSERVER_INSTANCE_KEY]
      }
    } catch {
      return
    }
  }

  // ----- 安装观察器 -----

  const replacePreviousObserver = () => {
    try {
      const previous = window[OBSERVER_INSTANCE_KEY]
      if (previous && typeof previous.stop === 'function') {
        previous.stop()
      }
    } catch {
      return
    }
  }

  const registerCurrentObserver = () => {
    try {
      window[OBSERVER_INSTANCE_KEY] = {
        stop: stopObserver
      }
    } catch {
      return
    }
  }

  const installPerformanceObserver = () => {
    if (!('PerformanceObserver' in window)) return
    try {
      const observer = new PerformanceObserver(list => {
        if (stopped) return
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

  const processPendingMutationNodes = () => {
    pendingMutationFrame = 0
    if (stopped) return
    const nodes = pendingMutationNodes
    pendingMutationNodes = []
    if (!nodes.length) return
    const processed = []
    let changed = false
    for (const node of nodes) {
      if (!node.isConnected) continue
      let containedByAncestor = false
      for (let i = 0; i < processed.length; i++) {
        if (processed[i].contains(node)) {
          containedByAncestor = true
          break
        }
      }
      if (containedByAncestor) continue
      processed.push(node)
      changed = collectFromElement(node) || changed
    }
    if (changed) {
      state.updatedAt = Date.now()
      scheduleSend()
    }
  }

  const scheduleMutationFlush = () => {
    if (pendingMutationFrame || stopped) return
    if (typeof requestAnimationFrame === 'function') {
      pendingMutationFrame = requestAnimationFrame(processPendingMutationNodes)
    } else {
      pendingMutationFrame = setTimeout(processPendingMutationNodes, 16)
    }
  }

  const installMutationObserver = () => {
    const root = document.documentElement || document
    const observer = new MutationObserver(mutations => {
      if (stopped) return
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          state.mutationCount += 1
          pendingMutationNodes.push(node)
        }
      }
      if (pendingMutationNodes.length) scheduleMutationFlush()
    })
    mutationObserver = observer
    observer.observe(root, { childList: true, subtree: true })
  }

  const installNavigationObserver = () => {
    originalPushState = history.pushState
    originalReplaceState = history.replaceState

    wrappedPushState = function pushState(...args) {
      const result = originalPushState.apply(this, args)
      handleUrlChange()
      return result
    }
    wrappedReplaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args)
      handleUrlChange()
      return result
    }
    history.pushState = wrappedPushState
    history.replaceState = wrappedReplaceState
    window.addEventListener('popstate', handleUrlChange)
    navigationInterval = window.setInterval(handleUrlChange, 1200)
  }

  const installContextInvalidationGuards = () => {
    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
  }

  // ----- 主程序 -----

  installContextInvalidationGuards()
  if (!getRuntime()) {
    stopObserver()
    return
  }

  try {
    replacePreviousObserver()
    registerCurrentObserver()
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
    stopObserver({ keepErrorGuards: true })
  }
})()
