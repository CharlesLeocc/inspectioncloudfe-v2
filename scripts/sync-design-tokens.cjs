const fs = require('node:fs')
const path = require('node:path')
const {
  COLOR_MAP_FILE,
  GENERATED_DIR,
  THEME_MANIFEST_FILE,
  TOKEN_CSS_FILE,
  generateColorMap,
  parseTokenCss,
  serializeColorMap,
  serializeThemeManifest,
  validateTokenCss,
} = require('./token-css-utils.cjs')

function assertValid(validation, sourceFile) {
  if (!validation.errors.length) return

  const details = validation.errors.map((error) => `  - ${error}`).join('\n')
  throw new Error(`Token 文件校验失败：${sourceFile}\n${details}`)
}

function normalizeCss(root) {
  return `${root.toString().replace(/\r\n/g, '\n').trimEnd()}\n`
}

function assertGeneratedFile(file, expected) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少生成文件：${file}，请先执行 npm run tokens:sync -- <导出文件>`)
  }

  const actual = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  if (actual !== expected) {
    throw new Error(`生成文件已过期：${file}，请重新执行 Token 同步命令`)
  }
}

function run() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const positionalArgs = args.filter((arg) => !arg.startsWith('--'))
  const sourceFile = checkOnly
    ? TOKEN_CSS_FILE
    : positionalArgs[0]
      ? path.resolve(positionalArgs[0])
      : null

  if (!sourceFile) {
    throw new Error('缺少 MasterGo CSS 文件路径。用法：npm run tokens:sync -- <文件路径>')
  }
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`找不到 Token 文件：${sourceFile}`)
  }

  const root = parseTokenCss(fs.readFileSync(sourceFile, 'utf-8'), sourceFile)
  const validation = validateTokenCss(root)
  assertValid(validation, sourceFile)

  const tokenCss = normalizeCss(root)
  const themeManifest = serializeThemeManifest(validation.themes)
  const colorMap = serializeColorMap(generateColorMap(validation))

  if (checkOnly) {
    assertGeneratedFile(THEME_MANIFEST_FILE, themeManifest)
    assertGeneratedFile(COLOR_MAP_FILE, colorMap)
  } else {
    fs.mkdirSync(GENERATED_DIR, { recursive: true })
    fs.writeFileSync(TOKEN_CSS_FILE, tokenCss, 'utf-8')
    fs.writeFileSync(THEME_MANIFEST_FILE, themeManifest, 'utf-8')
    fs.writeFileSync(COLOR_MAP_FILE, colorMap, 'utf-8')
  }

  const themeNames = validation.themes.map((theme) => theme.key).join('、') || '默认'
  const action = checkOnly ? '校验通过' : '同步完成'
  console.log(
    `[tokens] ${action}：${validation.rootProperties.size} 个变量，主题：${themeNames}，颜色映射：${Object.keys(generateColorMap(validation)).length} 项`,
  )
}

try {
  run()
} catch (error) {
  console.error(`[tokens] ${error.message}`)
  process.exitCode = 1
}
