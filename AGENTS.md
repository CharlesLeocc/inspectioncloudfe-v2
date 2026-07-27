# inspectioncloudfe-v2 项目级 Agent 规则

本文件只定义 inspectioncloudfe-v2 特有的项目约束，用于补充用户全局规范；不重复定义中文回复、通用修改边界、构建策略、安全原则、性能触发条件、OpenSpec 流程等全局规则。

如果本文件与用户当前任务中的明确要求冲突，以用户要求为准；如果与更高优先级的全局规则冲突，遵循更高优先级规则并说明差异。

## 一、专项规范入口

命中对应任务时，先阅读相关专项规范；同一任务命中多个场景时取所有文档的并集：

- 修改 HTTP、Router、Pinia、i18n、弹窗、存储、上传下载、基础组件、公共 composable 或新增依赖：阅读 `ai-rules/frontend-foundation.md`。
- 涉及表单编辑、标注、排序、多步骤配置、自动保存、删除、覆盖、上传、长任务、业务上下文切换或页面离开：阅读 `ai-rules/interaction-safety.md`。
- 涉及 Three.js、Cesium、WebGL、Canvas、ECharts、动画帧、GPU 资源、模型加载或高频指针事件：阅读 `ai-rules/webgl-lifecycle.md`。

文档职责如下：

- `AGENTS.md`：项目级强制入口和不可遗漏的底线。
- `frontend-foundation.md`：基础技术选型、目录边界和第三方依赖契约。
- `interaction-safety.md`：数据防丢失、异步竞态和交互一致性契约。
- `webgl-lifecycle.md`：可视化生命周期、渲染性能和 GPU 资源契约。

项目级规则与专项规范均需遵守。若专项规范与实际代码不一致，先确认当前运行行为，再说明差异；不得静默地用旧代码或文档覆盖另一方。

## 二、当前技术栈与基础选型

- 当前应用使用 Vue 3、Vite、JavaScript、Element Plus、UnoCSS 和 Less。
- HTTP 请求统一使用 Axios；页面和业务组件不得直接创建 Axios 实例，必须通过 `services/http` 和 `api/modules` 调用。
- 路由使用 Vue Router，全局共享状态使用 Pinia，国际化使用 Vue I18n，通用浏览器组合式能力优先使用 VueUse。
- Element Plus 保持自动按需导入，禁止在业务页面全量注册 Element Plus。
- 浏览器、Vue、Vite、Element Plus 和 VueUse 已能满足的能力，不得重复引入第三方插件。
- Three.js、Cesium、ECharts、GSAP、SortableJS、Dexie、虚拟列表和文档处理库只在真实业务需要时按模块或路由动态引入。

新增第三方依赖必须在改动说明中记录：现有能力为何不足、使用范围、按需加载方式、包体积影响、生命周期清理、许可证和替代方案。

## 三、项目模块边界

- `api/` 只定义业务接口，不弹消息、不跳转路由、不直接修改组件状态。
- `services/` 维护 Axios、存储、上传、下载、日志等跨业务基础设施。
- `composables/` 放置包含 Vue 响应式状态、监听器或生命周期的复用逻辑。
- `utils/` 只放无状态纯函数。
- `stores/` 只保存跨页面共享状态，不保存 DOM、第三方实例或完整 WebGL 场景树。
- `components/base/` 不依赖具体业务页面；业务组件不得反向成为基础组件依赖。
- 页面通过业务 API 模块访问后端，不直接调用 Axios、localStorage 或 IndexedDB。

## 四、不可遗漏的交互底线

- 存在未持久化的新增、编辑、排序、标注、配置或待上传数据时，必须使用统一脏数据守卫，覆盖路由离开、业务上下文切换、弹窗关闭和浏览器刷新/关闭。
- 统一脏数据能力的实现入口为 `src/composables/useUnsavedChangesGuard.js`；已存在时必须复用，不能在页面内复制另一套守卫。
- 提交、删除、导入、导出、上传和报告生成必须防重复触发，并在 `finally` 中恢复交互状态。
- 搜索、筛选、分页和上下文切换产生的旧请求必须取消，或通过请求 ID、上下文 ID 或版本号阻止旧响应写入新状态。
- 删除、覆盖、清空、重置和放弃未保存数据必须明确说明对象和影响后再确认。
- 用户可见文案、校验提示、错误提示和确认文案必须接入 Vue I18n。

具体实现和验证场景以 `ai-rules/interaction-safety.md` 为准。

## 五、WebGL 与高性能模块底线

- Three.js、Cesium、ECharts 等实例使用普通变量、`markRaw` 或 `shallowRef`，禁止放入深度响应式对象或 Pinia Store。
- 创建 Geometry、Material、Texture、RenderTarget、Controls、Loader、Renderer、Worker 或监听器的模块必须明确资源所有权和销毁责任。
- `KeepAlive` 停用时暂停可恢复的 RAF、轮询、动画、媒体和只服务于可见页面的监听；组件真正卸载时再取消任务并释放不可恢复资源。
- 同一场景默认只允许一个持续 RAF；静态场景优先按需渲染，高频事件使用 RAF 合帧、节流或防抖。
- 路由离开、页面隐藏、组件停用和资源切换时，必须阻止迟到的异步结果进入新场景。

具体资源释放矩阵、上下文丢失处理和验证场景以 `ai-rules/webgl-lifecycle.md` 为准。

## 六、项目样式与生成产物

- 正式全局样式的设计变量来源为 `src/styles/generated/design-tokens.css`，不得直接手工修改生成文件。
- 设计变量变更通过 `npm run tokens:sync`，提交前通过 `npm run tokens:validate` 校验。
- 正式全局样式不直接维护 `--el-*` 变量；Element Plus 变量桥接由 `src/styles/element/index.less` 处理。
- 颜色优先使用设计变量、UnoCSS 语义色或 Less mixin，避免重复定义同义变量。
- `mixins.less` 已通过 Vite `additionalData` 注入，业务 Less 不重复导入。
- `src/styles/generated/` 属于生成产物，修改源数据或同步脚本，不直接改生成结果。

## 七、项目级验证命令

涉及对应范围时优先使用以下命令：

```bash
npm run tokens:validate
npm run lint:script
npm run lint:style
```

基础架构、公共依赖、Vite 配置、跨模块契约或发布产物发生变化时，再根据任务风险执行 `npm run build`。
