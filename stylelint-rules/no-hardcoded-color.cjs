const fs = require('node:fs')
const path = require('node:path')
const stylelint = require('stylelint')
const { normalizeColor } = require('../scripts/token-css-utils.cjs')

const ruleName = 'custom/no-hardcoded-color'
const COLOR_MAP_PATH = path.resolve(__dirname, './color-map.json')
const COLOR_TOKEN_REG = /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)/gi

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (value, variableName) =>
    `硬编码色值 "${value}" 已唯一匹配 ${variableName}，请使用 var(${variableName})（可自动修复）`,
  ambiguous: (value, variableNames) =>
    `硬编码色值 "${value}" 对应多个设计变量：${variableNames.join('、')}，请按语义手动选择`,
  unknown: (value) =>
    `硬编码色值 "${value}" 未在生成的设计变量中找到，请新增 Token 或改用已有 CSS 变量`,
})

function loadColorMap() {
  try {
    return JSON.parse(fs.readFileSync(COLOR_MAP_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

module.exports = stylelint.createPlugin(ruleName, (enabled, _options, context) => {
  return (root, result) => {
    if (!enabled) return

    const colorMap = loadColorMap()

    root.walkDecls((declaration) => {
      const matches = declaration.value.match(COLOR_TOKEN_REG)
      if (!matches) return

      let fixedValue = declaration.value

      matches.forEach((rawColor) => {
        const candidates = colorMap[normalizeColor(rawColor)] || []

        if (candidates.length === 1) {
          if (context.fix) {
            fixedValue = fixedValue.replace(rawColor, `var(${candidates[0]})`)
          } else {
            stylelint.utils.report({
              message: messages.rejected(rawColor, candidates[0]),
              node: declaration,
              result,
              ruleName,
            })
          }
          return
        }

        stylelint.utils.report({
          message:
            candidates.length > 1
              ? messages.ambiguous(rawColor, candidates)
              : messages.unknown(rawColor),
          node: declaration,
          result,
          ruleName,
        })
      })

      if (context.fix && fixedValue !== declaration.value) {
        declaration.value = fixedValue
      }
    })
  }
})

module.exports.ruleName = ruleName
module.exports.messages = messages
