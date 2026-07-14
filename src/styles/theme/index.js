// ==========================================================================
// 主题注册与切换
//
// 扩展新主题步骤：
// 1. 在 src/styles/theme/ 下新增 <themeKey>.less，选择器写成 [data-theme='<themeKey>']，
//    并补齐 light.less 中声明的全部 CSS 变量（主题契约）
// 2. 在下方 THEME_LIST 中注册该主题的 key / label
// 3. 在 src/styles/index.less 中 @import 该文件
// 无需修改任何业务组件代码，主题即可通过 setTheme 生效
// ==========================================================================

export const THEME_STORAGE_KEY = 'app-theme'

export const THEME_LIST = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

const DEFAULT_THEME = 'light'

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
