import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const PERSPECTIVE_POSITION = Object.freeze({ x: 8, y: 5.5, z: 10 })
const SCENE_TARGET = Object.freeze({ x: 0, y: 0.4, z: 0 })
const MAX_PIXEL_RATIO = 2
const ORTHOGRAPHIC_HEIGHT = 10
const MAX_IMAGE_PIXELS = 50_000_000

function createPatternCanvas({ transparent = false, jpeg = false } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 600
  const context = canvas.getContext('2d')

  if (!transparent) {
    context.fillStyle = jpeg ? '#17243a' : '#152033'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.fillStyle = '#2a8cff'
  context.fillRect(72, 72, 360, 210)
  context.fillStyle = '#ff9a2e'
  context.beginPath()
  context.arc(700, 220, 132, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 14
  context.strokeRect(110, 338, 720, 150)
  context.fillStyle = '#ffffff'
  context.font = '700 52px sans-serif'
  context.fillText(jpeg ? 'JPEG / TextureLoader' : 'CanvasTexture / sRGB', 150, 430)

  return canvas
}

function createLabelSprite(text, accentColor) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 96
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(15, 23, 42, 0.88)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = accentColor
  context.lineWidth = 5
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6)
  context.fillStyle = '#ffffff'
  context.font = '600 38px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.8, 0.54, 1)
  return sprite
}

