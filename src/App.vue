<script setup>
import { ref } from 'vue'
import { THEME_LIST, getCurrentTheme, setTheme } from '@/styles/theme'

const currentTheme = ref(getCurrentTheme())

const handleThemeChange = (themeKey) => {
  setTheme(themeKey)
  currentTheme.value = themeKey
}
</script>

<template>
  <div class="p-6 min-h-screen bg-bg-page">
    <div class="flex-between mb-4">
      <h1 class="text-text-primary" style="font-size: var(--font-size-h2)">
        inspectioncloudfe-v2 全局样式验证
      </h1>
      <el-radio-group :model-value="currentTheme" @change="handleThemeChange">
        <el-radio-button v-for="item in THEME_LIST" :key="item.key" :value="item.key">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="flex items-center gap-3">
      <el-button type="primary">主要按钮</el-button>
      <el-button type="success">成功按钮</el-button>
      <el-button type="warning">警告按钮</el-button>
      <el-button type="danger">危险按钮</el-button>
    </div>

    <p class="mt-4 text-text-secondary ellipsis">
      本区域用于验证 Less 主题变量、Element Plus 变量对齐、UnoCSS 工具类是否生效。
    </p>
  </div>
</template>

<style scoped lang="less">
.app-container {
  padding: 24px;
  min-height: 100vh;
  background-color: var(--color-primary-hover);
  border: 1px solid var(--color-border);
}
</style>