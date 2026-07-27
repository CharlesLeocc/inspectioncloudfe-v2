import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const mixinsPath = fileURLToPath(new URL('./src/styles/mixins.less', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      // Element Plus 当前仅提供 CSS / Sass 样式入口，使用默认 CSS 保持组件样式按需加载。
      resolvers: [ElementPlusResolver()],
    }),
  ],
  css: {
    preprocessorOptions: {
      less: {
        // 全局注入 mixins，业务 .less / <style lang="less"> 无需手动 @import
        additionalData: `@import "${mixinsPath.replace(/\\/g, '/')}";`,
        javascriptEnabled: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
