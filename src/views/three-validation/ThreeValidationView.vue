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
    { key: 'projection', label: '纹理投影', enabled: true },
    { key: 'clipping', label: '裁切能力', enabled: true },
    { key: 'interaction', label: '拾取绘制', enabled: true },
    { key: 'resources', label: '资源监控', enabled: true },
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
  const textureTargetOptions = Object.freeze([
    { label: 'Plane', value: 'plane' },
    { label: 'Box', value: 'box' },
    { label: 'Sphere', value: 'sphere' },
  ])
  const textureWrappingOptions = Object.freeze([
    { label: 'Clamp', value: 'clamp' },
    { label: 'Repeat', value: 'repeat' },
    { label: 'Mirrored', value: 'mirrored' },
  ])
  const textureFilterOptions = Object.freeze([
    { label: 'Linear', value: 'linear' },
    { label: 'Nearest', value: 'nearest' },
    { label: 'Mipmap', value: 'mipmap' },
  ])
  const projectionDirectionOptions = Object.freeze([
    { label: '正面', value: 'front' },
    { label: '斜向', value: 'diagonal' },
    { label: '俯视', value: 'overhead' },
  ])
  const clippingTargetOptions = Object.freeze([
    { label: 'Box', value: 'box' },
    { label: 'Sphere', value: 'sphere' },
    { label: 'TorusKnot', value: 'torusKnot' },
  ])
  const clippingAxisOptions = Object.freeze([
    { label: 'X', value: 'x' },
    { label: 'Y', value: 'y' },
    { label: 'Z', value: 'z' },
  ])
  const interactionModeOptions = Object.freeze([
    { label: '拾取', value: 'picking' },
    { label: '点', value: 'point' },
    { label: '线', value: 'line' },
    { label: '面', value: 'polygon' },
  ])

  const viewportRef = ref(null)
  const imageInputRef = ref(null)
  const activeTab = ref('primitives')
  const cameraMode = ref('perspective')
  const materialMode = ref('standard')
  const lightsEnabled = ref(true)
  const transparencyEnabled = ref(false)
  const depthTestEnabled = ref(true)
  const textureTarget = ref('plane')
  const textureWrapping = ref('clamp')
  const textureRepeat = ref(1)
  const textureFilter = ref('mipmap')
  const textureMipmapsEnabled = ref(true)
  const textureFlipY = ref(true)
  const textureAnisotropy = ref('max')
  const projectionTarget = ref('box')
  const projectionDirection = ref('front')
  const projectionFov = ref(38)
  const projectionDistance = ref(8)
  const projectionEnabled = ref(true)
  const projectionHelperEnabled = ref(false)
  const clippingTarget = ref('box')
  const clippingAxis = ref('x')
  const clippingOffset = ref(0)
  const clippingInverted = ref(false)
  const clippingEnabled = ref(true)
  const clippingHelperEnabled = ref(true)
  const interactionMode = ref('picking')
  const runtimeStatus = ref('正在初始化')
  const isRunning = ref(false)
  const isSceneReady = ref(false)
  const manualPaused = ref(false)
  const runtimeError = ref('')
  const textureState = ref('ready')
  const textureError = ref('')
  const textureInfo = reactive({
    source: 'CanvasTexture',
    fileSize: null,
    width: 960,
    height: 600,
    uploadWidth: 960,
    uploadHeight: 600,
    maxTextureSize: 0,
    decodedBytes: 960 * 600 * 4,
    estimatedGpuBytes: Math.round(960 * 600 * 4 * (4 / 3)),
    loadDuration: 0,
    resized: false,
    maxAnisotropy: 1,
    warnings: [],
  })
  const rendererStats = reactive({
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    frames: 0,
  })
  const interactionInfo = reactive({
    selectedName: '',
    hitPoint: null,
    pointCount: 0,
    finished: false,
    status: '等待拾取',
  })
  const resourceInfo = reactive({
    activeObjects: 0,
    cycleCount: 0,
    contextLost: false,
    status: '等待记录基线',
    baseline: null,
    current: {
      geometries: 0,
      textures: 0,
      programs: 0,
    },
  })

  const viewportCaption = computed(() => {
    const content =
      activeTab.value === 'primitives'
        ? 'Point / Line / Line2 / Mesh / Sprite'
        : activeTab.value === 'projection'
          ? `Projector / ${projectionDirection.value} / ${textureInfo.source}`
          : activeTab.value === 'clipping'
            ? `Local clipping / ${clippingAxis.value.toUpperCase()} axis`
            : activeTab.value === 'interaction'
              ? `Raycaster / ${interactionMode.value}`
              : activeTab.value === 'resources'
                ? `Resources / ${resourceInfo.activeObjects} objects`
                : textureInfo.source

    return [cameraMode.value === 'perspective' ? '透视相机' : '正交相机', content, 'DPR ≤ 2']
  })
  const viewportModeLabel = computed(() => {
    if (activeTab.value === 'primitives') return 'PRIMITIVE LAB'
    if (activeTab.value === 'projection') return 'PROJECTOR LAB'
    if (activeTab.value === 'clipping') return 'CLIPPING LAB'
    if (activeTab.value === 'interaction') return 'INTERACTION LAB'
    if (activeTab.value === 'resources') return 'RESOURCE LAB'
    return 'TEXTURE LAB'
  })
  const activeStageLabel = computed(() => {
    if (activeTab.value === 'primitives') return '基础图元'
    if (activeTab.value === 'projection') return '纹理投影'
    if (activeTab.value === 'clipping') return '裁切能力'
    if (activeTab.value === 'interaction') return '拾取绘制'
    if (activeTab.value === 'resources') return '资源监控'
    return '图片纹理'
  })
  const activeStageIndex = computed(() => {
    if (activeTab.value === 'primitives') return '01'
    if (activeTab.value === 'projection') return '03'
    if (activeTab.value === 'clipping') return '04'
    if (activeTab.value === 'interaction') return '05'
    if (activeTab.value === 'resources') return '06'
    return '02'
  })
  const isTextureLoading = computed(() => textureState.value === 'loading')
  const canFinishInteraction = computed(() => {
    if (interactionMode.value === 'picking') return false
    if (interactionMode.value === 'polygon') return interactionInfo.pointCount >= 3
    if (interactionMode.value === 'line') return interactionInfo.pointCount >= 2
    return interactionInfo.pointCount >= 1
  })

  const interactionCoordinate = computed(() => {
    const point = interactionInfo.hitPoint
    if (!point) return '--'
    return `(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)})`
  })

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return '--'
    if (bytes < 1024) return `${bytes} B`

    const units = ['KB', 'MB', 'GB']
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`
  }

  const formatDuration = (duration) =>
    duration >= 1000 ? `${(duration / 1000).toFixed(2)} s` : `${duration.toFixed(1)} ms`

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

  const handleInteractionChange = (info) => {
    Object.assign(interactionInfo, info)
  }

  const handleResourceChange = (info) => {
    Object.assign(resourceInfo, info)
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
    if (info) Object.assign(textureInfo, info)
  }

  const changeTextureTarget = (target) => {
    threeScene?.setTextureTarget(target)
  }

  const changeTextureWrapping = (wrapping) => {
    updateTextureInfo(threeScene?.setTextureWrapping(wrapping))
  }

  const changeTextureRepeat = (repeat) => {
    updateTextureInfo(threeScene?.setTextureRepeat(repeat))
  }

  const changeTextureFilter = (filter) => {
    updateTextureInfo(threeScene?.setTextureFilters(filter))
  }

  const changeTextureMipmaps = (enabled) => {
    updateTextureInfo(threeScene?.setTextureMipmaps(enabled))
  }

  const changeTextureFlipY = (enabled) => {
    updateTextureInfo(threeScene?.setTextureFlipY(enabled))
  }

  const changeTextureAnisotropy = (value) => {
    updateTextureInfo(threeScene?.setTextureAnisotropy(value))
  }

  const changeProjectionTarget = (target) => {
    threeScene?.setProjectionTarget(target)
  }

  const changeProjectionDirection = (direction) => {
    threeScene?.setProjectionDirection(direction)
  }

  const changeProjectionFov = (fov) => {
    threeScene?.setProjectionFov(fov)
  }

  const changeProjectionDistance = (distance) => {
    threeScene?.setProjectionDistance(distance)
  }

  const changeProjectionEnabled = (enabled) => {
    threeScene?.setProjectionEnabled(enabled)
  }

  const changeProjectionHelper = (enabled) => {
    threeScene?.setProjectionHelperEnabled(enabled)
  }

  const changeClippingTarget = (target) => {
    threeScene?.setClippingTarget(target)
  }

  const changeClippingAxis = (axis) => {
    threeScene?.setClippingAxis(axis)
  }

  const changeClippingOffset = (offset) => {
    threeScene?.setClippingOffset(offset)
  }

  const changeClippingInverted = (inverted) => {
    threeScene?.setClippingInverted(inverted)
  }

  const changeClippingEnabled = (enabled) => {
    threeScene?.setClippingEnabled(enabled)
  }

  const changeClippingHelper = (enabled) => {
    threeScene?.setClippingHelperEnabled(enabled)
  }

  const changeInteractionMode = (mode) => {
    threeScene?.setInteractionMode(mode)
  }

  const finishInteractionDrawing = () => {
    threeScene?.finishInteractionDrawing()
  }

  const clearInteractionResult = () => {
    threeScene?.clearInteractionDrawing()
  }

  const createResourceBatch = () => {
    threeScene?.createResourceBatch()
  }

  const releaseResourceBatch = () => {
    threeScene?.releaseResourceBatch()
  }

  const runResourceCycles = () => {
    threeScene?.runResourceCycles()
  }

  const loseWebGLContext = () => {
    threeScene?.loseWebGLContext()
  }

  const restoreWebGLContext = () => {
    threeScene?.restoreWebGLContext()
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

    const objectUrl = URL.createObjectURL(file)
    runTextureTask(() =>
      threeScene
        .loadTexture(objectUrl, `本地图片 / ${file.name.slice(0, 40)}`, { fileSize: file.size })
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
        onInteractionChange: handleInteractionChange,
        onResourceChange: handleResourceChange,
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
          {{ viewportModeLabel }}
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

        <section v-else-if="activeTab === 'textures'" class="control-section texture-controls">
          <div class="section-heading">
            <div>
              <p class="section-kicker">IMAGE SOURCE</p>
              <h2>图片纹理</h2>
            </div>
            <span
              class="state-label"
              :class="{ 'is-loading': isTextureLoading, 'is-error': textureState === 'error' }"
            >
              {{ isTextureLoading ? '加载中' : textureState === 'error' ? '加载失败' : '已就绪' }}
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

          <div class="texture-parameter-panel">
            <div class="field-block target-field">
              <span class="field-label">贴图对象</span>
              <el-segmented
                v-model="textureTarget"
                :disabled="!isSceneReady"
                :options="textureTargetOptions"
                @change="changeTextureTarget"
              />
            </div>

            <div class="texture-field-grid">
              <div class="field-block">
                <label class="field-label" for="texture-wrapping">Wrapping</label>
                <el-select
                  id="texture-wrapping"
                  v-model="textureWrapping"
                  :disabled="!isSceneReady"
                  @change="changeTextureWrapping"
                >
                  <el-option
                    v-for="option in textureWrappingOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              <div class="field-block">
                <label class="field-label" for="texture-repeat">Repeat</label>
                <el-select
                  id="texture-repeat"
                  v-model="textureRepeat"
                  :disabled="!isSceneReady"
                  @change="changeTextureRepeat"
                >
                  <el-option
                    v-for="value in [1, 2, 4]"
                    :key="value"
                    :label="`${value} × ${value}`"
                    :value="value"
                  />
                </el-select>
              </div>
              <div class="field-block">
                <label class="field-label" for="texture-filter">Filter</label>
                <el-select
                  id="texture-filter"
                  v-model="textureFilter"
                  :disabled="!isSceneReady"
                  @change="changeTextureFilter"
                >
                  <el-option
                    v-for="option in textureFilterOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              <div class="field-block">
                <label class="field-label" for="texture-anisotropy">Anisotropy</label>
                <el-select
                  id="texture-anisotropy"
                  v-model="textureAnisotropy"
                  :disabled="!isSceneReady"
                  @change="changeTextureAnisotropy"
                >
                  <el-option label="1" value="1" />
                  <el-option :label="`最大 (${textureInfo.maxAnisotropy})`" value="max" />
                </el-select>
              </div>
            </div>

            <div class="texture-switches">
              <label class="texture-switch-row">
                <span>Mipmap</span>
                <el-switch v-model="textureMipmapsEnabled" @change="changeTextureMipmaps" />
              </label>
              <label class="texture-switch-row">
                <span>flipY</span>
                <el-switch v-model="textureFlipY" @change="changeTextureFlipY" />
              </label>
            </div>
          </div>

          <dl class="texture-info">
            <div>
              <dt>来源</dt>
              <dd :title="textureInfo.source">{{ textureInfo.source }}</dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd>{{ formatBytes(textureInfo.fileSize) }}</dd>
            </div>
            <div>
              <dt>原始尺寸</dt>
              <dd>{{ textureInfo.width }} × {{ textureInfo.height }}</dd>
            </div>
            <div>
              <dt>上传尺寸</dt>
              <dd>
                {{ textureInfo.uploadWidth }} × {{ textureInfo.uploadHeight }}
                <span v-if="textureInfo.resized" class="resized-mark">已缩放</span>
              </dd>
            </div>
            <div>
              <dt>GPU 上限</dt>
              <dd>{{ textureInfo.maxTextureSize }} × {{ textureInfo.maxTextureSize }}</dd>
            </div>
            <div>
              <dt>解码内存</dt>
              <dd>{{ formatBytes(textureInfo.decodedBytes) }}</dd>
            </div>
            <div>
              <dt>预计显存</dt>
              <dd>{{ formatBytes(textureInfo.estimatedGpuBytes) }}</dd>
            </div>
            <div>
              <dt>加载耗时</dt>
              <dd>{{ formatDuration(textureInfo.loadDuration) }}</dd>
            </div>
          </dl>
          <ul v-if="textureInfo.warnings.length" class="texture-warnings" role="status">
            <li v-for="warning in textureInfo.warnings" :key="warning">{{ warning }}</li>
          </ul>
          <p v-if="textureError" class="texture-error" role="alert">{{ textureError }}</p>
        </section>

        <section v-else-if="activeTab === 'projection'" class="control-section projection-controls">
          <div class="section-heading">
            <div>
              <p class="section-kicker">PROJECTOR</p>
              <h2>图片纹理投影</h2>
            </div>
            <span class="state-label" :class="{ 'is-loading': isTextureLoading }">
              {{ isTextureLoading ? '加载中' : projectionEnabled ? '投影中' : '已停用' }}
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
            <el-button :disabled="!isSceneReady || isTextureLoading" @click="loadCanvasTexture">
              CanvasTexture
            </el-button>
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

          <div class="projection-parameter-panel">
            <div class="field-block target-field">
              <span class="field-label">承载对象</span>
              <el-segmented
                v-model="projectionTarget"
                :disabled="!isSceneReady"
                :options="textureTargetOptions"
                @change="changeProjectionTarget"
              />
            </div>
            <div class="field-block target-field">
              <span class="field-label">投影方向</span>
              <el-segmented
                v-model="projectionDirection"
                :disabled="!isSceneReady"
                :options="projectionDirectionOptions"
                @change="changeProjectionDirection"
              />
            </div>

            <div class="projection-slider">
              <div class="parameter-heading">
                <span>投影视场角</span>
                <strong>{{ projectionFov }}°</strong>
              </div>
              <el-slider
                v-model="projectionFov"
                :disabled="!isSceneReady"
                :min="20"
                :max="80"
                :show-tooltip="false"
                @change="changeProjectionFov"
              />
            </div>
            <div class="projection-slider">
              <div class="parameter-heading">
                <span>投影距离</span>
                <strong>{{ projectionDistance }}</strong>
              </div>
              <el-slider
                v-model="projectionDistance"
                :disabled="!isSceneReady"
                :min="5"
                :max="14"
                :step="0.5"
                :show-tooltip="false"
                @change="changeProjectionDistance"
              />
            </div>

            <div class="projection-switches">
              <label class="texture-switch-row">
                <span>启用投影</span>
                <el-switch v-model="projectionEnabled" @change="changeProjectionEnabled" />
              </label>
              <label class="texture-switch-row">
                <span>投影相机辅助线</span>
                <el-switch v-model="projectionHelperEnabled" @change="changeProjectionHelper" />
              </label>
            </div>
          </div>

          <dl class="projection-info">
            <div>
              <dt>图片来源</dt>
              <dd :title="textureInfo.source">{{ textureInfo.source }}</dd>
            </div>
            <div>
              <dt>原始尺寸</dt>
              <dd>{{ textureInfo.width }} × {{ textureInfo.height }}</dd>
            </div>
            <div>
              <dt>上传尺寸</dt>
              <dd>{{ textureInfo.uploadWidth }} × {{ textureInfo.uploadHeight }}</dd>
            </div>
          </dl>
          <ul v-if="textureInfo.warnings.length" class="texture-warnings" role="status">
            <li v-for="warning in textureInfo.warnings" :key="warning">{{ warning }}</li>
          </ul>
          <p v-if="textureError" class="texture-error" role="alert">{{ textureError }}</p>
        </section>

        <section v-else-if="activeTab === 'clipping'" class="control-section clipping-controls">
          <div class="section-heading">
            <div>
              <p class="section-kicker">LOCAL CLIPPING</p>
              <h2>单平面裁切</h2>
            </div>
            <span class="state-label" :class="{ 'is-running': clippingEnabled }">
              {{ clippingEnabled ? '裁切中' : '已停用' }}
            </span>
          </div>

          <div class="clipping-parameter-panel">
            <div class="field-block target-field">
              <span class="field-label">承载对象</span>
              <el-segmented
                v-model="clippingTarget"
                :disabled="!isSceneReady"
                :options="clippingTargetOptions"
                @change="changeClippingTarget"
              />
            </div>

            <div class="field-block target-field">
              <span class="field-label">裁切轴向</span>
              <el-segmented
                v-model="clippingAxis"
                :disabled="!isSceneReady"
                :options="clippingAxisOptions"
                @change="changeClippingAxis"
              />
            </div>

            <div class="clipping-slider">
              <div class="parameter-heading">
                <span>裁切位置</span>
                <strong>{{ clippingOffset.toFixed(1) }}</strong>
              </div>
              <el-slider
                v-model="clippingOffset"
                :disabled="!isSceneReady"
                :min="-2.5"
                :max="2.5"
                :step="0.1"
                :show-tooltip="false"
                @change="changeClippingOffset"
              />
            </div>

            <div class="clipping-switches">
              <label class="texture-switch-row">
                <span>启用裁切</span>
                <el-switch v-model="clippingEnabled" @change="changeClippingEnabled" />
              </label>
              <label class="texture-switch-row">
                <span>反向裁切</span>
                <el-switch v-model="clippingInverted" @change="changeClippingInverted" />
              </label>
              <label class="texture-switch-row">
                <span>显示辅助面</span>
                <el-switch v-model="clippingHelperEnabled" @change="changeClippingHelper" />
              </label>
            </div>
          </div>

          <dl class="clipping-info">
            <div>
              <dt>Three.js 开关</dt>
              <dd>renderer.localClippingEnabled</dd>
            </div>
            <div>
              <dt>裁切对象</dt>
              <dd>material.clippingPlanes</dd>
            </div>
            <div>
              <dt>裁切面数量</dt>
              <dd>1</dd>
            </div>
          </dl>
        </section>

        <section
          v-else-if="activeTab === 'interaction'"
          class="control-section interaction-controls"
        >
          <div class="section-heading">
            <div>
              <p class="section-kicker">RAYCASTER & DRAWING</p>
              <h2>鼠标拾取与绘制</h2>
            </div>
            <span class="state-label" :class="{ 'is-running': interactionInfo.finished }">
              {{ interactionInfo.status }}
            </span>
          </div>

          <div class="interaction-parameter-panel">
            <div class="field-block target-field interaction-mode-field">
              <span class="field-label">交互模式</span>
              <el-segmented
                v-model="interactionMode"
                :disabled="!isSceneReady"
                :options="interactionModeOptions"
                @change="changeInteractionMode"
              />
            </div>

            <div class="command-row interaction-command-row">
              <el-button
                type="primary"
                :disabled="!isSceneReady || !canFinishInteraction"
                @click="finishInteractionDrawing"
              >
                完成当前图形
              </el-button>
              <el-button
                :disabled="
                  !isSceneReady || (!interactionInfo.selectedName && !interactionInfo.pointCount)
                "
                @click="clearInteractionResult"
              >
                清空结果
              </el-button>
            </div>
          </div>

          <dl class="interaction-info">
            <div>
              <dt>拾取对象</dt>
              <dd>{{ interactionInfo.selectedName || '--' }}</dd>
            </div>
            <div>
              <dt>场景坐标</dt>
              <dd :title="interactionCoordinate">{{ interactionCoordinate }}</dd>
            </div>
            <div>
              <dt>绘制点数</dt>
              <dd>{{ interactionInfo.pointCount }}</dd>
            </div>
            <div>
              <dt>能力入口</dt>
              <dd>THREE.Raycaster</dd>
            </div>
          </dl>
        </section>

        <section v-else class="control-section resource-controls">
          <div class="section-heading">
            <div>
              <p class="section-kicker">GPU RESOURCE LIFECYCLE</p>
              <h2>资源监控与释放</h2>
            </div>
            <span
              class="state-label"
              :class="{
                'is-running': !resourceInfo.contextLost,
                'is-error': resourceInfo.contextLost,
              }"
            >
              {{ resourceInfo.status }}
            </span>
          </div>

          <div class="resource-parameter-panel">
            <div class="resource-action-grid">
              <el-button
                type="primary"
                :disabled="!isSceneReady || resourceInfo.contextLost"
                @click="createResourceBatch"
              >
                创建测试资源
              </el-button>
              <el-button
                :disabled="
                  !isSceneReady || resourceInfo.contextLost || resourceInfo.activeObjects === 0
                "
                @click="releaseResourceBatch"
              >
                释放测试资源
              </el-button>
              <el-button
                class="cycle-button"
                :disabled="!isSceneReady || resourceInfo.contextLost"
                @click="runResourceCycles"
              >
                执行 10 次创建/释放
              </el-button>
            </div>

            <div class="resource-context-grid">
              <el-button
                :disabled="!isSceneReady || resourceInfo.contextLost"
                @click="loseWebGLContext"
              >
                模拟上下文丢失
              </el-button>
              <el-button
                :disabled="!isSceneReady || !resourceInfo.contextLost"
                @click="restoreWebGLContext"
              >
                恢复 WebGL 上下文
              </el-button>
            </div>
          </div>

          <dl class="resource-info">
            <div>
              <dt>活动对象</dt>
              <dd>{{ resourceInfo.activeObjects }}</dd>
            </div>
            <div>
              <dt>循环次数</dt>
              <dd>{{ resourceInfo.cycleCount }}</dd>
            </div>
            <div>
              <dt>基线 Geometry</dt>
              <dd>{{ resourceInfo.baseline?.geometries ?? '--' }}</dd>
            </div>
            <div>
              <dt>基线 Texture</dt>
              <dd>{{ resourceInfo.baseline?.textures ?? '--' }}</dd>
            </div>
            <div>
              <dt>基线 Program</dt>
              <dd>{{ resourceInfo.baseline?.programs ?? '--' }}</dd>
            </div>
            <div>
              <dt>上下文状态</dt>
              <dd>{{ resourceInfo.contextLost ? '已丢失' : '正常' }}</dd>
            </div>
          </dl>
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
            <div>
              <dt>Programs</dt>
              <dd>{{ rendererStats.programs }}</dd>
            </div>
            <div>
              <dt>Frames</dt>
              <dd>{{ rendererStats.frames }}</dd>
            </div>
          </dl>
        </section>

        <section class="control-section stage-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">CURRENT STAGE</p>
              <h2>{{ activeStageLabel }}</h2>
            </div>
            <span class="stage-index">{{ activeStageIndex }}</span>
          </div>
          <ul v-if="activeTab === 'primitives'" class="check-list">
            <li><span></span>透视与正交相机</li>
            <li><span></span>点、线、宽线、面与 Mesh</li>
            <li><span></span>材质、灯光、透明与深度测试</li>
          </ul>
          <ul v-else-if="activeTab === 'textures'" class="check-list">
            <li><span></span>JPG、PNG 与大图加载</li>
            <li><span></span>Plane、Box、Sphere 贴图</li>
            <li><span></span>Wrapping、Filter 与 Mipmap</li>
          </ul>
          <ul v-else-if="activeTab === 'projection'" class="check-list">
            <li><span></span>投影矩阵与图片宽高比</li>
            <li><span></span>投影视锥与背面过滤</li>
            <li><span></span>透明纹理与资源复用</li>
          </ul>
          <ul v-else-if="activeTab === 'clipping'" class="check-list">
            <li><span></span>单平面局部裁切</li>
            <li><span></span>X、Y、Z 轴向与反向</li>
            <li><span></span>对象切换与辅助面</li>
          </ul>
          <ul v-else-if="activeTab === 'interaction'" class="check-list">
            <li><span></span>Raycaster 点击拾取</li>
            <li><span></span>鼠标绘制点与折线</li>
            <li><span></span>多边形完成与清空</li>
          </ul>
          <ul v-else class="check-list">
            <li><span></span>Geometry、Texture 与 Program</li>
            <li><span></span>重复创建与显式释放</li>
            <li><span></span>RAF 暂停与上下文恢复</li>
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

    &.is-error {
      color: var(--lab-danger);
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

  .texture-parameter-panel,
  .projection-parameter-panel,
  .clipping-parameter-panel,
  .interaction-parameter-panel,
  .resource-parameter-panel {
    display: grid;
    gap: 12px;
    padding: 12px;
    margin-top: 14px;
    background: var(--lab-surface);
    border: 1px solid var(--lab-border);
    border-radius: 4px;
  }

  .projection-slider,
  .clipping-slider {
    min-width: 0;
  }

  .parameter-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
    font-size: 12px;
    color: var(--lab-muted);

    strong {
      font-family: Consolas, monospace;
      font-size: 12px;
      font-weight: 500;
      color: var(--lab-text);
    }
  }

  .projection-switches,
  .clipping-switches {
    display: grid;
    gap: 8px;
  }

  .target-field {
    .el-segmented {
      width: 100%;
    }
  }

  .interaction-command-row {
    .el-button {
      flex: 1;
      margin-left: 0;
    }
  }

  .resource-action-grid,
  .resource-context-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    .el-button {
      width: 100%;
      margin-left: 0;
    }
  }

  .resource-action-grid {
    .cycle-button {
      grid-column: 1 / -1;
    }
  }

  .texture-field-grid,
  .texture-switches {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .texture-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
    padding: 0 8px;
    font-size: 12px;
    border: 1px solid var(--lab-border);
    border-radius: 3px;
  }

  .texture-info,
  .projection-info,
  .clipping-info,
  .interaction-info,
  .resource-info {
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

  .resized-mark {
    margin-left: 5px;
    font-size: 10px;
    color: var(--lab-warning);
  }

  .texture-warnings {
    display: grid;
    gap: 6px;
    padding: 9px 10px 9px 26px;
    margin-top: 12px;
    font-size: 12px;
    line-height: 18px;
    color: var(--lab-warning);
    list-style: disc;
    background: color-mix(in srgb, var(--lab-warning) 8%, transparent);
    border-left: 2px solid var(--lab-warning);
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
