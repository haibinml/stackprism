const REPOSITORY_URL = 'https://github.com/setube/stackprism'

document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest?.().version
  const badge = document.getElementById('helpVersion')
  if (badge && version) {
    badge.textContent = `v${version}`
  }

  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })
  })

  document.getElementById('openRepoBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: REPOSITORY_URL })
  })
})
