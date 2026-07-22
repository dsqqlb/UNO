<template>
  <div class="modal">
    <div class="modal-box">
      <h3 class="over-text">{{ text }}</h3>
      <button v-if="isHost" class="btn primary" @click="$emit('restart')">回到大厅重开</button>
      <p v-else class="hint">等待房主重开…</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store';

const props = defineProps({ state: { type: Object, required: true } });
defineEmits(['restart']);

const isHost = computed(() => store.you === store.hostId);
const text = computed(() => {
  const w = props.state.players.find((p) => p.id === props.state.winnerId);
  if (!w) return '游戏结束';
  return w.id === store.you ? '🎉 你赢了！' : `${w.name} 获胜`;
});
</script>
