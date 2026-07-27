<script setup>
  import {
    computed,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    reactive,
    ref,
  } from 'vue'
  import transparentPngUrl from '@/assets/hero.png?url'
  import { createThreeScene } from './createThreeScene'

  const validationTabs = Object.freeze([
    { key: 'primitives', label: '基础图元', enabled: true },
    { key: 'textures', label: '图片纹理', enabled: true },
    { key: 'projection', label: '纹理投影', enabled: false },
    { key: 'picking', label: '拾取裁切', enabled: false },
    { key: 'resources', label: '资源监控', enabled: false },
  ])
  const cameraOptions = Object.freeze([
    { label: '透视', value: 'perspective' },
    { label: '正交', value: 'orthographic' },
  ])
  const materialOptions = Object.freeze([
    { label: 'MeshStandardMaterial', value: 'standard' },
    { label: 'MeshLambertMaterial', value: 'lambert' },
    { label: 'MeshBasicMaterial', value: 'basic' },
  ])

  const viewportRef = ref(null)
  const imageInputRef = ref(null)
  const activeTab = ref('primitives')
  const cameraMode = ref('perspective')
  const materialMode = ref('standard')
  const lightsEnabled = ref(true)
  const transparencyEnabled = ref(false)
  const depthTestEnabled = ref(true)
  const runtimeStatus = ref('正在初始化')
  const isRunning = ref(false)
  const isSceneReady = ref(false)
  const manualPaused = ref(false)
  const runtimeError = ref('')
  const textureState = ref('ready')
  const textureError = ref('')
  const textureInfo = reactive({
    source: 'CanvasTexture',
    width: 960,
    height: 600,
  })
  const rendererStats = reactive({
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  })

  const viewportCaption = computed(() => [
    cameraMode.value === 'perspective' ? '透视相机' : '正交相机',
    activeTab.value === 'primitives' ? 'Point / Line / Line2 / Mesh / Sprite' : textureInfo.source,
    'DPR ≤ 2',
  ])
  const isTextureLoading = computed(() => textureState.value === 'loading')

  let threeScene = null
  let textureRequestId = 0

  const handleStatusChange = ({ status, running, message = '' }) => {
    runtimeStatus.value = status
    isRunning.value = running
    runtimeError.value = message
  }

  const handleStatsChange = (stats) => {
    Object.assign(rendererStats, stats)
  }

  const pauseScene = () => {
    manualPaused.value = true
    threeScene?.pause()
  }

  const resumeScene = () => {
    manualPaused.value = false
    threeScene?.resume()
  }

  const resetCamera = () => {
    threeScene?.resetCamera()
  }

  const changeCamera = (mode) => {
    threeScene?.setCameraMode(mode)
  }

  const changeMaterial = (mode) => {
    threeScene?.setMaterialMode(mode)
  }

  const changeLights = (enabled) => {
    threeScene?.setLightsEnabled(enabled)
  }

  const changeTransparency = (enabled) => {
    threeScene?.setTransparencyEnabled(enabled)
  }

  const changeDepthTest = (enabled) => {
    threeScene?.setDepthTestEnabled(enabled)
  }

  const selectTab = (tab) => {
    if (!tab.enabled || activeTab.value === tab.key) return
    activeTab.value = tab.key
    threeScene?.setDemoMode(tab.key)
  }

  const updateTextureInfo = (info) => {
    textureInfo.source = info.source
    textureInfo.width = info.width
    textureInfo.height = info.height
  }

  const runTextureTask = async (task) => {
    const requestId = ++textureRequestId
    textureState.value = 'loading'
    textureError.value = ''

    try {
      const info = await task()
      if (requestId !== textureRequestId) return
      updateTextureInfo(info)
      textureState.value = 'ready'
    } catch (error) {
      if (requestId !== textureRequestId) return
      textureState.value = 'error'
      textureError.value = error instanceof Error ? error.message : '图片纹理加载失败'
    }
  }

  const loadGeneratedJpeg = () => {
    runTextureTask(() => threeScene.loadGeneratedJpegTexture())
  }

  const loadTransparentPng = () => {
    runTextureTask(() => threeScene.loadTexture(transparentPngUrl, '透明 PNG / TextureLoader'))
  }

  const loadCanvasTexture = () => {
    textureRequestId += 1
    textureError.value = ''
    updateTextureInfo(threeScene.useCanvasTexture())
    textureState.value = 'ready'
  }

  const openImagePicker = () => {
    imageInputRef.value?.click()
  }

  const handleImageChange = (event) => {
    const [file] = event.target.files || []
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      textureState.value = 'error'
      textureError.value = '请选择有效的图片文件。'
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      textureState.value = 'error'
      textureError.value = '图片大小不能超过 20 MB。'
      return
    }

    const objectUrl = URL.createObjectURL(file)
    runTextureTask(() =>
      threeScene
        .loadTexture(objectUrl, `本地图片 / ${file.name.slice(0, 40)}`)
        .finally(() => URL.revokeObjectURL(objectUrl)),
    )
  }

  onMounted(async () => {
    await nextTick()

    if (!viewportRef.value) return

    try {
      threeScene = createThreeScene(viewportRef.value, {
        onStatusChange: handleStatusChange,
        onStatsChange: handleStatsChange,
      })
      threeScene.init()
      updateTextureInfo(threeScene.useCanvasTexture())
      threeScene.start()
      isSceneReady.value = true
    } catch {
      runtimeStatus.value = '初始化失败'
      runtimeError.value = '当前浏览器无法初始化 WebGL 验证场。'
    }
  })

  onActivated(() => {
    if (!manualPaused.value) threeScene?.resume()
  })

  onDeactivated(() => {
    threeScene?.pause()
  })

  onBeforeUnmount(() => {
    textureRequestId += 1
    threeScene?.dispose()
    threeScene = null
  })
