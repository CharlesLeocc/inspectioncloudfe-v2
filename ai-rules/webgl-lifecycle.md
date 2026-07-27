# WebGL 生命周期与性能规范

## 1. 适用范围

本规范适用于 Three.js、Cesium、WebGL、Canvas、ECharts、PixiJS、模型加载、图片渲染、动画时间轴和其他高频可视化模块。

目标是明确资源所有权、限制 Vue 响应式开销、控制渲染频率，并保证路由切换、页面停用和异常状态下资源能够正确暂停或释放。

## 2. 响应式边界

### 2.1 禁止深度响应式的对象

以下对象使用普通变量、`markRaw` 或 `shallowRef`：

- Renderer、Scene、Camera、Controls。
- Cesium Viewer 和 Entity 集合。
- Geometry、Material、Texture、RenderTarget。
- Loader、TilesRenderer、后处理 Pass。
- ECharts 实例。
- Worker、AudioContext 和大型 TypedArray。

禁止将完整场景树或第三方实例放入普通 `reactive`、深度 `ref` 或可持久化 Pinia Store。

### 2.2 Vue 状态只保存业务数据

适合响应式管理的内容：

- 当前选择 ID。
- 工具模式。
- 显示开关。
- 加载进度和用户可见状态。
- 经过降频的坐标、时间和统计数据。

每帧内部状态不应无条件同步到 Vue。需要展示时通过节流或定点采样降低响应式更新频率。

## 3. 资源所有权

创建资源的模块必须明确其所有者和销毁责任。默认遵循“谁创建，谁释放”；资源移交时必须显式记录所有权变化。

需要管理的资源包括：

- Geometry 和 Attribute。
- Material 及其引用的 Texture。
- Texture、CubeTexture、VideoTexture。
- WebGLRenderTarget 和后处理缓冲区。
- Controls、Loader、Decoder 和解析 Worker。
- Renderer 和 Canvas。
- DOM、窗口和引擎事件监听。
- RAF、定时器和 GSAP timeline。

禁止多个模块重复销毁同一资源，也禁止依赖 JavaScript 垃圾回收自动释放 GPU 资源。

## 4. 标准生命周期

可视化模块应具备清晰的生命周期接口：

```js
{
  init,
  start,
  pause,
  resume,
  resize,
  dispose,
}
```

- `init` 只执行一次资源创建和必要监听注册。
- `start` 启动首次渲染或动画。
- `pause` 停止非必要的 RAF、轮询和媒体播放，但保留可恢复资源。
- `resume` 根据当前容器和业务状态恢复。
- `resize` 更新渲染尺寸、相机投影和像素比。
- `dispose` 必须可安全重复调用，不因部分初始化失败而抛出二次异常。

## 5. 渲染循环

### 5.1 单一调度

- 同一场景默认只允许一个持续 RAF。
- 子模块通过主循环注册更新回调，不各自创建无协调 RAF。
- 静态场景优先采用状态变更触发的按需渲染。
- 使用 GSAP 时明确由 GSAP ticker 还是场景 RAF 驱动，禁止两套循环重复渲染。

持续渲染的时间复杂度近似为 `O(帧数 × 每帧工作量)`；任何每帧新增遍历、对象创建和 Vue 更新都必须评估影响。

### 5.2 暂停与降频

以下场景应暂停或降低渲染频率：

- `document.visibilityState === 'hidden'`。
- 路由离开。
- `KeepAlive` 页面停用。
- 可视化容器不可见或尺寸为零。
- 弹窗完全遮挡且后台渲染无业务价值。

## 6. 高频事件

`pointermove`、`mousemove`、`wheel`、`scroll` 和 `resize` 等高频事件：

- 视觉更新优先使用 `requestAnimationFrame` 合帧。
- 网络请求使用防抖。
- 连续业务采样使用节流。
- 事件处理函数中避免创建大量临时 Vector、Matrix、Raycaster 和数组。
- 可复用数学对象应由模块缓存，但不能跨异步任务错误共享中间状态。
- 监听器必须在暂停或销毁阶段移除。

## 7. Resize 与像素比

- Resize 统一由可视化模块入口处理，避免多个子组件重复监听窗口。
- 容器型场景优先使用 ResizeObserver，而不是只读取 `window.innerWidth`。
- Resize 高频触发时使用 RAF 合帧。
- 更新 renderer 尺寸后同步更新相机 aspect 和 projection matrix。
- `devicePixelRatio` 必须设置合理上限，避免高分屏无条件放大显存和填充率开销。
- 离屏截图、业务图片生成和屏幕显示应区分分辨率契约，禁止直接把设备 DPR 当作业务输出分辨率。

## 8. 加载与并发

- 模型、纹理和瓦片加载必须支持取消、失效标记或响应隔离。
- 切换项目、模型或任务后，旧加载结果不得加入新场景。
- 大量资源加载应限制并发。
- 解析密集任务经过采样确认后迁移 Worker。
- TypedArray 等大数据优先使用 Transferable，避免结构化克隆产生 `O(n)` 复制开销。
- Loader、Decoder 和 Worker 的终止责任必须归属到创建模块。

