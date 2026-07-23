'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');
const { listPacks, hasPack } = require('./packs');

// 只保留已注册的扩展组，核心组始终包含
function normalizePacks(raw) {
  const ids = Array.isArray(raw) ? raw.filter((id) => hasPack(id)) : [];
  const set = new Set(ids);
  set.add('core');
  return [...set];
}

const PORT = process.env.PORT || 3000;
// 开发模式：node server.js --dev（内嵌 Vite 中间件，前端热更新与后端同端口）
const DEV = process.argv.includes('--dev');
// 生产模式托管的 Vite 构建产物（npm run build 生成到 dist/）
const DIST_DIR = path.join(__dirname, 'dist');
const MAX_PLAYERS = 4;

// ---------- 静态文件托管 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// 生产模式：托管 dist/ 静态资源（含 SPA 回退）
function serveDist(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // 未构建时给出友好提示
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      '<h1>前端尚未构建</h1><p>请先运行 <code>npm run build</code>；开发时请用 <code>npm run dev</code>。</p>'
    );
  }

  const target = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(DIST_DIR, path.normalize(target));

  // 防目录穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      return sendFile(res, filePath);
    }
    // SPA 回退：其余路径交给前端（返回 index.html）
    sendFile(res, path.join(DIST_DIR, 'index.html'));
  });
}

// 请求处理器：生产用 serveDist；开发模式启动时会被替换为 Vite 中间件
let handleRequest = serveDist;
const server = http.createServer((req, res) => {
  // 可用扩展组列表（前端建房界面用）
  if (req.url.split('?')[0] === '/api/packs') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(listPacks()));
  }
  handleRequest(req, res);
});

// ---------- 房间管理 ----------
/**
 * rooms: Map<roomId, {
 *   id, hostId, options, members: Map<playerId, {id,name,ws}>, game: Game|null
 * }>
 */
const rooms = new Map();

function genRoomId() {
  let id;
  do {
    id = String(Math.floor(1000 + Math.random() * 9000)); // 4 位房间号
  } while (rooms.has(id));
  return id;
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeOptions(raw) {
  raw = raw || {};
  return {
    callUno: !!raw.callUno,
    stacking: !!raw.stacking,
    drawPlay: !!raw.drawPlay,
  };
}

function send(ws, type, payload) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastLobby(room) {
  const members = [...room.members.values()].map((m) => ({
    id: m.id,
    name: m.name,
  }));
  for (const m of room.members.values()) {
    send(m.ws, 'lobby', {
      roomId: room.id,
      hostId: room.hostId,
      you: m.id,
      members,
      options: room.options,
      packs: room.packs,
      started: !!room.game,
    });
  }
}

function broadcastGame(room) {
  if (!room.game) return;
  for (const m of room.members.values()) {
    // 随状态一并带上房间元信息，方便断线重连后恢复上下文
    send(m.ws, 'state', {
      state: room.game.stateFor(m.id),
      you: m.id,
      roomId: room.id,
      hostId: room.hostId,
    });
  }
}

// 断线宽限期：这段时间内重连可无缝回到房间；超时才真正清理
const GRACE_MS = 30000;

// 连接断开处理：标记离线并安排宽限清理（区别于主动 leave 的立即移除）
function handleDisconnect(ctx, closingWs) {
  const { roomId, playerId } = ctx;
  const room = rooms.get(roomId);
  if (!room) return;
  const member = room.members.get(playerId);
  if (!member) return;
  // 该成员已被更新的连接替换（刷新导致的竞态），忽略这个旧连接的关闭
  if (member.ws && member.ws !== closingWs) return;

  member.ws = null;
  if (room.game) {
    room.game.setConnected(playerId, false);
    broadcastGame(room);
  } else {
    broadcastLobby(room);
  }

  // 宽限期后仍未重连才真正清理
  if (member.cleanupTimer) clearTimeout(member.cleanupTimer);
  member.cleanupTimer = setTimeout(() => finalizeLeave(roomId, playerId), GRACE_MS);
}

// 宽限期结束或主动离开时真正移除
function finalizeLeave(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const member = room.members.get(playerId);
  if (!member || member.ws) return; // 已重连，取消清理

  if (room.game) {
    // 对局中：保留离线占位以便随时重连；全员离线才清房
    const anyOnline = [...room.members.values()].some((m) => m.ws);
    if (!anyOnline) rooms.delete(roomId);
    return;
  }

  // 大厅阶段：移除成员
  room.members.delete(playerId);
  if (room.members.size === 0) {
    rooms.delete(roomId);
    return;
  }
  if (room.hostId === playerId) {
    room.hostId = room.members.keys().next().value;
  }
  broadcastLobby(room);
}

// 主动离开：立即移除，不走宽限期
function leaveRoom(ctx) {
  const { roomId, playerId } = ctx;
  const room = rooms.get(roomId);
  if (!room) return;
  const member = room.members.get(playerId);
  if (member && member.cleanupTimer) clearTimeout(member.cleanupTimer);

  if (room.game) {
    room.game.setConnected(playerId, false);
    if (member) member.ws = null;
    broadcastGame(room);
    const anyOnline = [...room.members.values()].some((m) => m.ws);
    if (!anyOnline) rooms.delete(roomId);
    return;
  }

  room.members.delete(playerId);
  if (room.members.size === 0) {
    rooms.delete(roomId);
    return;
  }
  if (room.hostId === playerId) {
    room.hostId = room.members.keys().next().value;
  }
  broadcastLobby(room);
}

// ---------- WebSocket ----------
// 用 noServer 手动处理 upgrade，只接管 /ws；其余（如 Vite HMR）留给各自的监听器
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    /* ignore */
  }
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  }
});

