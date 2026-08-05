import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const PERSPECTIVE_POSITION = Object.freeze({ x: 8, y: 5.5, z: 10 })
const SCENE_TARGET = Object.freeze({ x: 0, y: 0.4, z: 0 })
const MAX_PIXEL_RATIO = 2
const ORTHOGRAPHIC_HEIGHT = 10
const MAX_DRAW_POINTS = 200
const CLICK_DRAG_THRESHOLD = 4
const RESOURCE_BATCH_SIZE = 12
const RESOURCE_CYCLE_COUNT = 10
const LARGE_FILE_BYTES = 20 * 1024 * 1024
const LARGE_IMAGE_PIXELS = 50_000_000

const TEXTURE_WRAPPINGS = Object.freeze({
  clamp: THREE.ClampToEdgeWrapping,
  repeat: THREE.RepeatWrapping,
  mirrored: THREE.MirroredRepeatWrapping,
})
const PROJECTION_DIRECTIONS = Object.freeze({
  front: Object.freeze({ x: 0, y: 0, z: 1 }),
  diagonal: Object.freeze({ x: 1, y: 0.55, z: 1 }),
  overhead: Object.freeze({ x: 0, y: 1, z: 0.35 }),
})

const PROJECTION_VERTEX_SHADER = /* glsl */ `
  uniform mat4 projectorMatrix;

  varying vec4 vProjectorCoordinate;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vProjectorCoordinate = projectorMatrix * worldPosition;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const PROJECTION_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D projectedTexture;
  uniform vec3 projectorDirection;
  uniform vec3 baseColor;
  uniform bool projectionEnabled;

  varying vec4 vProjectorCoordinate;
  varying vec3 vWorldNormal;

  void main() {
    vec3 color = baseColor;
    vec3 projected = vProjectorCoordinate.xyz / vProjectorCoordinate.w;
    bool inFrustum = vProjectorCoordinate.w > 0.0
      && projected.x >= 0.0 && projected.x <= 1.0
      && projected.y >= 0.0 && projected.y <= 1.0
      && projected.z >= 0.0 && projected.z <= 1.0;
    float facingProjector = dot(normalize(vWorldNormal), -normalize(projectorDirection));

    if (projectionEnabled && inFrustum && facingProjector > 0.02) {
      vec4 projectedColor = texture2D(projectedTexture, projected.xy);
      color = mix(color, projectedColor.rgb, projectedColor.a);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

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
  const {
    onStatusChange = () => {},
    onStatsChange = () => {},
    onInteractionChange = () => {},
    onResourceChange = () => {},
  } = options

  let renderer = null
  let scene = null
  let camera = null
  let perspectiveCamera = null
  let orthographicCamera = null
  let controls = null
  let primitivesGroup = null
  let textureGroup = null
  let projectionGroup = null
  let clippingGroup = null
  let interactionGroup = null
  let interactionTargetsGroup = null
  let interactionDrawingGroup = null
  let resourceGroup = null
  let animatedGroup = null
  let lightGroup = null
  let texturePreviewMesh = null
  let textureBackplate = null
  let textureMaterial = null
  let projectionMesh = null
  let projectionMaterial = null
  let projectorCamera = null
  let projectorHelper = null
  let clippingMesh = null
  let clippingMaterial = null
  let clippingPlane = null
  let clippingPlaneHelper = null
  let interactionPointObject = null
  let interactionLineObject = null
  let interactionPolygonObject = null
  let interactionSelectedMesh = null
  let currentTexture = null
  let currentTextureMetadata = null
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
  let textureTarget = 'plane'
  let textureWrapping = 'clamp'
  let textureRepeat = 1
  let textureFilter = 'mipmap'
  let textureMipmapsEnabled = true
  let textureFlipY = true
  let textureAnisotropy = 'max'
  let projectionTarget = 'box'
  let projectionDirection = 'front'
  let projectionFov = 38
  let projectionDistance = 8
  let projectionEnabled = true
  let projectionHelperEnabled = false
  let clippingTarget = 'box'
  let clippingAxis = 'x'
  let clippingOffset = 0
  let clippingInverted = false
  let clippingEnabled = true
  let clippingHelperEnabled = true
  let interactionMode = 'picking'
  let interactionDrawingFinished = false
  let interactionStatus = '等待拾取'
  let interactionLastPoint = null
  let pointerDownValid = false
  let renderedFrameCount = 0
  let resourceCycleCount = 0
  let resourceContextLost = false
  let resourceStatus = '等待记录基线'
  let resourceBaseline = null
  let resourceBaselineNeedsRefresh = false

  const meshTargets = []
  const stateMaterials = new Set()
  const lineMaterials = new Set()
  const interactionPickTargets = []
  const interactionDrawPoints = []
  const resourceMeshes = []
  const interactionRaycaster = new THREE.Raycaster()
  const interactionPointer = new THREE.Vector2()
  const interactionDrawingPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const interactionIntersection = new THREE.Vector3()
  const pointerDownPosition = new THREE.Vector2()
  const pointerUpPosition = new THREE.Vector2()
  const projectorMatrix = new THREE.Matrix4()
  const projectorDirectionVector = new THREE.Vector3()
  const projectorBiasMatrix = new THREE.Matrix4().set(
    0.5,
    0,
    0,
    0.5,
    0,
    0.5,
    0,
    0.5,
    0,
    0,
    0.5,
    0.5,
    0,
    0,
    0,
    1,
  )

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
      programs: renderer.info.programs?.length || 0,
      frames: renderedFrameCount,
    })
  }

  const renderNow = () => {
    if (!renderer || !scene || !camera || disposed) return
    controls?.update()
    renderer.render(scene, camera)
    renderedFrameCount += 1
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

    if (texturePreviewMesh && demoMode === 'textures' && textureTarget !== 'plane') {
      texturePreviewMesh.rotation.y = elapsedSeconds * 0.22
    }

    controls?.update()
    renderer.render(scene, camera)
    renderedFrameCount += 1

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
    controls.enableRotate =
      cameraMode === 'perspective' &&
      (demoMode === 'primitives' ||
        (demoMode === 'textures' && textureTarget !== 'plane') ||
        demoMode === 'projection' ||
        demoMode === 'clipping' ||
        demoMode === 'interaction' ||
        demoMode === 'resources')
  }

  const resetCamera = () => {
    if (!camera || !controls || disposed) return

    if (demoMode === 'textures') {
      camera.position.set(0, 0.3, 10)
      camera.up.set(0, 1, 0)
      controls.target.set(0, 0.3, 0)
    } else if (
      demoMode === 'projection' ||
      demoMode === 'clipping' ||
      demoMode === 'interaction' ||
      demoMode === 'resources'
    ) {
      camera.position.set(PERSPECTIVE_POSITION.x, PERSPECTIVE_POSITION.y, PERSPECTIVE_POSITION.z)
      camera.up.set(0, 1, 0)
      controls.target.set(0, 0, 0)
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
    if (
      !initialized ||
      disposed ||
      !['primitives', 'textures', 'projection', 'clipping', 'interaction', 'resources'].includes(
        mode,
      )
    )
      return

    demoMode = mode
    primitivesGroup.visible = mode === 'primitives'
    textureGroup.visible = mode === 'textures'
    projectionGroup.visible = mode === 'projection'
    clippingGroup.visible = mode === 'clipping'
    interactionGroup.visible = mode === 'interaction'
    resourceGroup.visible = mode === 'resources'
    controls.enableRotate =
      cameraMode === 'perspective' &&
      (mode === 'primitives' ||
        (mode === 'textures' && textureTarget !== 'plane') ||
        mode === 'projection' ||
        mode === 'clipping' ||
        mode === 'interaction' ||
        mode === 'resources')
    renderer.domElement.style.cursor =
      mode === 'interaction' ? (interactionMode === 'picking' ? 'pointer' : 'crosshair') : 'grab'
    resize()
    resetCamera()
    if (mode === 'resources' && !resourceBaseline && !resourceBaselineNeedsRefresh) {
      captureResourceBaseline()
    }
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
    resourceContextLost = true
    // 上下文丢失后 renderer.info 会重置，旧基线不能再用于资源泄漏判断。
    resourceBaseline = null
    resourceBaselineNeedsRefresh = true
    resourceStatus = 'WebGL 上下文已丢失'
    stopLoop()
    emitStatus('WebGL 上下文已丢失', 'WebGL 上下文已丢失，正在等待浏览器恢复。')
    emitResource()
  }

  const handleContextRestored = () => {
    resourceContextLost = false
    resourceStatus = 'WebGL 上下文已恢复'
    resize()
    emitStatus('WebGL 上下文已恢复')
    emitResource()

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

  const fitTextureTarget = (width, height) => {
    if (textureTarget !== 'plane') {
      texturePreviewMesh.scale.setScalar(1)
      return
    }

    const aspect = Math.max(width, 1) / Math.max(height, 1)
    const maxWidth = 7.2
    const maxHeight = 4.6
    const planeWidth = Math.min(maxWidth, maxHeight * aspect)
    const planeHeight = planeWidth / aspect
    texturePreviewMesh.scale.set(planeWidth, planeHeight, 1)
  }

  const createTextureGeometry = (target) => {
    if (target === 'box') return new THREE.BoxGeometry(3.2, 3.2, 3.2)
    if (target === 'sphere') return new THREE.SphereGeometry(2, 64, 40)
    return new THREE.PlaneGeometry(1, 1)
  }

  const configureTexture = (texture) => {
    const wrapping = TEXTURE_WRAPPINGS[textureWrapping]
    texture.wrapS = wrapping
    texture.wrapT = wrapping
    texture.repeat.set(textureRepeat, textureRepeat)
    texture.generateMipmaps = textureMipmapsEnabled
    texture.flipY = textureFlipY
    texture.anisotropy = textureAnisotropy === 'max' ? renderer.capabilities.getMaxAnisotropy() : 1

    if (textureFilter === 'nearest') {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
    } else if (textureFilter === 'mipmap' && textureMipmapsEnabled) {
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearMipmapLinearFilter
    } else {
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearFilter
    }

    texture.needsUpdate = true
  }

  const getCurrentTextureInfo = () => {
    if (!currentTextureMetadata) return null

    const { fileSize, width, height, uploadWidth, uploadHeight } = currentTextureMetadata
    const warnings = []

    if (fileSize > LARGE_FILE_BYTES) warnings.push('文件超过 20 MB，仅作为压力测试风险提示。')
    if (width * height > LARGE_IMAGE_PIXELS) {
      warnings.push('原图超过 5000 万像素，浏览器解码内存和耗时可能显著增加。')
    }
    if (uploadWidth !== width || uploadHeight !== height) {
      warnings.push('原图超过 GPU 纹理尺寸，Three.js 上传时将按比例缩放。')
    }

    const mipmapFactor = currentTexture?.generateMipmaps ? 4 / 3 : 1

    return {
      ...currentTextureMetadata,
      decodedBytes: width * height * 4,
      estimatedGpuBytes: Math.round(uploadWidth * uploadHeight * 4 * mipmapFactor),
      resized: uploadWidth !== width || uploadHeight !== height,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      warnings,
    }
  }

  const refreshCurrentTexture = () => {
    if (!currentTexture) return null
    configureTexture(currentTexture)
    textureMaterial.needsUpdate = true
    renderNow()
    return getCurrentTextureInfo()
  }

  const applyTexture = (texture, metadata = {}) => {
    const width =
      texture.image?.naturalWidth || texture.image?.videoWidth || texture.image?.width || 1
    const height =
      texture.image?.naturalHeight || texture.image?.videoHeight || texture.image?.height || 1
    const maxTextureSize = renderer.capabilities.maxTextureSize
    const uploadScale = Math.min(1, maxTextureSize / Math.max(width, height))
    const uploadWidth = Math.max(1, Math.floor(width * uploadScale))
    const uploadHeight = Math.max(1, Math.floor(height * uploadScale))

    texture.colorSpace = THREE.SRGBColorSpace
    configureTexture(texture)
    currentTexture?.dispose()
    currentTexture = texture
    currentTextureMetadata = {
      source: metadata.source || 'TextureLoader',
      fileSize: metadata.fileSize ?? null,
      width,
      height,
      uploadWidth,
      uploadHeight,
      maxTextureSize,
      loadDuration: metadata.loadDuration ?? 0,
    }
    textureMaterial.map = texture
    textureMaterial.needsUpdate = true
    if (projectionMaterial) projectionMaterial.uniforms.projectedTexture.value = texture
    fitTextureTarget(width, height)
    updateProjector()
    renderNow()

    return getCurrentTextureInfo()
  }

  const useCanvasTexture = () => {
    textureLoadVersion += 1
    const texture = new THREE.CanvasTexture(createPatternCanvas())
    return applyTexture(texture, { source: 'CanvasTexture' })
  }

  const loadTexture = (url, source = 'TextureLoader', metadata = {}) => {
    const requestVersion = ++textureLoadVersion
    const loader = new THREE.TextureLoader()
    const startedAt = performance.now()

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
            applyTexture(texture, { ...metadata, source })
            // 首次 renderNow 会触发纹理上传，耗时需要覆盖加载、解码和首次 GPU 提交。
            currentTextureMetadata.loadDuration = performance.now() - startedAt
            resolve(getCurrentTextureInfo())
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

  const setTextureTarget = (target) => {
    if (!['plane', 'box', 'sphere'].includes(target) || !texturePreviewMesh) return

    textureTarget = target
    const previousGeometry = texturePreviewMesh.geometry
    texturePreviewMesh.geometry = createTextureGeometry(target)
    previousGeometry.dispose()
    texturePreviewMesh.rotation.set(target === 'plane' ? 0 : -0.18, 0, 0)
    textureBackplate.visible = target === 'plane'
    controls.enableRotate =
      cameraMode === 'perspective' &&
      (demoMode === 'primitives' ||
        (demoMode === 'textures' && textureTarget !== 'plane') ||
        demoMode === 'projection' ||
        demoMode === 'clipping' ||
        demoMode === 'interaction')
    fitTextureTarget(currentTextureMetadata?.width || 1, currentTextureMetadata?.height || 1)
    renderNow()
  }

  const setTextureWrapping = (wrapping) => {
    if (!Object.hasOwn(TEXTURE_WRAPPINGS, wrapping)) return null
    textureWrapping = wrapping
    return refreshCurrentTexture()
  }

  const setTextureRepeat = (repeat) => {
    if (![1, 2, 4].includes(Number(repeat))) return null
    textureRepeat = Number(repeat)
    return refreshCurrentTexture()
  }

  const setTextureFilters = (filter) => {
    if (!['linear', 'nearest', 'mipmap'].includes(filter)) return null
    textureFilter = filter
    return refreshCurrentTexture()
  }

  const setTextureMipmaps = (enabled) => {
    textureMipmapsEnabled = Boolean(enabled)
    return refreshCurrentTexture()
  }

  const setTextureFlipY = (enabled) => {
    textureFlipY = Boolean(enabled)
    return refreshCurrentTexture()
  }

  const setTextureAnisotropy = (value) => {
    if (!['1', 'max'].includes(String(value))) return null
    textureAnisotropy = String(value)
    return refreshCurrentTexture()
  }

  const createTexturePreview = () => {
    textureGroup = new THREE.Group()
    textureGroup.visible = false
    scene.add(textureGroup)

    textureBackplate = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    )
    textureBackplate.position.z = -0.04
    textureBackplate.scale.set(7.5, 4.9, 1)

    textureMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    texturePreviewMesh = new THREE.Mesh(createTextureGeometry(textureTarget), textureMaterial)
    texturePreviewMesh.position.z = 0.02
    textureGroup.add(textureBackplate, texturePreviewMesh)
    useCanvasTexture()
  }

  const createProjectionGeometry = (target) => {
    if (target === 'plane') return new THREE.PlaneGeometry(6, 4)
    if (target === 'sphere') return new THREE.SphereGeometry(2.35, 64, 40)
    return new THREE.BoxGeometry(4.2, 4.2, 4.2)
  }

  function updateProjector() {
    if (!projectorCamera || !projectionMaterial) return

    const direction = PROJECTION_DIRECTIONS[projectionDirection]
    projectorDirectionVector.set(direction.x, direction.y, direction.z).normalize()
    projectorCamera.position.copy(projectorDirectionVector).multiplyScalar(projectionDistance)
    projectorCamera.fov = projectionFov
    projectorCamera.aspect =
      Math.max(currentTextureMetadata?.width || 1, 1) /
      Math.max(currentTextureMetadata?.height || 1, 1)
    projectorCamera.far = projectionDistance + 12
    projectorCamera.lookAt(0, 0, 0)
    projectorCamera.updateProjectionMatrix()
    projectorCamera.updateMatrixWorld(true)

    projectorMatrix
      .copy(projectorBiasMatrix)
      .multiply(projectorCamera.projectionMatrix)
      .multiply(projectorCamera.matrixWorldInverse)
    projectorCamera.getWorldDirection(projectorDirectionVector)
    projectionMaterial.uniforms.projectorMatrix.value.copy(projectorMatrix)
    projectionMaterial.uniforms.projectorDirection.value.copy(projectorDirectionVector)
    projectorHelper?.update()
  }

  const setProjectionTarget = (target) => {
    if (!['plane', 'box', 'sphere'].includes(target) || !projectionMesh) return

    projectionTarget = target
    const previousGeometry = projectionMesh.geometry
    projectionMesh.geometry = createProjectionGeometry(target)
    previousGeometry.dispose()
    renderNow()
  }

  const setProjectionDirection = (direction) => {
    if (!Object.hasOwn(PROJECTION_DIRECTIONS, direction)) return
    projectionDirection = direction
    updateProjector()
    renderNow()
  }

  const setProjectionFov = (fov) => {
    const nextFov = Number(fov)
    if (!Number.isFinite(nextFov) || nextFov < 20 || nextFov > 80) return
    projectionFov = nextFov
    updateProjector()
    renderNow()
  }

  const setProjectionDistance = (distance) => {
    const nextDistance = Number(distance)
    if (!Number.isFinite(nextDistance) || nextDistance < 5 || nextDistance > 14) return
    projectionDistance = nextDistance
    updateProjector()
    renderNow()
  }

  const setProjectionEnabled = (enabled) => {
    projectionEnabled = Boolean(enabled)
    if (projectionMaterial) projectionMaterial.uniforms.projectionEnabled.value = projectionEnabled
    renderNow()
  }

  const setProjectionHelperEnabled = (enabled) => {
    projectionHelperEnabled = Boolean(enabled)
    if (!projectorHelper) return
    projectorHelper.visible = projectionHelperEnabled
    renderNow()
  }

  const createProjectionPreview = () => {
    projectionGroup = new THREE.Group()
    projectionGroup.visible = false
    scene.add(projectionGroup)

    projectorCamera = new THREE.PerspectiveCamera(projectionFov, 1, 0.1, 20)
    projectionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        projectedTexture: { value: currentTexture },
        projectorMatrix: { value: new THREE.Matrix4() },
        projectorDirection: { value: new THREE.Vector3(0, 0, -1) },
        baseColor: { value: new THREE.Color(0x243247) },
        projectionEnabled: { value: projectionEnabled },
      },
      vertexShader: PROJECTION_VERTEX_SHADER,
      fragmentShader: PROJECTION_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
    })
    projectionMesh = new THREE.Mesh(createProjectionGeometry(projectionTarget), projectionMaterial)
    projectorHelper = new THREE.CameraHelper(projectorCamera)
    projectorHelper.visible = projectionHelperEnabled
    projectionGroup.add(projectionMesh, projectorHelper)
    updateProjector()
  }

  const createClippingGeometry = (target) => {
    if (target === 'sphere') return new THREE.SphereGeometry(2.45, 64, 40)
    if (target === 'torusKnot') return new THREE.TorusKnotGeometry(1.65, 0.58, 160, 24)
    return new THREE.BoxGeometry(4.2, 4.2, 4.2, 8, 8, 8)
  }

  const updateClippingPlane = () => {
    if (!clippingPlane) return

    const direction = clippingInverted ? -1 : 1
    const normal =
      clippingAxis === 'y'
        ? new THREE.Vector3(0, direction, 0)
        : clippingAxis === 'z'
          ? new THREE.Vector3(0, 0, direction)
          : new THREE.Vector3(direction, 0, 0)

    // Plane 的 constant 与法向量同时更新，使反向后裁切位置保持不变。
    clippingPlane.set(normal, -direction * clippingOffset)
    clippingPlaneHelper?.updateMatrixWorld(true)
  }

  const setClippingTarget = (target) => {
    if (!['box', 'sphere', 'torusKnot'].includes(target) || !clippingMesh) return

    clippingTarget = target
    const previousGeometry = clippingMesh.geometry
    clippingMesh.geometry = createClippingGeometry(target)
    previousGeometry.dispose()
    renderNow()
  }

  const setClippingAxis = (axis) => {
    if (!['x', 'y', 'z'].includes(axis)) return
    clippingAxis = axis
    updateClippingPlane()
    renderNow()
  }

  const setClippingOffset = (offset) => {
    const nextOffset = Number(offset)
    if (!Number.isFinite(nextOffset) || nextOffset < -2.5 || nextOffset > 2.5) return
    clippingOffset = nextOffset
    updateClippingPlane()
    renderNow()
  }

  const setClippingInverted = (inverted) => {
    clippingInverted = Boolean(inverted)
    updateClippingPlane()
    renderNow()
  }

  const setClippingEnabled = (enabled) => {
    clippingEnabled = Boolean(enabled)
    if (!clippingMaterial || !clippingPlane) return
    clippingMaterial.clippingPlanes = clippingEnabled ? [clippingPlane] : []
    clippingMaterial.needsUpdate = true
    renderNow()
  }

  const setClippingHelperEnabled = (enabled) => {
    clippingHelperEnabled = Boolean(enabled)
    if (!clippingPlaneHelper) return
    clippingPlaneHelper.visible = clippingHelperEnabled
    renderNow()
  }

  const createClippingPreview = () => {
    clippingGroup = new THREE.Group()
    clippingGroup.visible = false
    scene.add(clippingGroup)

    clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    clippingMaterial = new THREE.MeshNormalMaterial({
      clippingPlanes: clippingEnabled ? [clippingPlane] : [],
      clipShadows: true,
      side: THREE.DoubleSide,
    })
    clippingMesh = new THREE.Mesh(createClippingGeometry(clippingTarget), clippingMaterial)
    clippingPlaneHelper = new THREE.PlaneHelper(clippingPlane, 7, 0xff9a2e)
    clippingPlaneHelper.visible = clippingHelperEnabled
    clippingGroup.add(clippingMesh, clippingPlaneHelper)
    updateClippingPlane()
  }

  const formatInteractionPoint = (point) =>
    point
      ? {
          x: Number(point.x.toFixed(3)),
          y: Number(point.y.toFixed(3)),
          z: Number(point.z.toFixed(3)),
        }
      : null

  const emitInteraction = () => {
    onInteractionChange({
      mode: interactionMode,
      selectedName: interactionSelectedMesh?.userData.validationName || '',
      hitPoint: formatInteractionPoint(interactionLastPoint),
      pointCount: interactionDrawPoints.length,
      finished: interactionDrawingFinished,
      status: interactionStatus,
    })
  }

  const replaceInteractionGeometry = (object, geometry) => {
    if (!object) return
    const previousGeometry = object.geometry
    object.geometry = geometry
    // 绘制结果更新后立即释放旧 Geometry，避免多次绘制导致 GPU 资源累积。
    previousGeometry.dispose()
  }

  const updateInteractionDrawingObjects = () => {
    if (!interactionPointObject || !interactionLineObject || !interactionPolygonObject) return

    replaceInteractionGeometry(
      interactionPointObject,
      new THREE.BufferGeometry().setFromPoints(interactionDrawPoints),
    )
    interactionPointObject.visible = interactionDrawPoints.length > 0

    const linePoints = [...interactionDrawPoints]
    if (interactionMode === 'polygon' && interactionDrawingFinished && linePoints.length >= 3) {
      linePoints.push(interactionDrawPoints[0])
    }
    replaceInteractionGeometry(
      interactionLineObject,
      new THREE.BufferGeometry().setFromPoints(linePoints),
    )
    interactionLineObject.visible = interactionMode !== 'point' && linePoints.length >= 2

    const polygonGeometry = new THREE.BufferGeometry()
    if (
      interactionMode === 'polygon' &&
      interactionDrawingFinished &&
      interactionDrawPoints.length >= 3
    ) {
      const shapePoints = interactionDrawPoints.map((point) => new THREE.Vector2(point.x, point.z))
      const triangleIndices = THREE.ShapeUtils.triangulateShape(shapePoints, []).flat()
      polygonGeometry.setFromPoints(interactionDrawPoints)
      polygonGeometry.setIndex(triangleIndices)
      polygonGeometry.computeVertexNormals()
    }
    replaceInteractionGeometry(interactionPolygonObject, polygonGeometry)
    interactionPolygonObject.visible = polygonGeometry.index?.count > 0
  }

  const clearInteractionSelection = () => {
    interactionPickTargets.forEach((mesh) => {
      mesh.material.emissive.setHex(0x000000)
      mesh.material.emissiveIntensity = 0
    })
    interactionSelectedMesh = null
  }

  const clearInteractionDrawing = (shouldEmit = true) => {
    clearInteractionSelection()
    interactionDrawPoints.length = 0
    interactionDrawingFinished = false
    interactionLastPoint = null
    interactionStatus = interactionMode === 'picking' ? '等待拾取' : '等待绘制'
    updateInteractionDrawingObjects()
    if (shouldEmit) emitInteraction()
    renderNow()
  }

  const setInteractionMode = (mode) => {
    if (!['picking', 'point', 'line', 'polygon'].includes(mode)) return

    interactionMode = mode
    clearInteractionSelection()
    clearInteractionDrawing(false)
    if (interactionTargetsGroup) interactionTargetsGroup.visible = mode === 'picking'
    if (interactionDrawingGroup) interactionDrawingGroup.visible = mode !== 'picking'
    if (renderer && demoMode === 'interaction') {
      renderer.domElement.style.cursor = mode === 'picking' ? 'pointer' : 'crosshair'
    }
    emitInteraction()
    renderNow()
  }

  const finishInteractionDrawing = () => {
    const minimumPoints = interactionMode === 'polygon' ? 3 : interactionMode === 'line' ? 2 : 1
    if (interactionMode === 'picking' || interactionDrawPoints.length < minimumPoints) {
      interactionStatus = '绘制点数不足'
      emitInteraction()
      return false
    }

    interactionDrawingFinished = true
    interactionStatus = '绘制完成'
    updateInteractionDrawingObjects()
    emitInteraction()
    renderNow()
    return true
  }

  const setInteractionRay = (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    interactionPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    interactionRaycaster.setFromCamera(interactionPointer, camera)
  }

  const pickInteractionTarget = (event) => {
    setInteractionRay(event)
    const [intersection] = interactionRaycaster.intersectObjects(interactionPickTargets, false)
    clearInteractionSelection()

    if (!intersection) {
      interactionLastPoint = null
      interactionStatus = '未命中对象'
      emitInteraction()
      renderNow()
      return
    }

    interactionSelectedMesh = intersection.object
    interactionSelectedMesh.material.emissive.setHex(0x2a8cff)
    interactionSelectedMesh.material.emissiveIntensity = 0.85
    interactionLastPoint = intersection.point.clone()
    interactionStatus = '拾取成功'
    emitInteraction()
    renderNow()
  }

  const appendInteractionPoint = (event) => {
    setInteractionRay(event)
    if (
      !interactionRaycaster.ray.intersectPlane(interactionDrawingPlane, interactionIntersection)
    ) {
      return
    }

    if (interactionDrawingFinished) clearInteractionDrawing(false)
    if (interactionDrawPoints.length >= MAX_DRAW_POINTS) {
      interactionStatus = `最多绘制 ${MAX_DRAW_POINTS} 个点`
      emitInteraction()
      return
    }

    const point = interactionIntersection.clone()
    point.y = 0.04
    interactionDrawPoints.push(point)
    interactionLastPoint = point
    interactionStatus = interactionMode === 'point' ? '已添加点' : '绘制中'
    updateInteractionDrawingObjects()
    emitInteraction()
    renderNow()
  }

  const handleInteractionPointerDown = (event) => {
    pointerDownValid = demoMode === 'interaction' && event.button === 0
    if (pointerDownValid) pointerDownPosition.set(event.clientX, event.clientY)
  }

  const handleInteractionPointerUp = (event) => {
    if (!pointerDownValid || event.button !== 0) return
    pointerDownValid = false
    pointerUpPosition.set(event.clientX, event.clientY)
    // 只有短距离点击才触发拾取或绘制，OrbitControls 拖动不会误添加节点。
    const movement = pointerDownPosition.distanceTo(pointerUpPosition)
    if (movement > CLICK_DRAG_THRESHOLD || demoMode !== 'interaction') return

    if (interactionMode === 'picking') pickInteractionTarget(event)
    else appendInteractionPoint(event)
  }

  const handleInteractionPointerCancel = () => {
    pointerDownValid = false
  }

  const createInteractionTarget = (name, geometry, color, x) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: 0x000000,
      emissiveIntensity: 0,
      metalness: 0.12,
      roughness: 0.32,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, 1.35, 0)
    mesh.userData.validationName = name
    interactionPickTargets.push(mesh)
    return mesh
  }

  const createInteractionPreview = () => {
    interactionGroup = new THREE.Group()
    interactionGroup.visible = false
    scene.add(interactionGroup)

    interactionTargetsGroup = new THREE.Group()
    const hemisphereLight = new THREE.HemisphereLight(0xb9dcff, 0x182132, 2.5)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3)
    directionalLight.position.set(4, 7, 5)
    interactionTargetsGroup.add(
      hemisphereLight,
      directionalLight,
      createInteractionTarget('Box', new THREE.BoxGeometry(2, 2, 2), 0x2a8cff, -3),
      createInteractionTarget('Sphere', new THREE.SphereGeometry(1.2, 48, 32), 0xff9a2e, 0),
      createInteractionTarget(
        'TorusKnot',
        new THREE.TorusKnotGeometry(0.85, 0.28, 120, 20),
        0x4cd263,
        3,
      ),
    )

    interactionDrawingGroup = new THREE.Group()
    interactionDrawingGroup.visible = false
    const drawingSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({
        color: 0x2a8cff,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    drawingSurface.rotation.x = -Math.PI / 2
    drawingSurface.position.y = -0.01
    const grid = new THREE.GridHelper(14, 14, 0x2a8cff, 0x333e52)
    interactionPointObject = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xff9a2e, size: 0.2, sizeAttenuation: true }),
    )
    interactionLineObject = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    )
    interactionPolygonObject = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x2a8cff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    interactionDrawingGroup.add(
      drawingSurface,
      grid,
      interactionPolygonObject,
      interactionLineObject,
      interactionPointObject,
    )
    interactionGroup.add(interactionTargetsGroup, interactionDrawingGroup)
    emitInteraction()
  }

  const readResourceMetrics = () => ({
    geometries: renderer?.info.memory.geometries || 0,
    textures: renderer?.info.memory.textures || 0,
    programs: renderer?.info.programs?.length || 0,
  })

  const emitResource = () => {
    onResourceChange({
      activeObjects: resourceMeshes.length,
      cycleCount: resourceCycleCount,
      contextLost: resourceContextLost,
      status: resourceStatus,
      baseline: resourceBaseline ? { ...resourceBaseline } : null,
      current: readResourceMetrics(),
    })
  }

  const captureResourceBaseline = () => {
    if (!renderer || disposed || resourceMeshes.length || resourceBaselineNeedsRefresh) return null
    renderNow()
    resourceBaseline = readResourceMetrics()
    resourceStatus = '基线已记录'
    emitResource()
    return { ...resourceBaseline }
  }

  const createResourceTexture = (index) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    const hue = (index * 37) % 360
    context.fillStyle = `hsl(${hue} 72% 50%)`
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = 'rgba(255, 255, 255, 0.72)'
    context.fillRect(8, 8, 20, 20)
    context.fillRect(36, 36, 20, 20)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  const createResourceGeometry = (index) => {
    if (index % 3 === 1) return new THREE.SphereGeometry(0.62, 24, 16)
    if (index % 3 === 2) return new THREE.TorusGeometry(0.48, 0.2, 16, 32)
    return new THREE.BoxGeometry(1, 1, 1)
  }

  const createResourceMaterial = (index, texture) => {
    const options = { map: texture, color: 0xffffff }
    if (index % 3 === 1) return new THREE.MeshLambertMaterial(options)
    if (index % 3 === 2) {
      return new THREE.MeshStandardMaterial({ ...options, metalness: 0.12, roughness: 0.36 })
    }
    return new THREE.MeshBasicMaterial({ ...options, toneMapped: false })
  }

  const releaseResourceBatch = (shouldEmit = true) => {
    resourceMeshes.forEach((mesh) => {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.map?.dispose()
      mesh.material.dispose()
    })
    resourceMeshes.length = 0
    renderNow()
    if (resourceBaselineNeedsRefresh && !resourceContextLost) {
      // 先让新版渲染器完成内部纹理预热，再以释放后的实际数量重建基线。
      resourceBaseline = readResourceMetrics()
      resourceBaselineNeedsRefresh = false
    }
    if (shouldEmit) {
      resourceStatus = '测试资源已释放'
      emitResource()
    }
  }

  const createResourceBatch = (shouldEmit = true) => {
    if (!resourceGroup || disposed || resourceContextLost) return
    if (resourceMeshes.length) releaseResourceBatch(false)
    if (!resourceBaseline && !resourceBaselineNeedsRefresh) captureResourceBaseline()

    for (let index = 0; index < RESOURCE_BATCH_SIZE; index += 1) {
      const texture = createResourceTexture(index)
      const mesh = new THREE.Mesh(
        createResourceGeometry(index),
        createResourceMaterial(index, texture),
      )
      const column = index % 4
      const row = Math.floor(index / 4)
      mesh.position.set((column - 1.5) * 1.6, (1 - row) * 1.6, 0)
      resourceMeshes.push(mesh)
      resourceGroup.add(mesh)
    }

    // 首次渲染确保 Geometry、Texture 和 Program 已实际提交到 GPU。
    renderNow()
    if (shouldEmit) {
      resourceStatus = `已创建 ${RESOURCE_BATCH_SIZE} 个测试对象`
      emitResource()
    }
  }

  const runResourceCycles = () => {
    if (!resourceGroup || disposed || resourceContextLost) return false
    if (resourceMeshes.length) releaseResourceBatch(false)

    if (resourceBaselineNeedsRefresh) {
      // 上下文恢复后先预热一次，避免渲染器内部纹理首次创建干扰循环结果。
      createResourceBatch(false)
      releaseResourceBatch(false)
    }
    if (!resourceBaseline) captureResourceBaseline()
    if (!resourceBaseline) return false

    for (let cycle = 0; cycle < RESOURCE_CYCLE_COUNT; cycle += 1) {
      createResourceBatch(false)
      releaseResourceBatch(false)
    }
    resourceCycleCount += RESOURCE_CYCLE_COUNT

    const current = readResourceMetrics()
    const stable =
      current.geometries === resourceBaseline.geometries &&
      current.textures === resourceBaseline.textures &&
      current.programs === resourceBaseline.programs
    resourceStatus = stable ? '循环完成，资源已回到基线' : '循环完成，资源数量未回到基线'
    emitResource()
    return stable
  }

  const loseWebGLContext = () => {
    if (!renderer || disposed || resourceContextLost) return
    renderer.forceContextLoss()
  }

  const restoreWebGLContext = () => {
    if (!renderer || disposed || !resourceContextLost) return
    renderer.forceContextRestore()
  }

  const createResourcePreview = () => {
    resourceGroup = new THREE.Group()
    resourceGroup.visible = false
    const hemisphereLight = new THREE.HemisphereLight(0xb9dcff, 0x182132, 2.2)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.8)
    directionalLight.position.set(4, 7, 5)
    resourceGroup.add(hemisphereLight, directionalLight)
    scene.add(resourceGroup)
    emitResource()
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
    renderer.localClippingEnabled = true
    renderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(renderer.domElement)

    configureControls()
    createPrimitives()
    createTexturePreview()
    createProjectionPreview()
    createClippingPreview()
    createInteractionPreview()
    createResourcePreview()
    resize()
    resetCamera()
    renderNow()

    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored)
    renderer.domElement.addEventListener('pointerdown', handleInteractionPointerDown)
    renderer.domElement.addEventListener('pointerup', handleInteractionPointerUp)
    renderer.domElement.addEventListener('pointercancel', handleInteractionPointerCancel)

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
      renderer.domElement.removeEventListener('pointerdown', handleInteractionPointerDown)
      renderer.domElement.removeEventListener('pointerup', handleInteractionPointerUp)
      renderer.domElement.removeEventListener('pointercancel', handleInteractionPointerCancel)
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
    interactionPickTargets.length = 0
    interactionDrawPoints.length = 0
    resourceMeshes.length = 0
    renderer = null
    scene = null
    camera = null
    perspectiveCamera = null
    orthographicCamera = null
    controls = null
    primitivesGroup = null
    textureGroup = null
    projectionGroup = null
    clippingGroup = null
    interactionGroup = null
    interactionTargetsGroup = null
    interactionDrawingGroup = null
    resourceGroup = null
    animatedGroup = null
    lightGroup = null
    texturePreviewMesh = null
    textureBackplate = null
    textureMaterial = null
    projectionMesh = null
    projectionMaterial = null
    projectorCamera = null
    projectorHelper = null
    clippingMesh = null
    clippingMaterial = null
    clippingPlane = null
    clippingPlaneHelper = null
    interactionPointObject = null
    interactionLineObject = null
    interactionPolygonObject = null
    interactionSelectedMesh = null
    currentTexture = null
    currentTextureMetadata = null
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
    setTextureTarget,
    setTextureWrapping,
    setTextureRepeat,
    setTextureFilters,
    setTextureMipmaps,
    setTextureFlipY,
    setTextureAnisotropy,
    setProjectionTarget,
    setProjectionDirection,
    setProjectionFov,
    setProjectionDistance,
    setProjectionEnabled,
    setProjectionHelperEnabled,
    setClippingTarget,
    setClippingAxis,
    setClippingOffset,
    setClippingInverted,
    setClippingEnabled,
    setClippingHelperEnabled,
    setInteractionMode,
    finishInteractionDrawing,
    clearInteractionDrawing,
    captureResourceBaseline,
    createResourceBatch,
    releaseResourceBatch,
    runResourceCycles,
    loseWebGLContext,
    restoreWebGLContext,
    dispose,
  }
}
