<template>
  <section class="screen">
    <div class="panel">
      <h1 class="logo">UNO</h1>
      <p class="subtitle">在线多人联机</p>

      <!-- 步骤 1：昵称 -->
      <div v-if="step === 'name'" class="step">
        <label class="field">
          <span>先起个昵称</span>
          <input v-model="name" maxlength="12" placeholder="输入昵称" @keyup.enter="toChoose" />
        </label>
        <button class="btn primary" @click="toChoose">下一步</button>
      </div>

      <!-- 步骤 2：创建 or 加入 -->
      <div v-else-if="step === 'choose'" class="step">
        <p class="greet">你好，<span class="greet-name">{{ name }}</span></p>
        <button class="btn primary" @click="step = 'create'">创建房间</button>
        <button class="btn" @click="step = 'join'">加入房间</button>
        <button class="btn ghost back-btn" @click="step = 'name'">返回</button>
      </div>

      <!-- 步骤 3：创建房间（选规则 + 扩展组） -->
      <div v-else-if="step === 'create'" class="step">
        <fieldset class="options">
          <legend>选择本局规则</legend>
          <label class="opt"><input type="checkbox" v-model="options.callUno" /> 喊 UNO 及漏喊罚牌</label>
          <label class="opt"><input type="checkbox" v-model="options.stacking" /> +2 / +4 叠加接龙</label>
          <label class="opt"><input type="checkbox" v-model="options.drawPlay" /> 抽到可出的牌可立即出</label>
        </fieldset>

        <fieldset v-if="dlcPacks.length" class="options">
          <legend>扩展组（DLC）</legend>
          <label v-for="p in dlcPacks" :key="p.id" class="opt">
            <input type="checkbox" v-model="packSel[p.id]" />
            <span>{{ p.name }}<small v-if="p.description" class="opt-desc">{{ p.description }}</small></span>
          </label>
        </fieldset>

        <button class="btn primary" @click="create">创建并进入</button>
        <button class="btn ghost back-btn" @click="step = 'choose'">返回</button>
      </div>

      <!-- 步骤 4：加入房间 -->
      <div v-else-if="step === 'join'" class="step">
        <label class="field">
          <span>输入房间号</span>
          <input v-model="roomId" maxlength="4" inputmode="numeric" placeholder="4 位房间号" @keyup.enter="join" />
        </label>
        <button class="btn primary" @click="join">加入</button>
        <button class="btn ghost back-btn" @click="step = 'choose'">返回</button>
      </div>

      <p class="error">{{ error }}</p>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { store } from '../store';
import { createRoom, joinRoom } from '../net';

const step = ref('name');
const name = ref('');
const roomId = ref('');
const error = ref('');
const options = reactive({ callUno: true, stacking: true, drawPlay: true });

// 可选扩展组（排除核心组）
const dlcPacks = computed(() => store.availablePacks.filter((p) => !p.core));
const packSel = reactive({}); // packId -> 是否勾选

function toChoose() {
  if (!name.value.trim()) {
    error.value = '请先输入昵称';
    return;
  }
  error.value = '';
  step.value = 'choose';
}

function create() {
  error.value = '';
  const packs = dlcPacks.value.filter((p) => packSel[p.id]).map((p) => p.id);
  createRoom(name.value.trim() || '玩家', { ...options }, packs);
}

function join() {
  if (!roomId.value.trim()) {
    error.value = '请输入房间号';
    return;
  }
  error.value = '';
  joinRoom(name.value.trim() || '玩家', roomId.value.trim());
}
</script>
