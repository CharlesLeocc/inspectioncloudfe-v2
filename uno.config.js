import { defineConfig, presetAttributify, presetUno } from 'unocss'

// UnoCSS 配置：颜色语义化映射到项目 CSS 变量，保证与主题系统联动
export default defineConfig({
  presets: [presetUno(), presetAttributify()],
  theme: {
    colors: {
      primary: 'var(--color-primary)',
      'primary-hover': 'var(--color-primary-hover)',
      'primary-active': 'var(--color-primary-active)',
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      danger: 'var(--color-danger)',
      info: 'var(--color-info)',
      'text-primary': 'var(--color-text-primary)',
      'text-secondary': 'var(--color-text-secondary)',
      'text-tertiary': 'var(--color-text-tertiary)',
      border: 'var(--color-border)',
      'bg-page': 'var(--color-bg-page)',
      'bg-container': 'var(--color-bg-container)',
    },
  },
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    ellipsis: 'overflow-hidden whitespace-nowrap text-ellipsis',
  },
})
