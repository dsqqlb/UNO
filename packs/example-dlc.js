'use strict';

/**
 * 示例扩展组（DLC）—— 复制这个文件就能做你自己的扩展组。
 *
 * 做一套新 DLC 的步骤：
 *   1. 复制本文件为 packs/your-pack.js，改 id / name / cards。
 *   2. 在 packs/index.js 里 require('./your-pack')。
 *   3. 前端建房界面会自动出现这个扩展组的勾选项（无需改前端）。
 *
 * 每张自定义卡可拥有：
 *   - 图案：glyph 返回 emoji / 数字 / 符号
 *   - 颜色：build 里给 color（'red'|'yellow'|'green'|'blue'|'black'），或 'wild'
 *   - 效果：onPlay(game, card) 里随意修改对局状态
 *
 * onPlay 里能用的常用能力（game 上）：
 *   game.players            所有玩家（含 hand / name / id / saidUno）
 *   game.currentPlayer      当前出牌者（此刻回合还没推进）
 *   game._peekNext(n)       沿当前方向第 n 位玩家
 *   game._draw(n)           从牌堆摸 n 张（返回数组，会自动重洗）
 *   game._advanceTurn(n)    推进 n 步回合（务必调用，否则回合不走）
 *   game.direction          1 顺时针 / -1 逆时针（可直接改）
 *   game.currentColor       当前有效颜色（万能牌会被引擎设为所选颜色）
 *   game.pendingDraw / pendingDrawType   叠加规则相关
 *   game._pushLog(text)     写一条对局记录
 */
const { registerPack } = require('./registry');

registerPack({
  id: 'chaos',
  name: '混乱扩展（示例）',
  description: '演示自定义卡：💣 炸弹、🌀 群抽',
  cards: [
    {
      // 💣 炸弹：四色各一张，下家抓 3 张并被跳过
      kind: 'boom',
      glyph: () => '💣',
      build: (COLORS) => COLORS.map((color) => ({ kind: 'boom', color, glyph: '💣' })),
      onPlay(game) {
        const target = game._peekNext(1);
        target.hand.push(...game._draw(3));
        target.saidUno = false;
        game._pushLog(`💣 ${target.name} 被炸，抓 3 张并被跳过`);
        game._advanceTurn(2);
      },
      label: () => '炸弹💣',
    },
    {
      // 🌀 群抽：黑色万能牌 2 张，除出牌者外每人各抓 1 张
      kind: 'everyone_draw',
      glyph: () => '🌀',
      isWild: true, // 需要选颜色
      build: () => [0, 1].map(() => ({ kind: 'everyone_draw', color: 'wild', glyph: '🌀' })),
      onPlay(game) {
        for (const p of game.players) {
          if (p.id !== game.currentPlayer.id) {
            p.hand.push(...game._draw(1));
            p.saidUno = false;
          }
        }
        game._pushLog('🌀 除出牌者外，每人抓 1 张');
        game._advanceTurn(1);
      },
      label: () => '群抽🌀',
    },
  ],
});
