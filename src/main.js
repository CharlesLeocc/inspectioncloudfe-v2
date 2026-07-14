import { createApp } from 'vue'
import '@/styles/index.less'
import App from './App.vue'
import { initTheme } from '@/styles/theme'

initTheme()

createApp(App).mount('#app')
