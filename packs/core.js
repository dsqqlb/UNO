'use strict';

/**
 * 核心扩展组：标准 UNO 108 张牌。
 * 这是"如何写卡牌"的最佳参考范例。
 */
const { registerPack, COLORS } = require('./registry');

// —— 组牌辅助 ——
function numberCards() {
  const cards = [];
  for (const color of COLORS) {
    cards.push({ kind: 'number', color, value: 0, glyph: '0' });
    for (let v = 1; v <= 9; v++) {
      cards.push({ kind: 'number', color, value: v, glyph: String(v) });
      cards.push({ kind: 'number', color, value: v, glyph: String(v) });
    }
  }
  return cards;
}
function twoPerColor(kind, glyph) {
  const cards = [];
  for (const color of COLORS) {
    cards.push({ kind, color, glyph });
    cards.push({ kind, color, glyph });
  }
  return cards;
}
function fourWild(kind, glyph) {
  return [0, 1, 2, 3].map(() => ({ kind, color: 'wild', glyph }));
}

registerPack({
  id: 'core',
  name: '标准 UNO',
  description: '4 色 0-9、跳过、反转、+2，万能牌与万能 +4',
  core: true,
  cards: [
    // 数字牌：无特殊效果，出牌后轮到下一位（引擎默认）
    { kind: 'number', glyph: (c) => String(c.value), build: numberCards },

    // 跳过
    {
      kind: 'skip',
      glyph: () => '⊘',
      build: () => twoPerColor('skip', '⊘'),
      onPlay(g) {
        g._advanceTurn(2);
      },
      onStart(g) {
        g._advanceTurn(1);
      },
      label: (c) => `${colorCn(c.color)}禁止`,
    },

    // 反转
    {
      kind: 'reverse',
      glyph: () => '⇄',
      build: () => twoPerColor('reverse', '⇄'),
      onPlay(g) {
        g.direction *= -1;
        g._advanceTurn(g.players.length === 2 ? 2 : 1);
      },
      onStart(g) {
        g.direction = -1;
        if (g.players.length === 2) g._advanceTurn(1);
      },
      label: (c) => `${colorCn(c.color)}反转`,
    },

    // +2
    {
      kind: 'draw2',
      glyph: () => '+2',
      build: () => twoPerColor('draw2', '+2'),
      onPlay(g) {
        if (g.options.stacking) {
          g.pendingDraw += 2;
          g.pendingDrawType = 'draw2';
          g._advanceTurn(1);
        } else {
          const t = g._peekNext(1);
          t.hand.push(...g._draw(2));
          t.saidUno = false;
          g._pushLog(`${t.name} 抓 2 张并被跳过`);
          g._advanceTurn(2);
        }
      },
      onStart(g) {
        g.players[g.turnIndex].hand.push(...g._draw(2));
        g._advanceTurn(1);
      },
      label: (c) => `${colorCn(c.color)}+2`,
    },

    // 万能牌
    {
      kind: 'wild',
      glyph: () => '★',
      isWild: true,
      build: () => fourWild('wild', '★'),
      onPlay(g) {
        g._advanceTurn(1);
      },
      label: (c) => `万能(${colorCn(c.color) || '未定'})`,
    },

    // 万能 +4
    {
      kind: 'wild_draw4',
      glyph: () => '+4',
      isWild: true,
      build: () => fourWild('wild_draw4', '+4'),
      onPlay(g) {
        if (g.options.stacking) {
          g.pendingDraw += 4;
          g.pendingDrawType = 'wild_draw4';
          g._advanceTurn(1);
        } else {
          const t = g._peekNext(1);
          t.hand.push(...g._draw(4));
          t.saidUno = false;
          g._pushLog(`${t.name} 抓 4 张并被跳过`);
          g._advanceTurn(2);
        }
      },
      label: (c) => `万能+4(${colorCn(c.color) || '未定'})`,
    },
  ],
});

function colorCn(color) {
  return { red: '红', yellow: '黄', green: '绿', blue: '蓝', black: '黑', wild: '' }[color] ?? '';
}
