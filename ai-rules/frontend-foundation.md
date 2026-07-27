# 前端基础架构规范

## 1. 目标

本规范定义 inspectioncloudfe-v2 的基础能力选型、模块边界和第三方依赖准入规则。目标是在保证业务开发效率的同时，避免重复能力、大型依赖常驻、隐式全局状态和难以追踪的资源生命周期。

基础能力遵循以下选型顺序：

1. 浏览器原生 API。
2. Vue 和 Vite 内置能力。
3. Element Plus。
4. VueUse。
5. 项目已有封装。
6. 专用第三方依赖。

第三方依赖不是禁止项，但必须由真实业务需求触发，并限制在最小消费范围内。

## 2. 核心技术栈

| 能力           | 统一方案               | 约束                             |
| -------------- | ---------------------- | -------------------------------- |
| 应用框架       | Vue 3 Composition API  | 新代码统一使用 `<script setup>`  |
| 构建工具       | Vite                   | 页面和大型能力使用动态导入       |
| UI 组件        | Element Plus           | 保持自动按需导入，禁止全量注册   |
| HTTP           | Axios                  | 页面不得直接创建 Axios 实例      |
| 路由           | Vue Router             | 路由页面必须动态导入             |
| 全局状态       | Pinia                  | 只保存跨页面共享状态             |
| 国际化         | Vue I18n               | 用户可见文案必须使用语言 key     |
| 通用组合式能力 | VueUse                 | 按函数导入，禁止作为业务状态框架 |
| 样式           | 设计变量、UnoCSS、Less | 不重复定义语义变量和简单工具类   |

## 3. 推荐目录与边界

```text
src/
├─ api/                 业务接口定义，不处理 UI
├─ assets/              需要构建处理的静态资源
├─ components/
│  ├─ base/             无具体业务含义的项目基础组件
│  └─ business/         可跨页面复用的业务组件
├─ composables/         包含 Vue 生命周期或响应式状态的复用逻辑
├─ config/              运行时配置、常量和环境映射
├─ directives/          少量确有必要的 DOM 指令
├─ layouts/             页面布局
├─ locales/             国际化资源
├─ router/              路由、守卫和路由元信息
├─ services/            HTTP、日志、存储、上传等基础服务
├─ stores/              Pinia Store
├─ styles/              全局样式、设计变量和主题桥接
├─ utils/               无状态、无生命周期的纯函数
├─ views/               路由页面
└─ workers/             独立 Web Worker
```

模块边界：

- `utils` 只能包含无状态纯函数，不得依赖组件实例或生命周期。
- 包含 `ref`、`watch`、生命周期或浏览器监听的逻辑放入 `composables`。
- `api` 只描述业务接口，不弹消息、不跳转路由、不操作组件状态。
- `services` 处理跨业务基础设施，不能反向依赖具体页面。
- 页面通过业务 API 模块访问后端，不直接访问 Axios 实例。
- WebGL、ECharts 等第三方实例不进入普通 Pinia Store。

## 4. Axios 请求体系

### 4.1 实例管理

- 使用 `axios.create()` 创建项目级实例。
- 默认实例统一配置 `baseURL`、超时、公共请求头和响应解析。
- 只有后端域名、认证方式或传输协议明显不同，才允许创建额外实例。
- Axios 实例由 `services/http` 管理，业务组件不得直接 `import axios`。

强制调用链：

```text
页面或业务组件
  -> api/modules 业务接口
  -> services/http Axios 实例
  -> 请求与响应拦截器
  -> 后端服务
```

`services/http` 至少统一提供：

- `client.js`：创建并导出 Axios 实例，业务模块不得重复创建。
- `error.js`：标准化网络、超时、取消、HTTP 和业务错误。
- `interceptors.js`：安装公共请求与响应拦截器。
- `download.js`：处理 Blob、文件名和 Object URL 生命周期。

业务 API 模块只导出业务语义函数，例如 `getProjectDetail`，不得将 Axios 实例继续暴露给页面。

### 4.2 请求拦截

请求拦截器只处理跨接口公共信息：

- Token 或认证信息。
- 当前语言。
- 客户端版本和必要追踪标识。
- 由请求配置显式启用的重复请求控制；不得默认取消所有 URL 和参数相同的请求。

禁止在请求拦截器中读取具体页面组件状态或拼装业务参数。

### 4.3 响应与错误

统一错误至少区分：

```js
{
  type: 'network | timeout | canceled | http | business',
  code: '',
  message: '',
  status: 0,
  cause: null,
}
```

- 取消请求不显示错误提示。
- 401、登录失效和刷新 Token 由认证模块统一处理。
- 响应拦截器不得对所有错误无条件弹窗，批量请求的提示由业务层汇总。
- 用户提示不得泄漏堆栈、内部接口和后端实现细节。

### 4.4 取消、竞态和幂等

- 使用 Axios `signal` 和 `AbortController`，不使用 `CancelToken`。
- `AbortController` 由发起请求的页面、composable 或长任务 service 持有；Axios 拦截器不得用全局控制器取消无关请求。
- 取消错误统一通过项目错误标准判断，页面不得各自解析 Axios 内部错误结构。
- 搜索、筛选、分页和上下文切换应取消旧请求。
- 无法取消时使用请求序号或上下文 ID，保证旧响应不能覆盖新状态。
- 新增、修改、删除、导入、导出等写操作必须防止重复提交。
- 后端提供幂等能力时，写操作应由业务 API 层生成或接收幂等 key，并通过统一请求头传递。

### 4.5 上传与下载

