const path = require('node:path')
const postcss = require('postcss')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const GENERATED_DIR = path.join(PROJECT_ROOT, 'src/styles/generated')
const TOKEN_CSS_FILE = path.join(GENERATED_DIR, 'design-tokens.css')
const THEME_MANIFEST_FILE = path.join(GENERATED_DIR, 'themes.js')
const COLOR_MAP_FILE = path.join(PROJECT_ROOT, 'stylelint-rules/color-map.json')

const THEME_SELECTOR_REG = /^\[data-theme\s*=\s*(?:(["'])(.*?)\1|([^\]\s]+))\]$/
const COLOR_VALUE_REG = /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(.+\))$/i
const CSS_VAR_REFERENCE_REG = /var\(\s*(--[^\s,)]+)(?:\s*,[^)]*)?\)/g
const DIMENSION_TOKEN_NAME_REG = /(?:spacing|space|gap|padding|margin|间距)/i
const UNITLESS_NUMBER_REG = /^-?(?:\d+\.?\d*|\.\d+)$/

function parseTokenCss(content, from = TOKEN_CSS_FILE) {
  return postcss.parse(content, { from })
}

function getThemeKey(selector) {
  const match = selector.trim().match(THEME_SELECTOR_REG)
  return match ? match[2] || match[3] : null
}

function collectTokenRules(root) {
  const rootRules = []
  const themes = new Map()

  root.walkRules((rule) => {
    const selector = rule.selector.trim()

    if (selector === ':root') {
      rootRules.push(rule)
      return
    }

    const themeKey = getThemeKey(selector)
    if (themeKey !== null) {
      if (!themes.has(themeKey)) themes.set(themeKey, [])
      themes.get(themeKey).push(rule)
    }
  })

  return { rootRules, themes }
}

function collectCustomProperties(rule, scope, errors) {
  const properties = new Map()

  rule.each((node) => {
    if (node.type === 'comment') return

    if (node.type !== 'decl') {
      errors.push(`${scope} 中仅允许声明 CSS 自定义属性`)
      return
    }

    if (!node.prop.startsWith('--')) {
      errors.push(`${scope} 中存在非 CSS 自定义属性：${node.prop}`)
      return
    }

    if (properties.has(node.prop)) {
      errors.push(`${scope} 中重复声明变量：${node.prop}`)
      return
    }

    if (node.prop.startsWith('--el-')) {
      errors.push(`${scope} 中不允许定义 Element Plus 私有变量：${node.prop}`)
    }

    const value = node.value.trim()
    if (!value) {
      errors.push(`${scope} 中变量值为空：${node.prop}`)
    }

    if (
      DIMENSION_TOKEN_NAME_REG.test(node.prop) &&
      UNITLESS_NUMBER_REG.test(value) &&
      Number(value) !== 0
    ) {
      errors.push(`${scope} 中尺寸变量缺少单位：${node.prop}: ${value}`)
    }

    properties.set(node.prop, value)
  })

  return properties
}

function validateTokenCss(root) {
  const errors = []
  const headerComment = root.nodes.find(
    (node) => node.type === 'comment' && node.text.includes('由 MasterGo Variables 生成'),
  )

  if (!headerComment) {
    errors.push('缺少“由 MasterGo Variables 生成”文件头，无法确认输入来源')
  }

  root.each((node) => {
    if (node.type === 'comment') return
    if (node.type !== 'rule') {
      errors.push('Token 文件顶层仅允许 :root、[data-theme] 规则和注释')
      return
    }

    const selector = node.selector.trim()
    if (selector !== ':root' && getThemeKey(selector) === null) {
      errors.push(`不支持的选择器：${selector}`)
    }
  })

  const { rootRules, themes } = collectTokenRules(root)

  if (rootRules.length !== 1) {
    errors.push(`必须且只能存在一个 :root，当前数量为 ${rootRules.length}`)
  }

  themes.forEach((rules, themeKey) => {
    if (!themeKey) errors.push('data-theme 的主题名不能为空')
    if (rules.length > 1) errors.push(`主题“${themeKey}”被重复声明`)
  })

  const rootProperties = rootRules[0]
    ? collectCustomProperties(rootRules[0], ':root', errors)
    : new Map()

  if (rootProperties.size === 0) {
    errors.push(':root 中至少需要一个 CSS 自定义属性')
  }

  const themeEntries = []
  themes.forEach((rules, themeKey) => {
    const properties = collectCustomProperties(rules[0], `主题“${themeKey}”`, errors)
    const missing = [...rootProperties.keys()].filter((name) => !properties.has(name))
    const extra = [...properties.keys()].filter((name) => !rootProperties.has(name))

    if (missing.length) {
      errors.push(`主题“${themeKey}”缺少 ${missing.length} 个变量：${missing.join('、')}`)
    }
    if (extra.length) {
      errors.push(`主题“${themeKey}”多出 ${extra.length} 个变量：${extra.join('、')}`)
    }

    themeEntries.push({ key: themeKey, label: themeKey, rule: rules[0], properties })
  })

  const knownProperties = new Set(rootProperties.keys())
  root.walkDecls((declaration) => {
    CSS_VAR_REFERENCE_REG.lastIndex = 0
    let match
    while ((match = CSS_VAR_REFERENCE_REG.exec(declaration.value))) {
      if (!knownProperties.has(match[1])) {
        errors.push(`${declaration.prop} 引用了未定义变量：${match[1]}`)
      }
    }
  })

  return {
    errors,
    rootRule: rootRules[0] || null,
    rootProperties,
    themes: themeEntries,
  }
}

function normalizeColor(raw) {
  const value = raw.trim().toLowerCase()
  const shortHex = value.match(/^#([0-9a-f]{3,4})$/)

  if (shortHex) {
    return `#${[...shortHex[1]].map((character) => character.repeat(2)).join('')}`
  }

  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(value)) return value

  if (/^rgba?\(.+\)$/.test(value)) {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
      .replace(/\s*,\s*/g, ',')
      .replace(/\s*\/\s*/g, '/')
  }

  return value
}

function generateColorMap(validation) {
  const candidates = new Map()
  const rules = [validation.rootRule, ...validation.themes.map((theme) => theme.rule)].filter(
    Boolean,
  )

  rules.forEach((rule) => {
    rule.walkDecls(/^--/, (declaration) => {
      const rawValue = declaration.value.trim()
      if (!COLOR_VALUE_REG.test(rawValue) || declaration.prop.startsWith('--el-')) return

      const color = normalizeColor(rawValue)
      if (!candidates.has(color)) candidates.set(color, new Set())
      candidates.get(color).add(declaration.prop)
    })
  })

  return Object.fromEntries(
    [...candidates.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([color, names]) => [color, [...names].sort()]),
  )
}

function serializeColorMap(colorMap) {
  return `${JSON.stringify(colorMap, null, 2)}\n`
}

function serializeThemeManifest(themes) {
  const themeList = themes.length
    ? themes.map(({ key, label }) => ({ key, label }))
    : [{ key: 'default', label: '默认' }]
  const defaultTheme = themeList[0].key

  return `// 由 scripts/sync-design-tokens.cjs 自动生成，请勿直接修改。\n\nexport const THEME_LIST = Object.freeze(${JSON.stringify(themeList, null, 2)})\n\nexport const DEFAULT_THEME = ${JSON.stringify(defaultTheme)}\n`
}

module.exports = {
  COLOR_MAP_FILE,
  GENERATED_DIR,
  THEME_MANIFEST_FILE,
  TOKEN_CSS_FILE,
  generateColorMap,
  normalizeColor,
  parseTokenCss,
  serializeColorMap,
  serializeThemeManifest,
  validateTokenCss,
}
