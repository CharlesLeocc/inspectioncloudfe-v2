// ==========================================================================
// 主题注册与切换
// 主题清单由 Token 同步脚本从 [data-theme] 选择器自动生成。
// ==========================================================================

import { DEFAULT_THEME, THEME_LIST } from '../generated/themes.js'

export { THEME_LIST }

export const THEME_STORAGE_KEY = 'app-theme'

/**
 * 获取当前生效的主题 key
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME
}

/**
 * 应用指定主题，并持久化到 localStorage
 * @param {string} themeKey 主题 key，需已在 THEME_LIST 中注册
 */
export function setTheme(themeKey) {
  const valid = THEME_LIST.some((item) => item.key === themeKey)
  const nextTheme = valid ? themeKey : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', nextTheme)
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
}

/**
 * 应用启动时调用：读取上次持久化的主题（或默认主题）并生效
 */
export function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  setTheme(savedTheme || DEFAULT_THEME)
}