</script>

<template>
  <main class="validation-lab">
    <header class="lab-header">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p class="brand-kicker">INSPECTION CLOUD V2</p>
          <h1>Three.js 基础能力验证</h1>
        </div>
      </div>

      <div class="runtime-summary" aria-live="polite">
        <span class="status-dot" :class="{ 'is-running': isRunning }"></span>
        <span>{{ runtimeStatus }}</span>
        <span class="version-tag">three r184</span>
      </div>
    </header>

    <nav class="validation-tabs" aria-label="验证模块">
      <button
        v-for="tab in validationTabs"
        :key="tab.key"
        class="tab-button"
        :class="{ 'is-active': activeTab === tab.key }"
        :disabled="!tab.enabled"
        type="button"
        @click="selectTab(tab)"
      >
        {{ tab.label }}
        <span v-if="!tab.enabled" class="pending-mark">待验证</span>
      </button>
    </nav>

    <section class="workspace">
      <div class="viewport-shell">
        <div ref="viewportRef" class="three-viewport" aria-label="Three.js 渲染视口"></div>
        <div v-if="runtimeError" class="viewport-error" role="alert">
          {{ runtimeError }}
        </div>
        <div class="viewport-mode">
          {{ activeTab === 'primitives' ? 'PRIMITIVE LAB' : 'TEXTURE LAB' }}
        </div>
        <div class="viewport-caption">
          <span v-for="caption in viewportCaption" :key="caption">{{ caption }}</span>
        </div>
      </div>

      <aside class="control-panel">
        <section class="control-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">SCENE CONTROL</p>
              <h2>运行与相机</h2>
            </div>
            <span class="state-label" :class="{ 'is-running': isRunning }">
              {{ isRunning ? '运行中' : '已暂停' }}
            </span>
          </div>

          <div class="command-row">
            <el-button type="primary" :disabled="!isSceneReady || isRunning" @click="resumeScene">
              运行
            </el-button>
            <el-button :disabled="!isSceneReady || !isRunning" @click="pauseScene">暂停</el-button>
            <el-button :disabled="!isSceneReady" @click="resetCamera">复位视角</el-button>
          </div>

          <div class="field-block camera-field">
            <span class="field-label">相机类型</span>
            <el-radio-group v-model="cameraMode" :disabled="!isSceneReady" @change="changeCamera">
              <el-radio-button
                v-for="option in cameraOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </section>

        <section v-if="activeTab === 'primitives'" class="control-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">RENDER STATE</p>
              <h2>图元渲染参数</h2>
            </div>
          </div>

          <div class="field-block">
            <label class="field-label" for="material-mode">Mesh 材质</label>
            <el-select
              id="material-mode"
              v-model="materialMode"
              :disabled="!isSceneReady"
              @change="changeMaterial"
            >
              <el-option
                v-for="option in materialOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>

          <div class="switch-list">
            <label class="switch-row">
              <span>环境光与方向光</span>
              <el-switch v-model="lightsEnabled" @change="changeLights" />
            </label>
            <label class="switch-row">
              <span>透明度</span>
              <el-switch v-model="transparencyEnabled" @change="changeTransparency" />
            </label>
            <label class="switch-row">
              <span>Depth test</span>
              <el-switch v-model="depthTestEnabled" @change="changeDepthTest" />
            </label>
          </div>

          <div class="object-tags" aria-label="当前图元">
            <span>Point</span>
            <span>Line</span>
            <span>Line2</span>
            <span>Shape</span>
            <span>Mesh</span>
            <span>Sprite</span>
          </div>
        </section>

        <section v-else class="control-section texture-controls">
          <div class="section-heading">
            <div>
              <p class="section-kicker">IMAGE SOURCE</p>
              <h2>图片纹理</h2>
            </div>
            <span class="state-label" :class="{ 'is-loading': isTextureLoading }">
              {{ isTextureLoading ? '加载中' : '已就绪' }}
            </span>
          </div>

          <div class="source-grid">
            <el-button
              :disabled="!isSceneReady"
              :loading="isTextureLoading"
              @click="loadGeneratedJpeg"
            >
              示例 JPG
            </el-button>
            <el-button
              :disabled="!isSceneReady"
              :loading="isTextureLoading"
              @click="loadTransparentPng"
            >
              透明 PNG
            </el-button>
            <el-button :disabled="!isSceneReady || isTextureLoading" @click="loadCanvasTexture"
              >CanvasTexture</el-button
            >
            <el-button
              type="primary"
              :disabled="!isSceneReady || isTextureLoading"
              @click="openImagePicker"
            >
              选择本地图片
            </el-button>
          </div>
          <input
            ref="imageInputRef"
            class="file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="handleImageChange"
          />

          <dl class="texture-info">
            <div>
              <dt>来源</dt>
              <dd :title="textureInfo.source">{{ textureInfo.source }}</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>{{ textureInfo.width }} × {{ textureInfo.height }}</dd>
            </div>
            <div>
              <dt>颜色空间</dt>
              <dd>SRGBColorSpace</dd>
            </div>
          </dl>
          <p v-if="textureError" class="texture-error" role="alert">{{ textureError }}</p>
        </section>

        <section class="control-section metrics-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">RENDERER INFO</p>
              <h2>实时指标</h2>
            </div>
          </div>

          <dl class="metrics-grid">
            <div>
              <dt>Draw calls</dt>
              <dd>{{ rendererStats.calls }}</dd>
            </div>
            <div>
              <dt>Triangles</dt>
              <dd>{{ rendererStats.triangles }}</dd>
            </div>
            <div>
              <dt>Geometries</dt>
              <dd>{{ rendererStats.geometries }}</dd>
            </div>
            <div>
              <dt>Textures</dt>
              <dd>{{ rendererStats.textures }}</dd>
            </div>
          </dl>
        </section>

        <section class="control-section stage-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">CURRENT STAGE</p>
              <h2>{{ activeTab === 'primitives' ? '基础图元' : '图片纹理' }}</h2>
            </div>
            <span class="stage-index">02</span>
          </div>
          <ul v-if="activeTab === 'primitives'" class="check-list">
            <li><span></span>透视与正交相机</li>
            <li><span></span>点、线、宽线、面与 Mesh</li>
            <li><span></span>材质、灯光、透明与深度测试</li>
          </ul>
          <ul v-else class="check-list">
            <li><span></span>JPG 与透明 PNG</li>
            <li><span></span>本地图片加载与异常校验</li>
            <li><span></span>CanvasTexture 与 sRGB</li>
          </ul>
        </section>
      </aside>
    </section>
  </main>
