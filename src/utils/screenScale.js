// ==========================================================================
// 大屏页面等比例缩放方案
//
// 适用场景：3D 场景/数据可视化大屏页面，需要在 1920x1080 ~ 4K(3840x2160)
// 范围内保持画面比例一致，不走常规响应式断点布局。
//
// 用法：
//   <template>
//     <div ref="wrapperRef" class="screen-wrapper">...大屏内容，按 1920x1080 设计稿开发...</div>
//   </template>
//   <script setup>
//   import { ref } from 'vue'
//   import { useScreenScale } from '@/utils/screenScale'
//   const wrapperRef = ref(null)
//   useScreenScale(wrapperRef)
//   </script>
//   <style scoped>
//   .screen-wrapper {
//     width: 1920px;
//     height: 1080px;
//     transform-origin: 0 0;
//   }
//   </style>
// ==========================================================================

import { onMounted, onUnmounted } from 'vue'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

/**
 * 让传入的容器按视口尺寸相对 1920x1080 设计稿等比例缩放
 * @param {import('vue').Ref<HTMLElement | null>} wrapperRef 大屏容器 ref
 * @param {{ width?: number, height?: number, mode?: 'contain' | 'width' }} options
 *   width/height 设计稿基准尺寸，默认 1920x1080
 *   mode 'contain' 保持比例居中缩放（默认，四周可能留边）
 *        'width' 按宽度铺满缩放（高度可能裁切，适合宽屏大屏）
 */
export function useScreenScale(wrapperRef, options = {}) {
  const designWidth = options.width || DESIGN_WIDTH
  const designHeight = options.height || DESIGN_HEIGHT
  const mode = options.mode || 'contain'

  const updateScale = () => {
    const el = wrapperRef.value
    if (!el) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const scaleX = viewportWidth / designWidth
    const scaleY = viewportHeight / designHeight
    const scale = mode === 'width' ? scaleX : Math.min(scaleX, scaleY)

    el.style.width = `${designWidth}px`
    el.style.height = `${designHeight}px`
    el.style.transform = `scale(${scale})`

    if (mode === 'contain') {
      el.style.position = 'absolute'
      el.style.left = `${(viewportWidth - designWidth * scale) / 2}px`
      el.style.top = `${(viewportHeight - designHeight * scale) / 2}px`
    }
  }

  onMounted(() => {
    updateScale()
    window.addEventListener('resize', updateScale)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateScale)
  })

  return { updateScale }
}
