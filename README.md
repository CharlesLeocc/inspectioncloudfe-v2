# inspectioncloudfe-v2

inspectioncloudfe-v2 是基于 Vue 3 与 Vite 构建的前端项目，当前采用 JavaScript、Element Plus、UnoCSS 和 Less。项目通过设计变量同步、脚本与样式检查约束基础开发质量，并将 AI 协作规则集中维护在根目录 `ai-rules/` 中。

## 技术栈

- Vue 3
- Vite
- JavaScript
- Element Plus
- UnoCSS
- Less
- ESLint、Stylelint、Prettier

## 当前目录结构

```text
inspectioncloudfe-v2/
├─ ai-rules/                         AI 专项规则
│  ├─ frontend-foundation.md         前端基础能力、模块边界与依赖准入规范
│  ├─ interaction-safety.md          数据防丢失、异步竞态与交互安全规范
│  └─ webgl-lifecycle.md             WebGL 生命周期、资源释放与性能规范
├─ public/                           不经过构建处理的公共静态资源
├─ scripts/                          设计变量同步与颜色映射生成脚本
├─ src/
│  ├─ assets/                        由 Vite 处理的静态资源
│  ├─ styles/
│  │  ├─ element/                    Element Plus 主题变量桥接
│  │  ├─ generated/                  自动生成的设计变量与主题文件
│  │  ├─ theme/                      应用主题切换逻辑
│  │  ├─ index.less                  全局样式入口
│  │  ├─ mixins.less                 全局注入的 Less mixin
│  │  └─ reset.less                  基础样式重置
│  ├─ utils/                         无状态、无生命周期的纯工具函数
│  ├─ App.vue                        根组件
│  └─ main.js                        应用入口
├─ stylelint-rules/                  项目自定义 Stylelint 规则与颜色映射
├─ AGENTS.md                         项目级 Agent 规则入口
├─ eslint.config.js                  ESLint 配置
├─ uno.config.js                     UnoCSS 配置
├─ vite.config.js                    Vite 配置
└─ package.json                      依赖与项目命令
```

随着业务能力落地，`src/` 按 `ai-rules/frontend-foundation.md` 中的推荐边界扩展 `api/`、`components/`、`composables/`、`router/`、`services/`、`stores/`、`views/` 等目录；未实际使用的目录不提前创建。

## 常用命令

```bash
# 启动开发环境，启动前自动校验设计变量
npm run dev

# 构建生产产物，构建前自动校验设计变量
npm run build

# 从源文件同步设计变量与主题产物
npm run tokens:sync

# 校验设计变量生成产物是否为最新状态
npm run tokens:validate

# 检查 JavaScript 和 Vue 代码
npm run lint:script

# 检查 CSS、Less 和 Vue 样式
npm run lint:style
```

## AI 规则入口

项目级强制规则从 `AGENTS.md` 进入。处理基础架构、交互安全或 WebGL 相关任务时，继续阅读 `ai-rules/` 下对应的专项规范。

`src/styles/generated/` 为自动生成目录，不应直接手工修改；设计变量变更应修改源数据或同步脚本后执行 `npm run tokens:sync`。
