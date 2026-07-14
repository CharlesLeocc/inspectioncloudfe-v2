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
    {
      // tokens/theme 是色值的定义层（token 的右值本身），不参与"禁止硬编码色值"检查
      files: ['**/styles/tokens/**', '**/styles/theme/**'],
      rules: {
        'custom/no-hardcoded-color': null,
      },
    },
  ],
  ignoreFiles: ['**/node_modules/**', 'dist/**'],
}
