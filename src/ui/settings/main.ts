import '@/ui/tokens.css'
import { createApp } from 'vue'
import { initTheme } from '@/utils/theme'
import Settings from './Settings.vue'

initTheme()
createApp(Settings).mount('#app')