// 心跳保活：Cloudflare / Nginx 等代理会掐断空闲 WebSocket（默认约 100s）。
// 定时 ping 让连接保持活跃，同时清理真正掉线的连接。
const HEARTBEAT_MS = 25000;
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // 每个连接绑定的上下文
  const ctx = { playerId: genId(), roomId: null, name: null };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, 'error', { error: '消息格式错误' });
    }
    handleMessage(ws, ctx, msg);
  });

  ws.on('close', () => {
    if (ctx.roomId) handleDisconnect(ctx, ws);
  });
});

function handleMessage(ws, ctx, msg) {
  switch (msg.type) {
    case 'create': {
      const name = String(msg.name || '玩家').slice(0, 12);
      const roomId = genRoomId();
      const room = {
        id: roomId,
        hostId: ctx.playerId,
        options: normalizeOptions(msg.options),
        packs: normalizePacks(msg.packs),
        members: new Map(),
        game: null,
      };
      room.members.set(ctx.playerId, { id: ctx.playerId, name, ws });
      rooms.set(roomId, room);
      ctx.roomId = roomId;
      ctx.name = name;
      broadcastLobby(room);
      break;
    }

    case 'join': {
      const roomId = String(msg.roomId || '').trim();
      const name = String(msg.name || '玩家').slice(0, 12);
      const room = rooms.get(roomId);
      if (!room) return send(ws, 'error', { error: '房间不存在' });
      if (room.game) return send(ws, 'error', { error: '该房间已开始游戏' });
      if (room.members.size >= MAX_PLAYERS)
        return send(ws, 'error', { error: '房间已满' });

      room.members.set(ctx.playerId, { id: ctx.playerId, name, ws });
      ctx.roomId = roomId;
      ctx.name = name;
      broadcastLobby(room);
      break;
    }

    // 断线重连：用之前的 playerId 重新接入房间
    case 'rejoin': {
      const roomId = String(msg.roomId || '').trim();
      const playerId = String(msg.playerId || '').trim();
      const room = rooms.get(roomId);
      if (!room) return send(ws, 'session_invalid', {});
      const member = room.members.get(playerId);
      if (!member) return send(ws, 'session_invalid', {});

      if (member.cleanupTimer) {
        clearTimeout(member.cleanupTimer);
        member.cleanupTimer = null;
      }
      member.ws = ws;
      ctx.playerId = playerId;
      ctx.roomId = roomId;
      ctx.name = member.name;
      if (room.game) {
        room.game.setConnected(playerId, true);
        broadcastGame(room);
      } else {
        broadcastLobby(room);
      }
      break;
    }

    case 'start': {
      const room = rooms.get(ctx.roomId);
      if (!room) return send(ws, 'error', { error: '房间不存在' });
      if (room.hostId !== ctx.playerId)
        return send(ws, 'error', { error: '只有房主能开始' });
      if (room.game) return send(ws, 'error', { error: '游戏已开始' });
      if (room.members.size < 2)
        return send(ws, 'error', { error: '至少需要 2 名玩家' });

      const players = [...room.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
      }));
      room.game = new Game(players, room.options, room.packs);
      broadcastLobby(room);
      broadcastGame(room);
      break;
    }

    case 'play': {
      const room = rooms.get(ctx.roomId);
      if (!room || !room.game)
        return send(ws, 'error', { error: '游戏未开始' });
      const result = room.game.playCard(ctx.playerId, msg.cardId, msg.color);
      if (!result.ok) return send(ws, 'error', { error: result.error });
      broadcastGame(room);
      break;
    }

    case 'draw': {
      const room = rooms.get(ctx.roomId);
      if (!room || !room.game)
        return send(ws, 'error', { error: '游戏未开始' });
      const result = room.game.drawCard(ctx.playerId);
      if (!result.ok) return send(ws, 'error', { error: result.error });
      broadcastGame(room);
      break;
    }

    case 'pass': {
      const room = rooms.get(ctx.roomId);
      if (!room || !room.game)
        return send(ws, 'error', { error: '游戏未开始' });
      const result = room.game.pass(ctx.playerId);
      if (!result.ok) return send(ws, 'error', { error: result.error });
      broadcastGame(room);
      break;
    }

    case 'callUno': {
      const room = rooms.get(ctx.roomId);
      if (!room || !room.game)
        return send(ws, 'error', { error: '游戏未开始' });
      const result = room.game.callUno(ctx.playerId);
      if (!result.ok) return send(ws, 'error', { error: result.error });
      broadcastGame(room);
      break;
    }

    case 'catch': {
      const room = rooms.get(ctx.roomId);
      if (!room || !room.game)
        return send(ws, 'error', { error: '游戏未开始' });
      const result = room.game.catchUno(ctx.playerId, msg.targetId);
      if (!result.ok) return send(ws, 'error', { error: result.error });
      broadcastGame(room);
      break;
    }

    case 'restart': {
      const room = rooms.get(ctx.roomId);
      if (!room) return send(ws, 'error', { error: '房间不存在' });
      if (room.hostId !== ctx.playerId)
        return send(ws, 'error', { error: '只有房主能重开' });
      // 回到大厅，保留当前在线成员
      room.game = null;
      broadcastLobby(room);
      break;
    }

    case 'leave': {
      if (ctx.roomId) {
        leaveRoom(ctx);
        ctx.roomId = null;
      }
      break;
    }

    default:
      send(ws, 'error', { error: '未知消息类型' });
  }
}

// ---------- 启动 ----------
async function bootstrap() {
  if (DEV) {
    // 开发模式：把 Vite 以中间件方式内嵌，HMR 复用同一个 http server
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      // 显式加载根目录配置（含 vue 插件与 root: 'client'），否则 .vue 无法被处理
      configFile: path.join(__dirname, 'vite.config.mjs'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    handleRequest = (req, res) => vite.middlewares(req, res);
    console.log('开发模式：Vite 中间件已挂载（前端热更新）');
  }

  server.listen(PORT, () => {
    const mode = DEV ? '开发' : '生产';
    console.log(`UNO 服务器已启动（${mode}模式）: http://localhost:${PORT}`);
  });
}

bootstrap();
