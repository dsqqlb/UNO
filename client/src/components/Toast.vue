<template>
  <Transition name="toast">
    <div v-if="store.toast" class="toast">{{ store.toast }}</div>
  </Transition>
</template>

<script setup>
import { store } from '../store';
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