## 9. 销毁顺序

推荐按以下顺序销毁：

1. 阻止新的业务操作和异步回调。
2. 取消 Axios 请求、加载任务和 Worker。
3. 停止 RAF、GSAP、定时器、媒体和轮询。
4. 移除 DOM、窗口、引擎和控件事件。
5. 从场景中移除对象。
6. 释放 Geometry、Material、Texture 和 RenderTarget。
7. 释放 Controls、Pass、Loader 和 Renderer。
8. 移除 Canvas 和其他临时 DOM。
9. 清空强引用、缓存和对象池。

共享 Texture 或 Material 必须通过引用计数、资源注册表或明确的共享所有者释放，不能由任意消费组件直接销毁。

常见实例的释放方式：

| 实例或资源                                         | 典型清理方式                   | 注意事项                                              |
| -------------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| Three.js Geometry、Material、Texture、RenderTarget | `dispose()`                    | Material 引用的共享 Texture 由共享所有者释放          |
| Three.js WebGLRenderer                             | `dispose()`，必要时移除 Canvas | 是否调用 `forceContextLoss()` 必须按重建策略决定      |
| OrbitControls 等 Controls                          | `dispose()`                    | 同时确认自定义监听已经移除                            |
| GLTFLoader                                         | 通常无统一 `dispose()`         | 释放加载结果和其依赖资源，取消能力按当前版本 API 核对 |
| DRACOLoader、KTX2Loader                            | 按当前版本提供的 `dispose()`   | 不得基于未确认版本调用 API                            |
| Cesium Viewer                                      | `destroy()`                    | 调用前可检查 `isDestroyed()`，自建监听另行移除        |
| ECharts 实例                                       | `dispose()`                    | ResizeObserver 和窗口监听需要同时清理                 |
| Worker                                             | `terminate()`                  | 终止前标记结果失效，避免迟到消息写入状态              |
| GSAP Tween、Timeline                               | `kill()`                       | 同时解除业务回调持有的组件引用                        |

不同版本的清理 API 可能变化，实施前必须核对项目实际依赖版本，不能只依据本表推断。

## 10. Vue 生命周期映射

| Vue 生命周期      | 可视化行为                                                           |
| ----------------- | -------------------------------------------------------------------- |
| `onMounted`       | 创建容器相关资源并初始化场景                                         |
| `onActivated`     | 检查尺寸和上下文，恢复必要渲染                                       |
| `onDeactivated`   | 暂停 RAF、交互、轮询、媒体和只服务于可见页面的监听，但保留可恢复资源 |
| `onBeforeUnmount` | 阻止新任务、取消请求并调用 `dispose`                                 |
| `onUnmounted`     | 不应再保留需要组件实例的清理任务                                     |

销毁逻辑应集中在一个幂等 `dispose` 中，避免散落在多个生命周期导致漏清理或重复释放。

停用阶段移除的监听必须由 `resume` 或 `onActivated` 成对恢复；持续保留的监听必须证明其在页面不可见时仍有业务价值且不会产生高频工作。

## 11. 上下文丢失与异常

核心 WebGL 页面必须考虑：

- `webglcontextlost`：阻止默认行为并暂停业务渲染。
- `webglcontextrestored`：按引擎能力重建必要资源或提示重新加载。
- GPU 不支持或初始化失败。
- 显存不足和纹理创建失败。
- 模型、瓦片和 Decoder 加载失败。

异常应限制在可视化模块内，显示可恢复的错误状态，不能导致整个 Vue 应用白屏。用户提示不得暴露底层堆栈。

## 12. 内存与性能检查

涉及可视化性能问题时至少检查：

- RAF 数量是否随页面进入次数增长。
- renderer、scene、texture 和 material 数量是否持续增长。
- DOM 监听、Observer 和 Worker 是否残留。
- 页面隐藏后 CPU/GPU 是否仍持续工作。
- 大型数组是否被响应式代理或重复复制。
- 每帧是否创建大量临时对象。
- draw call、三角形、纹理尺寸和 RenderTarget 数量是否超出场景需要。

处理超过 1000 个对象或存在嵌套遍历时，必须说明时间复杂度、空间复杂度以及是否需要空间索引、批处理、实例化或对象复用。

## 13. 验证场景

可视化模块修改后按风险验证：

1. 首次进入页面正常初始化。
2. 路由离开后停止渲染和请求。
3. 重复进入、离开页面不会增加 RAF、监听器和资源数量。
4. `KeepAlive` 停用时暂停，激活后恢复。
5. 快速切换模型或项目时旧结果不会进入新场景。
6. 调整窗口和容器尺寸后画面与拾取坐标一致。
7. 页面隐藏后 CPU/GPU 活动符合预期。
8. 加载失败、Worker 失败和 WebGL 初始化失败时页面可恢复。
9. 销毁过程中部分资源不存在时不会抛出二次异常。
10. 高分屏和普通屏幕下业务截图输出遵循相同业务分辨率契约。
