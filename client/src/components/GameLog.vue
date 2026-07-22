<template>
  <div class="game-log" :class="{ collapsed }">
    <div class="log-header" @click="collapsed = !collapsed">
      <span>对局记录</span>
      <span class="log-toggle">▾</span>
    </div>
    <div ref="body" class="log-body">
      <div v-for="(line, i) in log" :key="i">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({ log: { type: Array, default: () => [] } });

const collapsed = ref(window.innerWidth <= 820);
const body = ref(null);

watch(
  () => props.log,
  async () => {
    await nextTick();
    if (body.value) body.value.scrollTop = body.value.scrollHeight;
  },
  { deep: true }
);
</script>
