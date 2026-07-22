# UNO 在线

一个在线多人联机 UNO 游戏。后端 Node.js + WebSocket，前端 Vue3 + Vite 单文件组件，无数据库。规则校验全部在服务器端。

## 特性

- 多人实时联机，支持多房间同时进行（4 位房间号，每房 2-4 人）
- 标准 108 张 UNO 牌：4 色 0-9、跳过、反转、+2，以及万能牌和万能 +4
- 规则校验全部在服务器端，客户端只发送操作意图，防作弊
- 只给玩家自己的手牌，其他人仅显示剩余张数
- 抽牌堆用尽时自动回收弃牌堆重洗
- 房主建房时可勾选的可选规则（见下）
- 断线自动重连：刷新页面或网络抖动后自动回到原对局；房主可随时把游戏重开回大厅

## 环境要求

- Node.js 18 及以上（Vite 6 要求）

**始终只用一个端口（默认 3000）**：Vite 在开发模式下被内嵌进后端，前端、热更新、WebSocket 全在同一端口。

## 开发模式

```bash
npm install
npm run dev
```

浏览器打开 **http://localhost:3000** 。`npm run dev` 实际执行 `node server.js --dev`：后端把 Vite 以中间件方式挂载进来，改 `.vue` 源码即时热更新，无需构建、无需第二个端口。

## 生产模式

```bash
npm install
npm run build      # 构建前端到 dist/
npm start          # node server.js，同样是 3000 端口
```

打开 **http://localhost:3000** 。生产模式下后端直接托管构建好的 `dist/`。

如需换端口，设置环境变量 `PORT`，例如 `PORT=8080 npm start`（或 `PORT=8080 npm run dev`）。

> 三个脚本：`npm run dev`（开发，带热更新）、`npm run build`（构建）、`npm start`（生产托管）。

## 怎么玩

1. 打开页面，输入昵称。
2. 一人点「创建房间」，得到一个 4 位房间号。
3. 其他人输入该房间号点「加入房间」（同一局域网可用主机的 `http://主机IP:3000` 访问）。
4. 房主点「开始游戏」，系统发牌。
5. 轮到你时，可出的牌会高亮：
   - 出牌需与当前颜色、或与顶牌的数字/类型匹配。
   - 万能牌可任意出，出后需选择一个颜色。
   - 无牌可出时点抽牌堆抽一张（抽完即结束本回合）。
6. 谁先出完手牌谁获胜。房主可点「回到大厅重开」再来一局。

## 功能牌说明

| 牌 | 效果 |
|---|---|
| 跳过 (Skip) | 下一名玩家被跳过 |
| 反转 (Reverse) | 出牌方向反转（2 人局等同跳过） |
| +2 (Draw Two) | 下一名玩家抓 2 张并被跳过 |
| 万能牌 (Wild) | 任意出，出牌者指定接下来的颜色 |
| 万能 +4 (Wild Draw 4) | 任意出，指定颜色，下一名玩家抓 4 张并被跳过 |

## 可选规则

房主在**创建房间**时可勾选，规则对整局生效并在大厅向所有人展示：

| 规则 | 说明 |
|---|---|
| 喊 UNO 及漏喊罚牌 | 手牌剩 1 张时需点「UNO!」按钮；未喊会被其他玩家点「抓漏喊」罚抓 2 张 |
| +2 / +4 叠加接龙 | 被 +2/+4 的玩家可打出同类型牌继续叠加给下家，累计张数由最终无法接的人一次抽完 |
| 抽到可出的牌可立即出 | 抽牌后若该牌可出，可选择打出或点「跳过」结束回合；关闭时抽一张即结束回合 |

三项相互独立，可任意组合。断线重连始终生效，无需勾选。

## 自定义卡牌 / 扩展组（DLC）

卡牌系统是**数据驱动**的：每张牌型由一个"卡牌定义"描述（图案、颜色、效果），一组卡牌打包成一个"扩展组"。核心 UNO 本身就是扩展组 `core`。**新增卡牌不需要改引擎**。

**在哪里写**：`packs/` 目录。

```
packs/
├── registry.js      # 注册表底座（一般不用改）
├── core.js          # 标准 UNO 108 张（最佳参考范例）
├── example-dlc.js   # 示例扩展组：💣 炸弹、🌀 群抽（复制它做你自己的）
└── index.js         # 入口：在这里 require 每个扩展组
```

**做一套新 DLC 的三步**：

