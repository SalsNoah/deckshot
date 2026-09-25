import { card, type Ability } from '../../engine';

export const KEYWORD_TEXT: Record<string, { name: string; text: string }> = {
  guard: { name: 'ガード', text: '同じゾーンの敵はこのユニットを優先して撃つ。' },
  armored: { name: '防弾', text: '受けるダメージが1回ごとに-1（最低1）。' },
  flank: { name: '裏取り', text: '配置したターンだけAIM+3、ガードを無視して撃つ。' },
  stealth: { name: 'ステルス', text: '配置したターンは射撃の対象にならない。' },
  snipe: { name: '狙撃', text: 'ATKが最も高い敵を狙い、ガードを無視。自ゾーンに敵がいなければ隣のゾーンを撃つ（ダメージ-1）。' },
  spread: { name: '散弾', text: '撃った後、同じゾーンの他の敵全員にもダメージ。' },
  pierce: { name: '貫通', text: '倒した相手に余ったダメージを次の標的に与える。' },
  chain: { name: '連鎖', text: 'キルするたびにもう一度撃つ（最大+2回）。' },
  trap: { name: 'トラップ', text: 'このゾーンに敵が配置・移動してくると、その敵にダメージ。' },
  leader: { name: '指揮', text: '同じゾーンの他の味方のAIMを上げる。' },
  suppress: { name: '制圧', text: '同じゾーンの敵のAIMを下げる。' },
  medic: { name: 'メディック', text: 'ターン終了時、同じゾーンの味方を回復。' },
  eco: { name: 'エコ', text: 'ターン開始時にクレジットを得る。' },
  lastWords: { name: '遺言', text: '破壊されたとき効果を発動する。' },
  bane: { name: '必殺', text: 'このユニットがダメージを与えた敵は即座に破壊される。' },
  drain: { name: '吸血', text: '射撃で与えたダメージ分、自身のHPを回復する。' },
  phoenix: { name: '不死鳥', text: '初めて致命傷を受けたとき、HP1で耐える（1回のみ）。' },
  ephemeral: { name: '消滅', text: 'ターン終了時に破壊される。' },
  lonely: { name: '孤高', text: '同じゾーンに味方がいなければATKが上がる。' },
  crowd: { name: '群れ', text: '同じゾーンの他の味方1体につきATK+1。' },
  scavenge: { name: '漁り', text: '同じゾーンの味方が破壊されるたび、自身が強化される。' },
  mimic: { name: '擬態', text: '配置時、同じゾーンで最もATKが高い敵のステータスをコピーする。' },
  berserk: { name: '狂化', text: 'ダメージを受けるたびATKが上がる。' },
  bleed: { name: '出血', text: 'ターン終了時、自身にダメージを受ける。' },
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
