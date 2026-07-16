const fs = require('node:fs')
const {
  COLOR_MAP_FILE,
  TOKEN_CSS_FILE,
  generateColorMap,
  parseTokenCss,
  serializeColorMap,
  validateTokenCss,
} = require('./token-css-utils.cjs')

function generateColorMapFile(tokenFile = TOKEN_CSS_FILE) {
  if (!fs.existsSync(tokenFile)) {
    throw new Error(`找不到生成的 Token 文件：${tokenFile}`)
  }

  const root = parseTokenCss(fs.readFileSync(tokenFile, 'utf-8'), tokenFile)
  const validation = validateTokenCss(root)

  if (validation.errors.length) {
    throw new Error(
      `Token 文件校验失败：\n${validation.errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }

  const colorMap = generateColorMap(validation)
  fs.writeFileSync(COLOR_MAP_FILE, serializeColorMap(colorMap), 'utf-8')
  console.log(`[tokens:color-map] 已生成 ${Object.keys(colorMap).length} 项颜色映射`)
  return colorMap
}

if (require.main === module) {
  try {
    generateColorMapFile()
  } catch (error) {
    console.error(`[tokens:color-map] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { generateColorMapFile }
