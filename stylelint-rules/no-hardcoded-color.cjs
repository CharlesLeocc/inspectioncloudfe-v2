// ==========================================================================
// 自定义 Stylelint 规则：禁止硬编码色值，强制使用项目 CSS 变量
//
// - 检测到 hex / rgb(a) 色值时：
//   1. 若能在 stylelint-rules/color-map.json 中精确匹配到对应变量，
//      运行 `stylelint --fix` 会自动替换为 var(--xxx)
//   2. 若找不到精确匹配，仅报警提示，需要人工确认是否要新增 token
//
// color-map.json 由 scripts/generate-color-map.cjs 生成，
// tokens/color.less 新增/修改颜色后需要重新执行一次生成脚本。
// ==========================================================================

const stylelint = require('stylelint')
const path = require('node:path')
const fs = require('node:fs')

const ruleName = 'custom/no-hardcoded-color'

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (value, varName) =>
    `硬编码色值 "${value}" 已在 token 中定义，请使用 var(${varName}) 替代（可运行 stylelint --fix 自动修复）`,
  unknown: (value) =>
    `硬编码色值 "${value}" 未在 tokens/color.less 中找到对应变量，请确认是否需要新增 token，或改用 var(--xxx)`,
})

const COLOR_MAP_PATH = path.resolve(__dirname, './color-map.json')

function loadColorMap() {
  try {
    return JSON.parse(fs.readFileSync(COLOR_MAP_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

// 归一化色值，便于跟 color-map.json 里的 key 做精确比较
// #FFF -> #ffffff，rgba( 0 , 0 , 0 , .5 ) -> rgba(0,0,0,.5)
function normalizeColor(raw) {
  const value = raw.trim().toLowerCase()

  if (/^#([0-9a-f]{3})$/.test(value)) {
    const [, hex3] = value.match(/^#([0-9a-f]{3})$/)
    return `#${[...hex3].map((c) => c + c).join('')}`
  }

  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(value)) {
    return value
  }

  if (/^rgba?\(/.test(value)) {
    return value.replace(/\s+/g, '')
  }

  return value
}

// 提取字符串中的所有色值片段（hex 或 rgb/rgba），保留原始文本用于替换
const COLOR_TOKEN_REG = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/gi

module.exports = stylelint.createPlugin(ruleName, (enabled, _options, context) => {
  return (root, result) => {
    if (!enabled) return

    const colorMap = loadColorMap()

    root.walkDecls((decl) => {
      // 已经是 var(...) 的声明不处理；忽略 currentColor / transparent / inherit 等关键字（不会被正则捕获）
      const matches = decl.value.match(COLOR_TOKEN_REG)
      if (!matches) return

      let fixedValue = decl.value
      let hasFix = false

      matches.forEach((rawColor) => {
        const normalized = normalizeColor(rawColor)
        const varName = colorMap[normalized]

        if (varName) {
          if (context.fix) {
            fixedValue = fixedValue.replace(rawColor, `var(${varName})`)
            hasFix = true
          } else {
            stylelint.utils.report({
              message: messages.rejected(rawColor, varName),
              node: decl,
              result,
              ruleName,
            })
          }
        } else {
          stylelint.utils.report({
            message: messages.unknown(rawColor),
            node: decl,
            result,
            ruleName,
          })
        }
      })

      if (context.fix && hasFix) {
        decl.value = fixedValue
      }
    })
  }
})

module.exports.ruleName = ruleName
module.exports.messages = messages
