import { card, type Ability } from '../../engine';

/** The only bracketed keywords. Every other ability is written out on the card itself. */
export const KEYWORD_TEXT: Record<string, { name: string; text: string }> = {
  guard: { name: 'ガード', text: '同じゾーンの敵はこのユニットを優先して撃つ。' },
  stealth: { name: '潜伏', text: '配置したターンは射撃の対象にならない。' },
  armored: { name: '防弾', text: '受けるダメージが1回ごとに-1（最低1）。' },
  drain: { name: '吸血', text: '射撃で与えたダメージ分、自身のHPを回復する。' },
  bane: { name: '必殺', text: 'このユニットがダメージを与えた敵は即座に破壊される。' },
  berserk: { name: '狂化', text: 'ダメージを受けて生き残るたびATK+1。' },
  bond: { name: '絆', text: '指定のオペレーターと同じゾーンにいるとき、自身が強化される。' },
};

export function cardKeywords(cardId: string): { name: string; text: string }[] {
  const def = card(cardId);
  const seen = new Set<string>();
  const out: { name: string; text: string }[] = [];
  for (const a of def.abilities ?? []) {
    const k = (a as Ability).k;
    if (KEYWORD_TEXT[k] && !seen.has(k)) {
      seen.add(k);
      out.push(KEYWORD_TEXT[k]);
    }
  }
  return out;
}

export const TYPE_LABEL = {
  operator: 'オペレーター',
  gear: '装備',
  tactic: '戦術',
};

export const TARGET_HINT: Record<string, string> = {
  operator: '配置するゾーンをタップ',
  gear: '装備させる味方をタップ',
  zone: '対象のゾーンをタップ',
  enemyUnit: '対象の敵をタップ',
  allyUnit: '対象の味方をタップ',
  none: '',
};

export const REASON_TEXT: Record<string, string> = {
  score: 'ポイント到達',
  nuke: '戦術核',
  turnLimit: 'ターン終了判定',
  surrender: '降参',
  disconnect: '切断',
};
