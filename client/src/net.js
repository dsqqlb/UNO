import { store, showToast } from './store';

// ---------- WebSocket 连接与消息 ----------
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
let ws = null;
const reconnect = { timer: null, attempts: 0, max: 6 };

// ---------- 会话持久化（断线重连） ----------
const SESSION_KEY = 'uno-session';
function saveSession() {
  if (store.you && store.roomId) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomId: store.roomId, playerId: store.you })
    );
  }
}
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function wsUrl() {
  return `${proto}://${location.host}/ws`;
}

let gotMessage = false; // 本次连接是否收到过服务器消息（用于区分"真连上了"）

function connect(onOpen) {
  gotMessage = false;
  ws = new WebSocket(wsUrl());
  // 连接超时：卡在"连接中"超过 7 秒就主动断开，触发 onclose 报错，避免点了没反应
  const timer = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }, 7000);
  ws.onopen = () => {
    clearTimeout(timer);
    onOpen && onOpen();
  };
  ws.onmessage = (ev) => {
    gotMessage = true;
    handleServer(JSON.parse(ev.data));
  };
  ws.onclose = () => {
    clearTimeout(timer);
    handleClose();
  };
  ws.onerror = () => {};
}

function handleClose() {
  const s = loadSession();
  // 从未成功通信、且不是重连场景 → 明确报错（常见于 WebSocket 被代理/穿透拦截）
  if (!gotMessage && !s) {
    showToast('无法连接服务器：WebSocket 未连通，请检查内网穿透是否放行 WebSocket');
    return;
  }
  if (s && reconnect.attempts < reconnect.max) {
    reconnect.attempts += 1;
    showToast(`连接断开，正在重连…（${reconnect.attempts}）`);
    clearTimeout(reconnect.timer);
    reconnect.timer = setTimeout(() => {
      connect(() => raw({ type: 'rejoin', roomId: s.roomId, playerId: s.playerId }));
    }, 1500);
  } else if (s) {
    showToast('重连失败，请刷新页面');
  }
}

// 底层发送：连接未就绪则先建立连接
function raw(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  } else {
    connect(() => ws.send(JSON.stringify(obj)));
  }
}

function handleServer(msg) {
  if (msg.type === 'lobby' || msg.type === 'state') {
    reconnect.attempts = 0;
    clearTimeout(reconnect.timer);
  }
  switch (msg.type) {
    case 'lobby':
      store.you = msg.you;
      store.roomId = msg.roomId;
      store.hostId = msg.hostId;
      store.members = msg.members;
      store.options = msg.options;
      store.packs = msg.packs || [];
      store.started = msg.started;
      saveSession();
      if (!msg.started) store.screen = 'lobby';
      break;
    case 'state':
      if (msg.you) store.you = msg.you;
      if (msg.roomId) store.roomId = msg.roomId;
      if (msg.hostId) store.hostId = msg.hostId;
      saveSession();
      store.game = msg.state; // 整体替换，便于 watch 对比出动画
      store.screen = 'table';
      break;
    case 'session_invalid':
      clearSession();
      store.screen = 'home';
      showToast('房间已不存在，请重新加入');
      break;
    case 'error':
      showToast(msg.error);
      break;
    default:
      break;
  }
}

// ---------- 对外动作 ----------
export function createRoom(name, options, packs) {
  showToast('正在连接服务器…');
  connect(() => raw({ type: 'create', name, options, packs }));
}

// 拉取服务器可用的扩展组（建房界面展示）
export async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    store.availablePacks = await res.json();
  } catch {
    store.availablePacks = [];
  }
}
export function joinRoom(name, roomId) {
  showToast('正在连接服务器…');
  connect(() => raw({ type: 'join', name, roomId }));
}
export function startGame() {
  raw({ type: 'start' });
}
export function playCard(cardId, color) {
  raw({ type: 'play', cardId, color });
}
export function drawCard() {
  raw({ type: 'draw' });
}
export function pass() {
  raw({ type: 'pass' });
}
export function skipOffline() {
  raw({ type: 'skipOffline' });
}
export function callUno() {
  raw({ type: 'callUno' });
}
export function catchUno(targetId) {
  raw({ type: 'catch', targetId });
}
export function restart() {
  raw({ type: 'restart' });
}
export function leaveRoom() {
  raw({ type: 'leave' });
  clearSession();
  store.screen = 'home';
}

// 启动时尝试恢复上次会话
export function init() {
  const s = loadSession();
  if (s && s.roomId && s.playerId) {
    connect(() => raw({ type: 'rejoin', roomId: s.roomId, playerId: s.playerId }));
  }
}
