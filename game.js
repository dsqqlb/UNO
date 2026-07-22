'use strict';

/**
 * UNO 规则引擎（数据驱动）
 * - 牌型与效果不再写死在引擎里，而是来自 packs/ 下的扩展组注册表
 * - 引擎只负责通用流程：发牌、回合、匹配校验、可选规则、可见信息过滤
 *
 * 可选规则 options:
 *   callUno  喊 UNO 及漏喊罚牌
 *   stacking +2 / +4 叠加接龙
 *   drawPlay 抽到可出的牌后可立即出
 *
 * packs: 启用的扩展组 id 数组（'core' 始终包含）
 */

const { getCardDef, buildDeckTemplates, defaultMatches, COLORS } = require('./packs');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  /**
   * @param {Array<{id:string,name:string}>} players
   * @param {{callUno?:boolean,stacking?:boolean,drawPlay?:boolean}} options
   * @param {string[]} packs 启用的扩展组
   */
  constructor(players, options = {}, packs = ['core']) {
    this.options = {
      callUno: !!options.callUno,
      stacking: !!options.stacking,
      drawPlay: !!options.drawPlay,
    };
    this.packs = packs && packs.length ? packs : ['core'];
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      connected: true,
      saidUno: false,
    }));
    this.drawPile = [];
    this.discardPile = [];
    this.currentColor = null;
    this.turnIndex = 0;
    this.direction = 1;
    this.finished = false;
    this.winnerId = null;

    this.pendingDraw = 0;
    this.pendingDrawType = null;
    this.drawnPending = null;

    this.log = [];
    this._start();
  }

  _start() {
    // 依据启用扩展组构建牌堆，并分配唯一 id
    let seq = 0;
    const templates = buildDeckTemplates(this.packs);
    this.drawPile = shuffle(templates.map((t) => ({ id: `c${seq++}`, ...t })));

    for (const player of this.players) {
      player.hand = this.drawPile.splice(0, 7);
    }

    // 翻开起始牌；万能牌作起始牌会引起歧义，重洗
    let first;
    do {
      first = this.drawPile.shift();
      if (first && first.isWild) {
        this.drawPile.push(first);
        this.drawPile = shuffle(this.drawPile);
        first = null;
      }
    } while (!first);

    this.discardPile.push(first);
    this.currentColor =
      first.color === 'wild' || first.color === 'black'
        ? COLORS[Math.floor(Math.random() * COLORS.length)]
        : first.color;

    const def = getCardDef(first.kind);
    if (def && def.onStart) def.onStart(this, first);
    this._pushLog(`游戏开始，起始牌 ${this._cardLabel(first)}`);
  }

  get topCard() {
    return this.discardPile[this.discardPile.length - 1];
  }
  get currentPlayer() {
    return this.players[this.turnIndex];
  }

  _wrap(i) {
    const n = this.players.length;
    return ((i % n) + n) % n;
  }
  _advanceTurn(steps = 1) {
    this.turnIndex = this._wrap(this.turnIndex + this.direction * steps);
  }
  _peekNext(steps = 1) {
    return this.players[this._wrap(this.turnIndex + this.direction * steps)];
  }

  _draw(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        this._reshuffle();
        if (this.drawPile.length === 0) break;
      }
      out.push(this.drawPile.shift());
    }
    return out;
  }

  _reshuffle() {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop();
    const recycled = this.discardPile.map((c) =>
      c.isWild ? { ...c, color: 'wild' } : c
    );
    this.drawPile = shuffle(recycled);
    this.discardPile = [top];
    this._pushLog('抽牌堆用尽，弃牌堆重新洗入');
  }

  _findPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  // 基础匹配（颜色/符号），交给卡牌定义或默认规则
  canPlay(card) {
    const def = getCardDef(card.kind);
    if (def && def.isWild) return true;
    if (def && def.matches) return def.matches(this, card);
    return defaultMatches(this, card);
  }

  // 结合叠加 / 抽牌待决策的完整合法性
  _isLegalPlay(playerId, card) {
    if (this.drawnPending && this.drawnPending.playerId === playerId) {
      return card.id === this.drawnPending.cardId;
    }
    if (this.pendingDraw > 0) {
      return card.kind === this.pendingDrawType;
    }
    return this.canPlay(card);
  }

  playCard(playerId, cardId, chosenColor) {
    if (this.finished) return { ok: false, error: '游戏已结束' };
    if (playerId !== this.currentPlayer.id) return { ok: false, error: '还没轮到你' };

    const player = this._findPlayer(playerId);
    const idx = player.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) return { ok: false, error: '你没有这张牌' };

    const card = player.hand[idx];

    if (this.drawnPending && this.drawnPending.playerId === playerId) {
      if (card.id !== this.drawnPending.cardId)
        return { ok: false, error: '只能打出刚抽到的牌，或选择跳过' };
    } else if (this.pendingDraw > 0) {
      if (card.kind !== this.pendingDrawType)
        return { ok: false, error: `需叠加相同的牌，或抽 ${this.pendingDraw} 张` };
    } else if (!this.canPlay(card)) {
      return { ok: false, error: '这张牌不能出' };
    }

    const def = getCardDef(card.kind);
    const isWild = def && def.isWild;
    if (isWild) {
      if (!chosenColor || !COLORS.includes(chosenColor)) {
        return { ok: false, error: '出万能牌需要指定合法颜色' };
      }
    }

    player.hand.splice(idx, 1);
    const playedCard = isWild ? { ...card, color: chosenColor } : card;
    this.discardPile.push(playedCard);
    this.currentColor = isWild ? chosenColor : card.color;
    this.drawnPending = null;
    player.saidUno = false;
    this._pushLog(`${player.name} 出了 ${this._cardLabel(playedCard)}`);

    if (player.hand.length === 0) {
      this.finished = true;
      this.winnerId = player.id;
      this._pushLog(`${player.name} 出完手牌，获胜！`);
      return { ok: true };
    }

    // 执行卡牌效果（未定义 onPlay 则默认轮到下一位）
    if (def && def.onPlay) def.onPlay(this, playedCard);
    else this._advanceTurn(1);
    return { ok: true };
  }

  drawCard(playerId) {
    if (this.finished) return { ok: false, error: '游戏已结束' };
    if (playerId !== this.currentPlayer.id) return { ok: false, error: '还没轮到你' };
    if (this.drawnPending && this.drawnPending.playerId === playerId)
      return { ok: false, error: '请打出刚抽到的牌或选择跳过' };

    const player = this._findPlayer(playerId);

    // 叠加惩罚结算
    if (this.pendingDraw > 0) {
      const n = this.pendingDraw;
      player.hand.push(...this._draw(n));
      player.saidUno = false;
      this.pendingDraw = 0;
      this.pendingDrawType = null;
      this._pushLog(`${player.name} 接下 ${n} 张并被跳过`);
      this._advanceTurn(1);
      return { ok: true, drawnCount: n };
    }

    const drawn = this._draw(1);
    if (drawn.length === 0) return { ok: false, error: '没有可抽的牌' };
    player.hand.push(...drawn);
    player.saidUno = false;
    this._pushLog(`${player.name} 抽了 1 张牌`);

    if (this.options.drawPlay && this.canPlay(drawn[0])) {
      this.drawnPending = { playerId, cardId: drawn[0].id };
      return { ok: true, drawn: drawn[0], canPlayDrawn: true };
    }

    this._advanceTurn(1);
    return { ok: true, drawn: drawn[0] };
  }

  pass(playerId) {
    if (this.finished) return { ok: false, error: '游戏已结束' };
    if (!this.drawnPending || this.drawnPending.playerId !== playerId)
      return { ok: false, error: '当前无法跳过' };
    this.drawnPending = null;
    this._pushLog(`${this._findPlayer(playerId).name} 选择不出`);
    this._advanceTurn(1);
    return { ok: true };
  }

  callUno(playerId) {
    if (!this.options.callUno) return { ok: false, error: '本局未开启喊 UNO' };
    const player = this._findPlayer(playerId);
    if (!player) return { ok: false, error: '玩家不存在' };
    if (player.hand.length !== 1) return { ok: false, error: '只有剩 1 张牌时才能喊 UNO' };
    if (player.saidUno) return { ok: false, error: '你已经喊过了' };
    player.saidUno = true;
    this._pushLog(`${player.name} 喊了 UNO！`);
    return { ok: true };
  }

  catchUno(callerId, targetId) {
    if (!this.options.callUno) return { ok: false, error: '本局未开启喊 UNO' };
    const target = this._findPlayer(targetId);
    if (!target) return { ok: false, error: '目标不存在' };
    if (target.hand.length === 1 && !target.saidUno) {
      target.hand.push(...this._draw(2));
      target.saidUno = true;
      const caller = this._findPlayer(callerId);
      this._pushLog(
        `${caller ? caller.name : '有人'} 抓到 ${target.name} 漏喊 UNO，罚抓 2 张`
      );
      return { ok: true };
    }
    return { ok: false, error: '抓不到，对方无需喊或已喊过' };
  }

  _cardLabel(card) {
    const def = getCardDef(card.kind);
    if (def && def.label) return def.label(card);
    const colorCn = { red: '红', yellow: '黄', green: '绿', blue: '蓝', black: '黑', wild: '' };
    return `${colorCn[card.color] ?? ''}${card.glyph ?? card.kind}`;
  }

  _pushLog(text) {
    this.log.push(text);
    if (this.log.length > 50) this.log.shift();
  }

  setConnected(playerId, connected) {
    const p = this._findPlayer(playerId);
    if (p) p.connected = connected;
  }

  _playableFor(playerId) {
    if (this.finished || this.currentPlayer.id !== playerId) return [];
    const hand = this._findPlayer(playerId).hand || [];
    return hand.filter((c) => this._isLegalPlay(playerId, c)).map((c) => c.id);
  }

  stateFor(playerId) {
    return {
      finished: this.finished,
      winnerId: this.winnerId,
      currentColor: this.currentColor,
      direction: this.direction,
      topCard: this.topCard,
      drawPileCount: this.drawPile.length,
      currentPlayerId: this.currentPlayer.id,
      options: this.options,
      packs: this.packs,
      pendingDraw: this.pendingDraw,
      pendingDrawType: this.pendingDrawType,
      drawnPendingForYou:
        this.drawnPending && this.drawnPending.playerId === playerId
          ? this.drawnPending.cardId
          : null,
      log: this.log.slice(-12),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        handCount: p.hand.length,
        saidUno: p.saidUno,
        catchable: this.options.callUno && p.hand.length === 1 && !p.saidUno,
        hand: p.id === playerId ? p.hand : undefined,
      })),
      playableCardIds: this._playableFor(playerId),
    };
  }
}

module.exports = { Game };