- 上传进度统一通过 Axios `onUploadProgress` 接入上传服务。
- 下载使用 `responseType: 'blob'`，统一处理文件名、空文件和异常响应。
- Blob 下载完成后必须调用 `URL.revokeObjectURL()` 并清理临时 DOM。
- 分片上传、断点续传和大文件哈希属于业务专项能力，不进入通用 Axios 拦截器。

## 5. 路由标准

路由元信息统一使用以下字段：

```js
meta: {
  title: '',
  requiresAuth: true,
  permissions: [],
  keepAlive: false,
  layout: 'default',
}
```

- 所有路由页面使用动态导入。
- 鉴权、动态路由、页面标题和操作日志应保持职责分离。
- 路由 `name` 必须全局唯一。
- 页面不得自行解析 `window.location` 代替 Router。
- 同一组件复用但路由参数变化时，必须取消旧请求、清理旧状态并加载新上下文。
- 存在未保存数据时，按照交互安全规范执行离开确认。

## 6. Pinia 状态边界

适合放入 Pinia：

- 用户信息和认证状态。
- 权限。
- 团队、项目和任务上下文。
- 全局应用配置。
- 确实需要跨页面共享的业务状态。

禁止或不建议放入 Pinia：

- 单组件弹窗开关和表单状态。
- DOM 引用。
- Axios 请求控制器。
- Three.js、Cesium、ECharts 实例和完整场景树。
- 可以由现有状态计算得到的重复字段。

Store 按业务领域拆分，禁止建立包含所有页面数据的超级 Store。

## 7. 国际化

- 所有用户可见标签、提示、校验和错误文案必须使用 i18n。
- 不使用中文句子本身作为 key。
- 按业务模块拆分语言资源；大型页面的语言资源随路由加载。
- Element Plus 语言与应用语言保持一致。
- 日期、时间和数字优先使用 `Intl` 按当前语言格式化。
- 后端业务错误码由前端统一映射为安全、可理解的文案。

## 8. UI 与基础组件

- Element Plus 能满足时直接使用，不为修改样式而无意义包装。
- 只有需要统一业务行为、数据契约或交互安全时才建立基础组件。
- 弹窗统一使用主应用内的 `DialogHost`、`ElDialog`、`ElMessageBox` 和 `Teleport`，禁止为每个弹窗创建新的 Vue App。
- 带编辑状态的弹窗，其关闭按钮、取消按钮、遮罩点击和 ESC 必须走同一关闭检查。
- 列表和页面必须区分首次加载、刷新、空数据、筛选无结果、失败和无权限状态。

基础组件必须从真实业务页面中提炼，不提前一次性创建空泛的组件库。

## 9. 通用浏览器能力

| 场景         | 首选方案                                            | 不采用的默认方案                  |
| ------------ | --------------------------------------------------- | --------------------------------- |
| 防抖/节流    | VueUse `useDebounceFn`、`useThrottleFn`             | 全局字符串 timer map、完整 Lodash |
| 剪贴板       | `navigator.clipboard` 或 VueUse `useClipboard`      | clipboard.js                      |
| DOM 监听     | VueUse `useEventListener`                           | 无销毁的全局监听                  |
| 尺寸与可见性 | ResizeObserver、IntersectionObserver 或 VueUse 封装 | 高频轮询                          |
| 深拷贝       | `structuredClone`                                   | 为单个函数安装完整 Lodash         |
| UUID         | `crypto.randomUUID()`                               | 默认安装 uuid                     |
| 日期展示     | `Intl.DateTimeFormat`                               | 默认安装 Moment                   |
| 简单动画     | CSS、Vue Transition、Web Animations API             | 默认安装 GSAP                     |
| 图片预览     | Element Plus Image Viewer                           | 默认安装 Viewer.js                |

## 10. 专用能力准入

以下依赖只在真实业务出现后按模块引入：

- SortableJS：拖拽排序。
- GSAP：复杂时间轴、暂停恢复、反向播放或 3D 联动。
- Dexie：复杂 IndexedDB、离线数据或大容量结构化缓存。
- DOMPurify：必须展示外部或不可信 HTML。
- 虚拟列表库：Element Plus 和 VueUse 无法满足的复杂可变高度列表。
- ECharts、Three.js、Cesium：对应业务页面动态加载。
- PDF、Word、Excel、图像处理和模型解析库：对应业务模块动态加载。

新增依赖必须记录：

- 真实使用场景和消费方。
- 原生、框架和现有能力不足。
- ESM、Tree Shaking 和动态导入支持。
- 运行时包体积及大型资源影响。
- 生命周期和资源清理方式。
- 许可证及维护状态。
- 可替代方案和退出成本。

## 11. 性能与构建

- 路由页面和大型专用能力动态加载。
- 不提前建立复杂 `manualChunks`；根据真实业务构建分析后再拆分。
- 超过 1000 项的列表必须评估分页或虚拟化。
- 单次主线程同步任务超过约 50ms 时先采样，再评估 Worker。
- 高频事件按用途选择 RAF 合帧、节流或防抖。
- 图片使用缩略图、懒加载、异步解码和正确尺寸。
- 新增大型运行时依赖必须对比构建产物。

## 12. 测试与验证

建议基础测试体系：

- Vitest：纯函数、Store、composable 和服务层。
- Vue Test Utils：基础组件和交互状态。
- Playwright：登录、权限、上传、关键流程和 3D 页面入口。

修改基础架构后优先执行相关 lint、单元测试和局部检查。只有公共依赖、构建配置、跨模块契约或发布产物变化时才执行全量构建。