1. 复制 `packs/example-dlc.js` 为 `packs/your-pack.js`，改 `id` / `name` / `cards`。
2. 在 `packs/index.js` 里加一行 `require('./your-pack')`。
3. 完成——建房界面会自动出现这个扩展组的勾选项（前端零改动）。

一张卡牌定义可包含：

| 字段 | 说明 |
|---|---|
| `kind` | 唯一标识（不可重复） |
| `glyph(card)` | 牌面显示的 emoji / 数字 / 符号，如 `'💣'`、`'7'` |
| `build(COLORS)` | 返回该牌型的所有实例（含 `color`：四色或 `'black'`/`'wild'`） |
| `isWild` | 是否万能牌（出牌需选颜色、可任意出） |
| `onPlay(game, card)` | 出牌效果，随意修改对局状态（务必调用 `game._advanceTurn(n)` 推进回合） |
| `onStart(game, card)` | 作为起始翻牌时的即时效果（可选） |
| `matches(game, card)` | 自定义能否出这张牌（可选，默认按同色/同符号） |
| `label(card)` | 日志里的名字（可选） |

`onPlay` 里 `game` 上可用的能力（摸牌 `_draw`、推进 `_advanceTurn`、看下家 `_peekNext`、改方向 `direction`、写记录 `_pushLog` 等）在 `packs/example-dlc.js` 顶部有完整注释。

## 项目结构

```
UNO/
├── package.json          # 依赖与脚本（前后端合一）
├── vite.config.mjs       # Vite 配置（root=client，构建到 dist/）
├── server.js             # WebSocket 服务 + 托管 dist/ + 房间管理 + /api/packs
├── game.js               # UNO 规则引擎（数据驱动，效果来自 packs/）
├── packs/                # ★ 卡牌与扩展组（在这里加自定义卡牌）
│   ├── registry.js       # 注册表 + 组牌 + 默认匹配
│   ├── core.js           # 标准 UNO
│   ├── example-dlc.js    # 示例扩展组
│   └── index.js          # 扩展组入口
└── client/               # 前端 Vue3 应用
    ├── index.html        # Vite 入口
    └── src/
        ├── main.js       # 应用入口，挂载 App
        ├── App.vue       # 顶层，按 store.screen 切换界面
        ├── store.js      # 响应式全局状态（reactive）+ toast
        ├── net.js        # WebSocket 连接、消息处理、断线重连、对外动作
        ├── anim.js       # 命令式动画辅助（飞行卡牌、彩带等）
        ├── styles/
        │   └── main.css  # 全局样式与动效
        └── components/
            ├── HomeScreen.vue   # 分步主页（昵称 → 创建/加入）
            ├── LobbyScreen.vue  # 等待大厅 + 规则展示
            ├── GameTable.vue    # 牌桌主界面 + 动画编排
            ├── UnoCard.vue      # 单张卡牌
            ├── GameLog.vue      # 右上角对局记录（可折叠）
            ├── ColorModal.vue   # 万能牌选色弹窗
            ├── OverModal.vue    # 结算弹窗
            └── Toast.vue        # 顶部提示
```

> `dist/`（构建产物）和 `node_modules/`（依赖）都是自动生成、已在 `.gitignore` 中忽略的目录，仓库里默认不存在：`npm install` 生成 `node_modules/`，`npm run build` 生成 `dist/`。

分层职责：`game.js` 管规则，`server.js` 管联机与房间，`client/src/net.js` 管前端通信，各 `.vue` 组件管界面。新增功能时：改规则动 `game.js`（保持"服务器端 options + 校验"模式），改界面加/改组件，跨组件状态放 `store.js`。

## 技术栈

- 后端：Node.js 原生 `http` 托管构建产物 + [`ws`](https://github.com/websockets/ws) 提供 WebSocket（路径 `/ws`）
- 前端：[Vue 3](https://vuejs.org/)（单文件组件、`<script setup>`）+ [Vite](https://vite.dev/) 构建
- 状态：前端用 Vue `reactive` 全局 store；对局权威状态在服务器内存，进程结束后房间即销毁

## 已知边界

- 断线重连依赖浏览器 localStorage 记录会话；对局中所有人都离线时房间会被清理，无法再恢复。
- 大厅阶段（未开始游戏）刷新页面会退出房间，重连主要覆盖对局进行中的场景。
- 房间状态存于服务器内存，进程重启后全部房间清空。

可进一步扩展的方向：新增自定义卡牌与扩展组（见上方「自定义卡牌 / 扩展组」，写在 `packs/`）；对局计分与多局累计；需要"选择目标玩家"等更复杂交互的卡牌，可在此基础上扩展效果 API。
