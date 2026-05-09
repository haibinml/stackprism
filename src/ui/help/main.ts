import '@/ui/tokens.css'
import { createApp } from 'vue'
import { initTheme } from '@/utils/theme'
import Help from './Help.vue'

initTheme()
createApp(Help).mount('#app')
