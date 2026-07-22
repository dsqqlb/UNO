// 命令式动画辅助：飞行卡牌、彩带等。组件通过模板 ref 提供目标元素。

// 牌面显示：优先用服务器下发的 glyph（emoji/数字/符号），兼容旧字段
export function cardText(card) {
  if (card.glyph != null) return String(card.glyph);
  if (card.value != null) return String(card.value);
  return '?';
}

// 颜色 class 直接用 card.color：red/yellow/green/blue/black/wild
export function cardColorClass(card) {
  return card.color || 'wild';
}

// 构造一张用于飞行动画的卡面 DOM（脱离 Vue，独立克隆）
export function buildCardFace(card) {
  const el = document.createElement('div');
  el.className = `card ${cardColorClass(card)}`;
  const t = cardText(card);
  el.innerHTML = `<span class="corner">${t}</span>${t}<span class="corner br">${t}</span>`;
  return el;
}

export function buildCardBack() {
  const el = document.createElement('div');
  el.className = 'card-back';
  el.textContent = 'UNO';
  return el;
}

export function cssEsc(v) {
  return window.CSS && CSS.escape ? CSS.escape(v) : v;
}

// 重新触发一次性 CSS 动画
export function retrigger(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// 让一张卡从 fromEl 飞到 toEl
export function flyCard(fromEl, toEl, faceEl, opts = {}) {
  if (!fromEl || !toEl) return;
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const dur = opts.dur || 460;
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - fromCx;
  const dy = to.top + to.height / 2 - fromCy;

  faceEl.classList.add('fly-card');
  faceEl.style.position = 'fixed';
  faceEl.style.left = fromCx + 'px';
  faceEl.style.top = fromCy + 'px';
  faceEl.style.margin = '0';
  faceEl.style.transform = 'translate(-50%, -50%) scale(1)';
  document.body.appendChild(faceEl);

  requestAnimationFrame(() => {
    faceEl.style.transition = `transform ${dur}ms cubic-bezier(.2,.8,.2,1), opacity ${dur}ms ease`;
    faceEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${
      opts.rot || 0
    }deg) scale(${opts.scale || 1})`;
    if (opts.fade) faceEl.style.opacity = '0.25';
  });

  setTimeout(() => {
    faceEl.remove();
    opts.onDone && opts.onDone();
  }, dur + 40);
}

// 胜利彩带
export function spawnConfetti() {
  const colors = ['#e4392f', '#f2c400', '#3aa544', '#2879c0', '#ffffff'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    const dur = 2.2 + Math.random() * 1.6;
    c.style.animation = `confetti-fall ${dur}s linear forwards`;
    c.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), (dur + 0.6) * 1000);
  }
}
