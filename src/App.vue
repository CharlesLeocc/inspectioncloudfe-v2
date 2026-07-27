<script setup>
  import { defineAsyncComponent } from 'vue'

  const ThreeValidationView = defineAsyncComponent(
    () => import('@/views/three-validation/ThreeValidationView.vue'),
  )
</script>

<template>
  <ThreeValidationView />
</template>
