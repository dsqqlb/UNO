import { reactive } from 'vue';

// 全局响应式状态。后续新增功能（战绩、聊天、设置等）可继续往这里扩展。
export const store = reactive({
  screen: 'home', // home | lobby | table

  // 会话与房间
  you: null,
  roomId: null,
  hostId: null,

  // 大厅
  members: [],
  options: { callUno: true, stacking: true, drawPlay: true },
  packs: [], // 本房间启用的扩展组 id
  started: false,

  // 服务器可用的扩展组列表（含 core），用于建房界面
  availablePacks: [],

  // 对局状态（服务器权威状态的快照）
  game: null,

  // 顶部提示
  toast: '',
});

let toastTimer = null;
export function showToast(text) {
  store.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    store.toast = '';
  }, 2200);
}
