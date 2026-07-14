import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'stylelint-rules/color-map.json'],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // 浏览器端源码（src/**）
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  // Node 端脚本 / 配置文件（CommonJS）
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  // Node 端配置文件（ESM）
  {
    files: ['*.config.js', 'vite.config.js', 'uno.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // 关闭与 Prettier 冲突的格式类规则，格式统一交给 Prettier
  eslintConfigPrettier,
]
