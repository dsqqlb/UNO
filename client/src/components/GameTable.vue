<template>
  <section class="screen table-screen">
    <div ref="colorFlash" class="color-flash"></div>
    <div ref="turnBanner" class="turn-banner"></div>

    <div class="play-area">
      <!-- 对家 / 对面 -->
      <OpponentSeat
        v-if="seats.top"
        class="seat-top"
        :player="seats.top"
        :current-id="g.currentPlayerId"
        @catch="doCatch"
      />
      <!-- 上家（左） -->
      <OpponentSeat
        v-if="seats.left"
        class="seat-left"
        orient="v"
        :player="seats.left"
        :current-id="g.currentPlayerId"
        @catch="doCatch"
      />
      <!-- 下家（右） -->
      <OpponentSeat
        v-if="seats.right"
        class="seat-right"
        orient="v"
        :player="seats.right"
        :current-id="g.currentPlayerId"
        @catch="doCatch"
      />

      <!-- 中央：抽牌堆 / 弃牌堆 / 回合信息 -->
      <div class="center">
        <div class="piles">
          <div ref="drawPile" class="pile draw-pile" title="抽一张牌" @click="onDraw">
            <div class="card-back">UNO</div>
            <span class="pile-count">{{ g.drawPileCount }} 张</span>
          </div>

          <div ref="discardPile" class="pile discard-pile">
            <UnoCard v-if="g.topCard" :card="g.topCard" />
          </div>
        </div>

        <div class="turn-info">
          <div>当前颜色：<span class="color-chip" :style="{ background: colorCss }"></span></div>
          <div class="turn-text">{{ turnText }}</div>
          <div class="dir-text">方向：{{ g.direction === 1 ? '顺时针 ↻' : '逆时针 ↺' }}</div>
          <div class="stack-text">{{ stackText }}</div>
          <button v-if="g.drawnPendingForYou" class="btn small" @click="onPass">跳过（不出）</button>
        </div>
      </div>
    </div>

    <GameLog :log="g.log || []" />

    <!-- 我的手牌 -->
    <div ref="myArea" class="my-area" :class="{ 'my-turn': myTurn }">
      <div class="my-header">
        <span class="my-name">{{ me ? me.name : '' }}（你）</span>
        <span class="my-count">{{ me ? me.handCount : 0 }} 张</span>
        <button v-if="showUno" class="uno-btn" @click="onUno">UNO!</button>
      </div>
      <TransitionGroup name="cardin" tag="div" class="hand">
        <UnoCard
          v-for="card in myHand"
          :key="card.id"
          :card="card"
          :data-cid="card.id"
          :class="{
            playable: myTurn && playable.has(card.id),
            disabled: myTurn && !playable.has(card.id),
          }"
          @click="onCardClick(card)"
        />
      </TransitionGroup>
    </div>

    <ColorModal v-if="colorModal" @pick="pickColor" />
    <OverModal v-if="g.finished" :state="g" @restart="onRestart" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { store, showToast } from '../store';
import {
  playCard,
  drawCard,
  pass,
  callUno as callUnoAction,
  catchUno,
  restart,
} from '../net';
import {
  flyCard,
  retrigger,
  spawnConfetti,
  cssEsc,
  buildCardFace,
  buildCardBack,
} from '../anim';
import UnoCard from './UnoCard.vue';
import OpponentSeat from './OpponentSeat.vue';
import GameLog from './GameLog.vue';
import ColorModal from './ColorModal.vue';
import OverModal from './OverModal.vue';

const COLOR_CSS = { red: '#e4392f', yellow: '#f2c400', green: '#3aa544', blue: '#2879c0' };

// 模板引用（动画目标）
const colorFlash = ref(null);
const turnBanner = ref(null);
const drawPile = ref(null);
const discardPile = ref(null);
const myArea = ref(null);

// 选颜色弹窗
const colorModal = ref(false);
let pendingCardId = null;

// 派生状态
const g = computed(() => store.game || { players: [], log: [] });
const me = computed(() => g.value.players.find((p) => p.id === store.you));

// 按座次把对手安排到 上家(左)/下家(右)/对家(对面)
const seats = computed(() => {
  const players = g.value.players || [];
  const n = players.length;
  const myIndex = players.findIndex((p) => p.id === store.you);
  if (myIndex < 0 || n < 2) return {};
  const at = (offset) => players[(myIndex + offset + n) % n];
  if (n === 2) return { top: at(1) }; // 对面
  if (n === 3) return { left: at(-1), right: at(1) }; // 上家左 / 下家右
  return { left: at(-1), right: at(1), top: at(2) }; // 4 人：+对家对面
});
const myHand = computed(() => (me.value && me.value.hand ? me.value.hand : []));
const myTurn = computed(() => g.value.currentPlayerId === store.you && !g.value.finished);
const playable = computed(() => new Set(g.value.playableCardIds || []));
const colorCss = computed(() => COLOR_CSS[g.value.currentColor] || '#999');
const showUno = computed(
  () =>
    !g.value.finished &&
    g.value.options &&
    g.value.options.callUno &&
    me.value &&
    me.value.handCount === 1 &&
    !me.value.saidUno
);
const turnText = computed(() => {
  if (g.value.finished) return '游戏结束';
  if (myTurn.value) return '轮到你了';
  const c = g.value.players.find((p) => p.id === g.value.currentPlayerId);
  return `轮到 ${c ? c.name : '?'}`;
});
const stackText = computed(() => {
  if (!(g.value.pendingDraw > 0)) return '';
  const t = g.value.pendingDrawType === 'wild_draw4' ? '+4' : '+2';
  return myTurn.value
    ? `叠加中：接一张 ${t}，或点抽牌堆抽 ${g.value.pendingDraw} 张`
    : `叠加中：累计 ${g.value.pendingDraw} 张待承受`;
});