</template>

<style lang="less">
  .validation-lab {
    --lab-page: var(--样式集合-填充-深1-0f172a);
    --lab-panel: var(--样式集合-填充-深2-1b2638);
    --lab-surface: var(--样式集合-填充-深3-283242);
    --lab-border: var(--样式集合-填充-深4-333e52);
    --lab-text: var(--样式集合-填充-浅1-ffffff);
    --lab-muted: var(--样式集合-填充-浅3-94a3b8);
    --lab-accent: var(--样式集合-填充-主蓝);
    --lab-success: var(--样式集合-填充-辅绿);
    --lab-warning: var(--样式集合-填充-辅黄);
    --lab-danger: var(--样式集合-填充-辅红);

    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
    font-family: 'Source Han Sans CN', 'Microsoft YaHei', sans-serif;
    color: var(--lab-text);
    background: var(--lab-page);
  }

  .lab-header {
    display: flex;
    gap: 24px;
    align-items: center;
    justify-content: space-between;
    min-height: 76px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--lab-border);
  }

  .brand-block,
  .runtime-summary,
  .section-heading,
  .command-row,
  .viewport-caption,
  .switch-row {
    display: flex;
    align-items: center;
  }

  .brand-block {
    gap: 12px;
  }

  .brand-mark {
    width: 4px;
    height: 38px;
    background: var(--lab-accent);
  }

  .brand-kicker,
  .section-kicker {
    font-size: 11px;
    line-height: 16px;
    color: var(--lab-muted);
    letter-spacing: 0;
  }

  h1 {
    font-size: 20px;
    line-height: 28px;
    letter-spacing: 0;
  }

  h2 {
    font-size: 15px;
    line-height: 22px;
    letter-spacing: 0;
  }

  .runtime-summary {
    gap: 9px;
    font-size: 13px;
    color: var(--lab-muted);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    background: var(--lab-warning);
    border-radius: 50%;

    &.is-running {
      background: var(--lab-success);
    }
  }

  .version-tag {
    padding-left: 10px;
    color: var(--lab-text);
    border-left: 1px solid var(--lab-border);
  }

  .validation-tabs {
    display: flex;
    min-height: 47px;
    padding: 0 24px;
    overflow-x: auto;
    background: var(--lab-panel);
    border-bottom: 1px solid var(--lab-border);
  }

  .tab-button {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;
    min-height: 46px;
    padding: 0 18px;
    font-size: 13px;
    color: var(--lab-muted);

    &::after {
      position: absolute;
      right: 18px;
      bottom: 0;
      left: 18px;
      height: 2px;
      content: '';
      background: transparent;
    }

    &.is-active {
      color: var(--lab-text);

      &::after {
        background: var(--lab-accent);
      }
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.62;
    }
  }

  .pending-mark {
    padding: 1px 5px;
    font-size: 10px;
    line-height: 15px;
    color: var(--lab-muted);
    border: 1px solid var(--lab-border);
    border-radius: 3px;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 336px;
    min-height: 0;
  }

  .viewport-shell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .three-viewport,
  .three-viewport canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .viewport-error {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: 360px;
    padding: 12px 16px;
    color: var(--lab-text);
    text-align: center;
    background: var(--lab-surface);
    border: 1px solid var(--lab-border);
    border-radius: 4px;
    transform: translate(-50%, -50%);
  }

  .viewport-mode {
    position: absolute;
    top: 16px;
    left: 18px;
    padding: 4px 7px;
    font-family: Consolas, monospace;
    font-size: 10px;
    color: var(--lab-accent);
    pointer-events: none;
    background: var(--lab-page);
    border-left: 2px solid var(--lab-accent);
  }

  .viewport-caption {
    position: absolute;
    bottom: 14px;
    left: 18px;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: var(--lab-muted);
    pointer-events: none;

    span + span::before {
      margin-right: 8px;
      content: '/';
      color: var(--lab-border);
    }
  }

  .control-panel {
    min-width: 0;
    overflow-y: auto;
    background: var(--lab-panel);
    border-left: 1px solid var(--lab-border);
  }

  .control-section {
    padding: 18px 20px;
    border-bottom: 1px solid var(--lab-border);
  }

  .section-heading {
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .command-row {
    flex-wrap: wrap;
    gap: 8px;

    .el-button {
      margin-left: 0;
    }
  }

  .field-block {
    display: grid;
    gap: 7px;

    .el-select {
      width: 100%;
    }
  }

  .camera-field {
    margin-top: 16px;

    .el-radio-group,
    .el-radio-button {
      display: flex;
      flex: 1;
    }

    .el-radio-button__inner {
      width: 100%;
    }
  }

  .field-label {
    font-size: 12px;
    line-height: 18px;
    color: var(--lab-muted);
  }

  .state-label {
    font-size: 12px;
    color: var(--lab-muted);

    &.is-running {
      color: var(--lab-success);
    }

    &.is-loading {
      color: var(--lab-warning);
    }
  }

  .switch-list {
    display: grid;
    gap: 1px;
    margin-top: 14px;
    overflow: hidden;
    background: var(--lab-border);
    border: 1px solid var(--lab-border);
    border-radius: 4px;
  }

  .switch-row {
    justify-content: space-between;
    min-height: 42px;
    padding: 0 12px;
    font-size: 12px;
    background: var(--lab-surface);
  }

  .object-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;

    span {
      padding: 3px 7px;
      font-family: Consolas, monospace;
      font-size: 10px;
      color: var(--lab-muted);
      border: 1px solid var(--lab-border);
      border-radius: 3px;
    }
  }

  .source-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    .el-button {
      width: 100%;
      margin-left: 0;
    }
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    border: 0;
    white-space: nowrap;
  }

  .texture-info {
    display: grid;
    gap: 8px;
    margin-top: 16px;

    div {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 8px;
      font-size: 12px;
    }

    dt {
      color: var(--lab-muted);
    }

    dd {
      overflow: hidden;
      color: var(--lab-text);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .texture-error {
    margin-top: 12px;
    font-size: 12px;
    line-height: 18px;
    color: var(--lab-danger);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    background: var(--lab-border);
    border: 1px solid var(--lab-border);
    border-radius: 4px;

    div {
      min-width: 0;
      padding: 12px;
      background: var(--lab-surface);
    }

    dt {
      margin-bottom: 4px;
      overflow: hidden;
      font-size: 11px;
      line-height: 16px;
      color: var(--lab-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    dd {
      font-family: Consolas, monospace;
      font-size: 18px;
      line-height: 24px;
      color: var(--lab-text);
    }
  }

  .stage-index {
    font-family: Consolas, monospace;
    font-size: 20px;
    color: var(--lab-accent);
  }

  .check-list {
    display: grid;
    gap: 11px;
    font-size: 13px;
    color: var(--lab-muted);

    li {
      display: flex;
      gap: 9px;
      align-items: center;
    }

    span {
      width: 6px;
      height: 6px;
      background: var(--lab-success);
      border-radius: 50%;
    }
  }

  @media (width <= 860px) {
    .validation-lab {
      height: auto;
      overflow: visible;
    }

    .lab-header {
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 16px;
    }

    .validation-tabs {
      padding: 0 8px;
    }

    .workspace {
      grid-template-columns: 1fr;
    }

    .viewport-shell {
      height: 55vh;
      min-height: 55vh;
    }

    .control-panel {
      overflow-y: visible;
      border-top: 1px solid var(--lab-border);
      border-left: 0;
    }
  }

  @media (width <= 520px) {
    .runtime-summary {
      width: 100%;
    }

    .tab-button {
      padding: 0 12px;

      &::after {
        right: 12px;
        left: 12px;
      }
    }

    .viewport-caption {
      right: 12px;
      left: 12px;
    }
  }
</style>
