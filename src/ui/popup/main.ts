import '@/ui/tokens.css'
import { createApp } from 'vue'
import { initTheme } from '@/utils/theme'
import Popup from './Popup.vue'

initTheme()
createApp(Popup).mount('#app')
