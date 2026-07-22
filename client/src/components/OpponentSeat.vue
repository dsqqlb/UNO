<template>
  <div
    class="opponent"
    :class="{ active: player.id === currentId, offline: !player.connected }"
    :data-pid="player.id"
  >
    <div class="op-name">{{ player.name }}<span v-if="!player.connected" class="op-off">（离线）</span></div>
    <div class="hand-fan" :class="'fan-' + orient">
      <span v-for="i in fanCount" :key="i" class="mini-back"></span>
    </div>
    <div class="op-cards">{{ player.handCount }} 张</div>
    <button v-if="player.catchable" class="catch-btn" @click="$emit('catch', player.id)">
      抓漏喊!
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  player: { type: Object, required: true },
  currentId: { type: String, default: null },
  orient: { type: String, default: 'h' }, // h 横向 / v 纵向（左右座位可用）
});
defineEmits(['catch']);

// 最多显示 12 张牌背，多出来的靠数字体现，避免溢出
const fanCount = computed(() => Math.min(props.player.handCount, 12));
</script>
