<template>
  <HomeScreen v-if="store.screen === 'home'" />
  <LobbyScreen v-else-if="store.screen === 'lobby'" />
  <GameTable v-else-if="store.screen === 'table'" />
  <Toast />
</template>

<script setup>
import { onMounted } from 'vue';
import { store } from './store';
import { init, loadPacks } from './net';
import HomeScreen from './components/HomeScreen.vue';
import LobbyScreen from './components/LobbyScreen.vue';
import GameTable from './components/GameTable.vue';
import Toast from './components/Toast.vue';

onMounted(() => {
  loadPacks();
  init();
});
</script>