// ---------- 交互 ----------
function onCardClick(card) {
  if (!(myTurn.value && playable.value.has(card.id))) return;
  const isWild = card.kind === 'wild' || card.kind === 'wild_draw4';
  if (isWild) {
    pendingCardId = card.id;
    colorModal.value = true;
  } else {
    playCard(card.id);
  }
}
function pickColor(color) {
  if (pendingCardId) {
    playCard(pendingCardId, color);
    pendingCardId = null;
  }
  colorModal.value = false;
}
function onDraw() {
  if (!myTurn.value) return;
  if (g.value.drawnPendingForYou) {
    showToast('请打出刚抽到的牌或点跳过');
    return;
  }
  drawCard();
}
function onPass() {
  pass();
}
function onUno() {
  callUnoAction();
}
function doCatch(id) {
  catchUno(id);
}
function onRestart() {
  restart();
}

// ---------- 动画 ----------
function animatePlay(prev, s) {
  const discard = discardPile.value;
  if (!discard) return;
  const topEl = discard.querySelector('.card');
  const actorId = prev.currentPlayerId;
  let fromEl =
    actorId === store.you
      ? myArea.value
      : document.querySelector(`.opponent[data-pid="${cssEsc(actorId)}"]`);
  if (!fromEl) fromEl = drawPile.value;

  const face = buildCardFace(s.topCard);
  if (topEl) topEl.style.visibility = 'hidden';
  flyCard(fromEl, discard, face, {
    dur: 460,
    rot: Math.random() * 16 - 8,
    onDone: () => {
      const t = discard.querySelector('.card');
      if (t) {
        t.style.visibility = 'visible';
        retrigger(t, 'slam');
      }
      const ring = document.createElement('div');
      ring.className = 'play-ring';
      discard.appendChild(ring);
      setTimeout(() => ring.remove(), 520);
    },
  });
}

function animateDraws(prev, s) {
  const drawEl = drawPile.value;
  if (!drawEl) return;

  // 牌堆顶"揭起"一下，强化从牌堆抽牌的感觉
  const deckTop = drawEl.querySelector('.card-back');
  if (deckTop) retrigger(deckTop, 'peel');

  s.players.forEach((p) => {
    const prevP = prev.players.find((x) => x.id === p.id);
    if (!prevP) return;
    const diff = p.handCount - prevP.handCount;
    if (diff <= 0) return;

    if (p.id === store.you) {
      // 我抽到的牌：面朝下从牌堆飞到手牌确切位置，落定后翻开
      const meNow = s.players.find((x) => x.id === store.you);
      const prevIds = new Set((prevP.hand || []).map((c) => c.id));
      const newCards = (meNow.hand || []).filter((c) => !prevIds.has(c.id));
      newCards.slice(0, 6).forEach((card, i) => {
        const cardEl = document.querySelector(`.hand [data-cid="${cssEsc(card.id)}"]`);
        if (!cardEl) return;
        cardEl.style.visibility = 'hidden'; // 飞行期间先藏起真牌
        setTimeout(() => {
          flyCard(drawEl, cardEl, buildCardBack(), {
            dur: 480,
            rot: -6 + Math.random() * 12,
            onDone: () => {
              cardEl.style.visibility = 'visible';
              retrigger(cardEl, 'draw-land'); // 落定翻开
            },
          });
        }, i * 110);
      });
    } else {
      // 对手抽牌：面朝下从牌堆飞向其头像
      const target = document.querySelector(`.opponent[data-pid="${cssEsc(p.id)}"]`);
      if (!target) return;
      const n = Math.min(diff, 4);
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          flyCard(drawEl, target, buildCardBack(), { dur: 440, fade: true, scale: 0.62 });
        }, i * 100);
      }
    }
  });
}

function flashColor(color) {
  const el = colorFlash.value;
  if (!el) return;
  el.style.color = COLOR_CSS[color] || '#fff';
  retrigger(el, 'flash');
}

function showTurnBanner(s) {
  const el = turnBanner.value;
  if (!el) return;
  if (s.currentPlayerId === store.you) {
    el.textContent = '轮到你了';
    el.classList.remove('other');
  } else {
    const cur = s.players.find((p) => p.id === s.currentPlayerId);
    el.textContent = `轮到 ${cur ? cur.name : '?'}`;
    el.classList.add('other');
  }
  retrigger(el, 'show');
}

// 对比前后状态触发动画
watch(
  () => store.game,
  (s, prev) => {
    if (!s) return;
    if (prev) {
      if (s.currentColor !== prev.currentColor) flashColor(s.currentColor);
      if (s.topCard && prev.topCard && s.topCard.id !== prev.topCard.id) {
        animatePlay(prev, s);
      }
      animateDraws(prev, s);
      if (s.currentPlayerId !== prev.currentPlayerId && !s.finished) showTurnBanner(s);
      if (s.finished && !prev.finished) spawnConfetti();
    } else if (!s.finished && s.currentPlayerId === store.you) {
      showTurnBanner(s);
    }
  },
  { flush: 'post' } // 等 DOM 更新后再跑动画，能定位到新渲染的手牌元素
);
</script>