export function createThreeScene(container, options = {}) {
  const { onStatusChange = () => {}, onStatsChange = () => {} } = options

  let renderer = null
  let scene = null
  let camera = null
  let perspectiveCamera = null
  let orthographicCamera = null
  let controls = null
  let primitivesGroup = null
  let textureGroup = null
  let animatedGroup = null
  let lightGroup = null
  let texturePlane = null
  let textureMaterial = null
  let currentTexture = null
  let resizeObserver = null
  let animationFrameId = 0
  let resizeFrameId = 0
  let lastStatsTime = 0
  let textureLoadVersion = 0
  let initialized = false
  let running = false
  let disposed = false
  let resumeAfterVisibility = false
  let resumeAfterContextRestore = false
  let cameraMode = 'perspective'
  let demoMode = 'primitives'
  let materialMode = 'standard'
  let transparentEnabled = false
  let depthTestEnabled = true

  const meshTargets = []
  const stateMaterials = new Set()
  const lineMaterials = new Set()

  const emitStatus = (status, message = '') => {
    onStatusChange({ status, running, message })
  }

  const emitStats = () => {
    if (!renderer) return

    onStatsChange({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    })
  }

  const renderNow = () => {
    if (!renderer || !scene || !camera || disposed) return
    controls?.update()
    renderer.render(scene, camera)
    emitStats()
  }

  const renderFrame = (time) => {
    if (!running || disposed || !renderer || !scene || !camera) return

    animationFrameId = requestAnimationFrame(renderFrame)
    const elapsedSeconds = time * 0.001

    if (animatedGroup && demoMode === 'primitives') {
      animatedGroup.rotation.y = elapsedSeconds * 0.18
      animatedGroup.position.y = Math.sin(elapsedSeconds * 0.8) * 0.06
    }

    controls?.update()
    renderer.render(scene, camera)

    // Renderer 指标按 500ms 降频同步，避免逐帧触发 Vue 更新。
    if (time - lastStatsTime >= 500) {
      lastStatsTime = time
      emitStats()
    }
  }

  const stopLoop = () => {
    running = false
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }

  const updateProjection = (width, height) => {
    const aspect = width / height
    perspectiveCamera.aspect = aspect
    perspectiveCamera.updateProjectionMatrix()

    const viewHeight = demoMode === 'textures' ? 7 : ORTHOGRAPHIC_HEIGHT
    orthographicCamera.left = (-viewHeight * aspect) / 2
    orthographicCamera.right = (viewHeight * aspect) / 2
    orthographicCamera.top = viewHeight / 2
    orthographicCamera.bottom = -viewHeight / 2
    orthographicCamera.updateProjectionMatrix()
  }

  const resize = () => {
    if (!renderer || !camera || disposed) return

    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
    renderer.setSize(width, height, false)
    updateProjection(width, height)
    lineMaterials.forEach((material) => material.resolution.set(width, height))

    if (!running) renderNow()
  }

  const scheduleResize = () => {
    if (resizeFrameId || disposed) return

    resizeFrameId = requestAnimationFrame(() => {
      resizeFrameId = 0
      resize()
    })
  }

  const configureControls = () => {
    controls?.dispose()
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 2
    controls.maxDistance = 32
    controls.maxPolarAngle = Math.PI * 0.49
    controls.enableRotate = cameraMode === 'perspective' && demoMode === 'primitives'
  }

  const resetCamera = () => {
    if (!camera || !controls || disposed) return

    if (demoMode === 'textures') {
      camera.position.set(0, 0.3, 10)
      camera.up.set(0, 1, 0)
      controls.target.set(0, 0.3, 0)
    } else if (cameraMode === 'orthographic') {
      camera.position.set(0, 12, 0.001)
      camera.up.set(0, 0, -1)
      controls.target.set(0, 0, 0)
    } else {
      camera.position.set(PERSPECTIVE_POSITION.x, PERSPECTIVE_POSITION.y, PERSPECTIVE_POSITION.z)
      camera.up.set(0, 1, 0)
      controls.target.set(SCENE_TARGET.x, SCENE_TARGET.y, SCENE_TARGET.z)
    }

    camera.zoom = 1
    camera.updateProjectionMatrix()
    controls.update()
    if (!running) renderNow()
  }

  const setCameraMode = (mode) => {
    if (!initialized || disposed || !['perspective', 'orthographic'].includes(mode)) return

    cameraMode = mode
    camera = mode === 'orthographic' ? orthographicCamera : perspectiveCamera
    configureControls()
    resize()
    resetCamera()
  }

  const setDemoMode = (mode) => {
    if (!initialized || disposed || !['primitives', 'textures'].includes(mode)) return

    demoMode = mode
    primitivesGroup.visible = mode === 'primitives'
    textureGroup.visible = mode === 'textures'
    controls.enableRotate = cameraMode === 'perspective' && mode === 'primitives'
    resize()
    resetCamera()
  }

  const pause = () => {
    resumeAfterVisibility = false
    stopLoop()
    emitStatus('已暂停')
  }

  const resume = () => {
    if (!initialized || disposed || running) return

    running = true
    emitStatus('运行正常')
    animationFrameId = requestAnimationFrame(renderFrame)
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      resumeAfterVisibility = running
      stopLoop()
      emitStatus('页面不可见，已暂停')
      return
    }

    if (resumeAfterVisibility) {
      resumeAfterVisibility = false
      resume()
    }
  }

  const handleContextLost = (event) => {
    event.preventDefault()
    resumeAfterContextRestore = running
    stopLoop()
    emitStatus('WebGL 上下文已丢失', 'WebGL 上下文已丢失，正在等待浏览器恢复。')
  }

  const handleContextRestored = () => {
    resize()
    emitStatus('WebGL 上下文已恢复')

    if (resumeAfterContextRestore) {
      resumeAfterContextRestore = false
      resume()
    }
  }

  const applyMaterialState = (material) => {
    material.transparent = transparentEnabled
    material.opacity = transparentEnabled ? 0.46 : 1
    material.depthWrite = !transparentEnabled
    material.depthTest = depthTestEnabled
    material.needsUpdate = true
  }

  const registerStateMaterial = (material) => {
    stateMaterials.add(material)
    applyMaterialState(material)
    return material
  }

  const createMeshMaterial = (color) => {
    const options = { color, side: THREE.DoubleSide }

    if (materialMode === 'basic') return registerStateMaterial(new THREE.MeshBasicMaterial(options))
    if (materialMode === 'lambert')
      return registerStateMaterial(new THREE.MeshLambertMaterial(options))

    return registerStateMaterial(
      new THREE.MeshStandardMaterial({ ...options, metalness: 0.16, roughness: 0.3 }),
    )
  }

  const setMaterialMode = (mode) => {
    if (!['standard', 'lambert', 'basic'].includes(mode) || materialMode === mode) return
    materialMode = mode

    meshTargets.forEach((mesh) => {
      const previousMaterial = mesh.material
      stateMaterials.delete(previousMaterial)
      mesh.material = createMeshMaterial(mesh.userData.validationColor)
      previousMaterial.dispose()
    })
    renderNow()
  }

  const setLightsEnabled = (enabled) => {
    if (!lightGroup) return
    lightGroup.visible = Boolean(enabled)
    renderNow()
  }

  const setTransparencyEnabled = (enabled) => {
    transparentEnabled = Boolean(enabled)
    stateMaterials.forEach(applyMaterialState)
    renderNow()
  }

  const setDepthTestEnabled = (enabled) => {
    depthTestEnabled = Boolean(enabled)
    stateMaterials.forEach(applyMaterialState)
    renderNow()
  }

  const createWideLine = () => {
    const geometry = new LineGeometry()
    geometry.setPositions([
      -4.2, -0.82, 2.6, -2.5, -0.72, 1.2, -0.4, -0.76, 2, 1.8, -0.7, 1.2, 4, -0.78, 2.4,
    ])
    const material = registerStateMaterial(
      new LineMaterial({ color: 0xff9a2e, linewidth: 5, worldUnits: false }),
    )
    lineMaterials.add(material)
    const line = new Line2(geometry, material)
    line.computeLineDistances()
    return line
  }

  const createPrimitives = () => {
    primitivesGroup = new THREE.Group()
    scene.add(primitivesGroup)

    lightGroup = new THREE.Group()
    const hemisphereLight = new THREE.HemisphereLight(0xb9dcff, 0x182132, 2.4)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.2)
    directionalLight.position.set(4, 7, 5)
    lightGroup.add(hemisphereLight, directionalLight)
    primitivesGroup.add(lightGroup)

    const grid = new THREE.GridHelper(20, 20, 0x2a8cff, 0x333e52)
    grid.position.y = -1.05
    primitivesGroup.add(grid)

    const axes = new THREE.AxesHelper(2.4)
    axes.position.set(-4.2, -1, 3.2)
    primitivesGroup.add(axes)

    const pointGeometry = new THREE.BufferGeometry()
    pointGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-3.8, 0.2, -0.8, -3.3, 1.1, -0.2, -2.9, 0.5, 0.6, -3.5, 1.8, 0.8, -2.6, 1.5, -0.9],
        3,
      ),
    )
    const pointMaterial = registerStateMaterial(
      new THREE.PointsMaterial({ color: 0x4cd263, size: 0.22, sizeAttenuation: true }),
    )
    primitivesGroup.add(new THREE.Points(pointGeometry, pointMaterial))

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4, 2.4, -1.2),
      new THREE.Vector3(-2.2, 2.9, 0.4),
      new THREE.Vector3(-0.4, 2.2, -0.5),
      new THREE.Vector3(1.3, 2.8, 0.8),
      new THREE.Vector3(3.8, 2.3, -0.6),
    ])
    const lineMaterial = registerStateMaterial(new THREE.LineBasicMaterial({ color: 0xffffff }))
    primitivesGroup.add(new THREE.Line(lineGeometry, lineMaterial), createWideLine())

    const shape = new THREE.Shape()
    shape.moveTo(-1.6, -1.1)
    shape.lineTo(0.2, -1.5)
    shape.lineTo(1.7, -0.2)
    shape.lineTo(0.7, 1.3)
    shape.lineTo(-1.2, 1.1)
    shape.closePath()
    const area = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      registerStateMaterial(
        new THREE.MeshBasicMaterial({
          color: 0x2a8cff,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
        }),
      ),
    )
    area.rotation.x = -Math.PI / 2
    area.scale.setScalar(0.7)
    area.position.set(-0.3, -1, -2.2)
    primitivesGroup.add(area)

    animatedGroup = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), createMeshMaterial(0x2a8cff))
    box.position.x = -1.25
    box.userData.validationColor = 0x2a8cff
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), createMeshMaterial(0xff9a2e))
    sphere.position.x = 1.35
    sphere.userData.validationColor = 0xff9a2e
    meshTargets.push(box, sphere)
    animatedGroup.add(box, sphere)
    primitivesGroup.add(animatedGroup)

    const planarLabel = createLabelSprite('2D 面 / Line2', '#2a8cff')
    planarLabel.position.set(0, -0.15, 3.3)
    const spatialLabel = createLabelSprite('3D Point / Mesh', '#ff9a2e')
    spatialLabel.position.set(0, 3.7, 0)
    primitivesGroup.add(planarLabel, spatialLabel)
  }

  const fitTexturePlane = (width, height) => {
    const aspect = Math.max(width, 1) / Math.max(height, 1)
    const maxWidth = 7.2
    const maxHeight = 4.6
    const planeWidth = Math.min(maxWidth, maxHeight * aspect)
    const planeHeight = planeWidth / aspect
    texturePlane.scale.set(planeWidth, planeHeight, 1)
  }

  const applyTexture = (texture) => {
    const width =
      texture.image?.naturalWidth || texture.image?.videoWidth || texture.image?.width || 1
    const height =
      texture.image?.naturalHeight || texture.image?.videoHeight || texture.image?.height || 1
    const maxTextureSize = renderer.capabilities.maxTextureSize

    // 在上传 GPU 前拦截异常分辨率，避免压缩图片解码后占用过量显存。
    if (width > maxTextureSize || height > maxTextureSize || width * height > MAX_IMAGE_PIXELS) {
      texture.dispose()
      throw new Error('图片分辨率超过当前验证场支持上限')
    }

    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
    currentTexture?.dispose()
    currentTexture = texture
    textureMaterial.map = texture
    textureMaterial.needsUpdate = true
    fitTexturePlane(width, height)
    renderNow()

    return { width, height }
  }

  const useCanvasTexture = () => {
    textureLoadVersion += 1
    const texture = new THREE.CanvasTexture(createPatternCanvas())
    return { ...applyTexture(texture), source: 'CanvasTexture' }
  }

  const loadTexture = (url, source = 'TextureLoader') => {
    const requestVersion = ++textureLoadVersion
    const loader = new THREE.TextureLoader()

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          if (disposed || requestVersion !== textureLoadVersion) {
            texture.dispose()
            reject(new Error('图片加载已失效'))
            return
          }

          try {
            resolve({ ...applyTexture(texture), source })
          } catch (error) {
            reject(error)
          }
        },
        undefined,
        () => {
          if (disposed || requestVersion !== textureLoadVersion) {
            reject(new Error('图片加载已失效'))
            return
          }

          reject(new Error('图片纹理加载失败'))
        },
      )
    })
  }

  const loadGeneratedJpegTexture = () => {
    const jpegUrl = createPatternCanvas({ jpeg: true }).toDataURL('image/jpeg', 0.9)
    return loadTexture(jpegUrl, 'JPEG / TextureLoader')
  }

  const createTexturePreview = () => {
    textureGroup = new THREE.Group()
    textureGroup.visible = false
    scene.add(textureGroup)

    const backplate = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    )
    backplate.position.z = -0.04
    backplate.scale.set(7.5, 4.9, 1)

    textureMaterial = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false })
    texturePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), textureMaterial)
    texturePlane.position.z = 0.02
    textureGroup.add(backplate, texturePlane)
    useCanvasTexture()
  }

  const init = () => {
    if (initialized || disposed) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111722)
    scene.fog = new THREE.Fog(0x111722, 15, 30)

    perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
    camera = perspectiveCamera

    // Renderer 使用新版颜色空间配置，并限制 DPR 避免高分屏填充率失控。
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(renderer.domElement)

    configureControls()
    createPrimitives()
    createTexturePreview()
    resize()
    resetCamera()
    renderNow()

    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored)

    initialized = true
    emitStatus('初始化完成')
  }

  const disposeMaterial = (material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) value.dispose()
    })
    material.dispose()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    textureLoadVersion += 1
    stopLoop()

    if (resizeFrameId) cancelAnimationFrame(resizeFrameId)
    resizeFrameId = 0
    resizeObserver?.disconnect()
    document.removeEventListener('visibilitychange', handleVisibilityChange)

    if (renderer) {
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored)
    }

    controls?.dispose()
    scene?.traverse((object) => {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial)
      else if (object.material) disposeMaterial(object.material)
    })
    scene?.clear()

    if (renderer) {
      renderer.renderLists.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }

    meshTargets.length = 0
    stateMaterials.clear()
    lineMaterials.clear()
    renderer = null
    scene = null
    camera = null
    perspectiveCamera = null
    orthographicCamera = null
    controls = null
    primitivesGroup = null
    textureGroup = null
    animatedGroup = null
    lightGroup = null
    texturePlane = null
    textureMaterial = null
    currentTexture = null
    resizeObserver = null
    initialized = false
    emitStatus('已销毁')
  }

  return {
    init,
    start: resume,
    pause,
    resume,
    resize,
    resetCamera,
    setCameraMode,
    setDemoMode,
    setMaterialMode,
    setLightsEnabled,
    setTransparencyEnabled,
    setDepthTestEnabled,
    loadTexture,
    loadGeneratedJpegTexture,
    useCanvasTexture,
    dispose,
  }
}
