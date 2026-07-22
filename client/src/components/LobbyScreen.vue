<template>
  <section class="screen">
    <div class="panel">
      <h2>房间 <span class="room-id">{{ store.roomId }}</span></h2>
      <p class="hint">把房间号发给朋友，让他们加入（最多 4 人）</p>

      <div class="rules-box">
        <div class="rules-title">本局规则</div>
        <ul class="rules-list">
          <li v-for="r in ruleList" :key="r.key" :class="r.on ? 'on' : 'off'">{{ r.label }}</li>
        </ul>
        <div v-if="enabledDlc.length" class="dlc-line">扩展组：{{ enabledDlc.join('、') }}</div>
      </div>

      <ul class="member-list">
        <li v-for="m in store.members" :key="m.id">
          <span>{{ m.name }}{{ m.id === store.you ? '（你）' : '' }}</span>
          <span v-if="m.id === store.hostId" class="host-tag">房主</span>
        </li>
      </ul>

      <button v-if="isHost" class="btn primary" :disabled="store.members.length < 2" @click="startGame">
        开始游戏
      </button>
      <p class="hint">{{ hint }}</p>
      <button class="btn ghost" @click="leaveRoom">离开房间</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store';
import { startGame, leaveRoom } from '../net';

const RULE_LABELS = {
  callUno: '喊 UNO 及漏喊罚牌',
  stacking: '+2 / +4 叠加接龙',
  drawPlay: '抽到可出的牌可立即出',
};

const isHost = computed(() => store.you === store.hostId);
const ruleList = computed(() =>
  Object.keys(RULE_LABELS).map((k) => ({
    key: k,
    label: RULE_LABELS[k],
    on: store.options && store.options[k],
  }))
);
const hint = computed(() =>
  isHost.value
    ? store.members.length < 2
      ? '至少 2 人才能开始'
      : ''
    : '等待房主开始游戏…'
);

// 已启用的扩展组名称（排除核心）
const enabledDlc = computed(() =>
  (store.packs || [])
    .filter((id) => id !== 'core')
    .map((id) => {
      const p = store.availablePacks.find((x) => x.id === id);
      return p ? p.name : id;
    })
);
</script>
