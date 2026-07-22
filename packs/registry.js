'use strict';

/**
 * 卡牌注册表 + 扩展组(DLC)系统
 * ------------------------------------------------------------------
 * 这是新增自定义卡牌的核心。每张"牌型"由一个卡牌定义(card definition)描述，
 * 一组卡牌定义打包成一个"扩展组(pack)"。核心 UNO 也是一个扩展组(id='core')。
 *
 * 卡牌定义字段：
 *   kind      唯一标识（字符串），同一 kind 不可重复
 *   glyph(card) 返回牌面显示的字符/emoji/数字（如 '7'、'⊘'、'💣'）
 *   isWild    是否为万能牌（出牌时需要选颜色，且可以任意出）
 *   build(COLORS) 返回该牌型的所有实例模板（不含 id），用于组牌
 *   matches(game, card) 可选：自定义"能否出这张牌"，不写则用默认规则
 *   onPlay(game, card)  可选：出牌时的效果（修改 game 状态、推进回合）
 *                       不写则默认轮到下一位
 *   onStart(game, card) 可选：作为起始翻牌时的即时效果
 *   label(card)         可选：日志里的中文名，不写则用 颜色+glyph
 *
 * 扩展组字段： id, name, description, core(是否核心), cards[]
 */

const COLORS = ['red', 'yellow', 'green', 'blue'];

const cardDefs = new Map(); // kind -> def
const packs = new Map(); // packId -> pack

function registerPack(pack) {
  if (!pack || !pack.id) throw new Error('扩展组需要 id');
  if (packs.has(pack.id)) throw new Error(`扩展组 id 重复: ${pack.id}`);
  packs.set(pack.id, pack);
  for (const def of pack.cards || []) {
    if (cardDefs.has(def.kind)) {
      throw new Error(`卡牌 kind 重复: ${def.kind}（来自扩展组 ${pack.id}）`);
    }
    def.pack = pack.id;
    cardDefs.set(def.kind, def);
  }
}

function getCardDef(kind) {
  return cardDefs.get(kind);
}

function hasPack(id) {
  return packs.has(id);
}

// 列出所有扩展组的元信息（供前端展示/选择）
function listPacks() {
  return [...packs.values()].map((p) => ({
    id: p.id,
    name: p.name || p.id,
    description: p.description || '',
    core: !!p.core,
  }));
}

/**
 * 按启用的扩展组构建整副牌（返回不含 id 的卡牌模板数组）
 * 核心组 'core' 始终包含。
 */
function buildDeckTemplates(enabledPackIds) {
  const set = new Set(enabledPackIds && enabledPackIds.length ? enabledPackIds : []);
  set.add('core');
  const out = [];
  for (const pack of packs.values()) {
    if (!set.has(pack.id)) continue;
    for (const def of pack.cards || []) {
      const templates = def.build ? def.build(COLORS) : [];
      for (const t of templates) {
        if (t.glyph == null && def.glyph) t.glyph = def.glyph(t);
        t.isWild = !!def.isWild; // 随牌携带，前端据此弹出选色
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * 默认匹配规则：同色，或同"符号"(数字比数值、功能牌比种类)
 */
function sameSymbol(a, b) {
  if (a.value != null || b.value != null) return a.value === b.value;
  return a.kind === b.kind;
}

function defaultMatches(game, card) {
  if (card.color === game.currentColor) return true;
  return sameSymbol(card, game.topCard);
}

module.exports = {
  COLORS,
  registerPack,
  getCardDef,
  hasPack,
  listPacks,
  buildDeckTemplates,
  defaultMatches,
};
