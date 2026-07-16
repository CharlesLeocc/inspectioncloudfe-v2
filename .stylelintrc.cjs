module.exports = {
  extends: ['stylelint-config-standard'],
  plugins: ['./stylelint-rules/no-hardcoded-color.cjs'],
  rules: {
    'custom/no-hardcoded-color': true,
    // less 语法特有写法（mixin 调用、guard 表达式等）跟 standard 规则冲突，这里放宽
    'at-rule-no-unknown': null,
    'no-descending-specificity': null,
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'value-keyword-case': null,
  },
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/*.less'],
      customSyntax: 'postcss-less',
    },
  ],
  // 生成目录是 MasterGo 导出的只读产物，由 tokens:validate 单独校验
  ignoreFiles: ['**/node_modules/**', 'dist/**', 'src/styles/generated/**', 'scripts/**'],
}
