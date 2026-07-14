// ==========================================================================
// 从 src/styles/tokens/color.less 生成 hex 色值 -> CSS 变量名 的映射表
// 供 stylelint 自定义规则（stylelint-rules/no-hardcoded-color.cjs）读取使用
//
// 映射规则：token 文件里的 @color-primary: #165dff;
//          对应 theme 层输出的 CSS 变量 --color-primary
//          （两者变量名后缀完全一致，只是前缀 @ 换成 --，详见 src/styles/theme/light.less）
//
// 用法：npm run gen:color-map（token 颜色变化后需要重新生成一次）
// ==========================================================================

const fs = require('node:fs')
const path = require('node:path')

const TOKEN_FILE = path.resolve(__dirname, '../src/styles/tokens/color.less')
const OUTPUT_FILE = path.resolve(__dirname, '../stylelint-rules/color-map.json')

const content = fs.readFileSync(TOKEN_FILE, 'utf-8')

// 匹配形如：@color-primary: #165dff;  或  @color-bg-mask: rgba(0, 0, 0, 0.5);
const declarationReg = /@([\w-]+):\s*([^;]+);/g

const colorMap = {}
let match

while ((match = declarationReg.exec(content))) {
  const [, name, rawValue] = match
  const value = rawValue.trim().toLowerCase()

  // 只收录颜色值（hex 或 rgb/rgba），跳过对其他变量的引用（如 @font-family-base 之类非颜色 token 不会出现在本文件，这里做兜底）
  const isHex = /^#([0-9a-f]{3,8})$/i.test(value)
  const isRgb = /^rgba?\(/i.test(value)
  if (!isHex && !isRgb) continue

  colorMap[value] = `--${name}`
}

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(colorMap, null, 2) + '\n', 'utf-8')

console.log(`[gen:color-map] 已生成 ${Object.keys(colorMap).length} 条色值映射 -> ${OUTPUT_FILE}`)
