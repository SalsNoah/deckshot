import type { CardDef, StreakDef, StreakId, ZoneModDef } from './types';

const operators: CardDef[] = [
  {
    id: 'rookie', name: 'ルーキー', en: 'ROOKIE', type: 'operator', cost: 1, rarity: 'common', role: 'assault',
    atk: 1, hp: 2, aim: 4, text: '', flavor: '誰だって最初はルーキーだ。',
  },
  {
    id: 'scout', name: 'スカウト', en: 'SCOUT', type: 'operator', cost: 1, rarity: 'common', role: 'support',
    atk: 1, hp: 1, aim: 5, abilities: [{ k: 'onDeploy', effect: { kind: 'draw', amount: 1 } }],
    text: '配置時：カードを1枚引く。', flavor: '「敵影確認、送る」',
  },
  {
    id: 'jolt', name: 'ジョルト', en: 'JOLT', type: 'operator', cost: 2, rarity: 'common', role: 'assault',
    atk: 2, hp: 3, aim: 6, abilities: [{ k: 'flank' }],
    text: '【裏取り】配置したターンAIM+3、ガードを無視。', flavor: 'エントリーは任せろ。',
  },
  {
    id: 'bulwark', name: 'ブルワーク', en: 'BULWARK', type: 'operator', cost: 2, rarity: 'common', role: 'tank',
    atk: 1, hp: 4, aim: 2, abilities: [{ k: 'guard' }],
    text: '【ガード】', flavor: '盾の後ろに下がってろ。',
  },
  {
    id: 'haze', name: 'ヘイズ', en: 'HAZE', type: 'operator', cost: 2, rarity: 'common', role: 'support',
    atk: 1, hp: 4, aim: 3, abilities: [{ k: 'onDeploy', effect: { kind: 'smokeZone' } }],
    text: '配置時：このゾーンにスモーク（このターン交戦なし）。', flavor: '見えなきゃ撃てない。',
  },
  {
    id: 'wire', name: 'ワイヤー', en: 'WIRE', type: 'operator', cost: 2, rarity: 'common', role: 'support',
    atk: 1, hp: 3, aim: 3, abilities: [{ k: 'trap', n: 2 }],
    text: '【トラップ2】このゾーンに敵が配置・移動してきたら、その敵に2ダメージ。', flavor: '足元注意だ。',
  },
  {
    id: 'kingpin', name: 'キングピン', en: 'KINGPIN', type: 'operator', cost: 2, rarity: 'rare', role: 'support',
    atk: 2, hp: 3, aim: 3, abilities: [{ k: 'eco', n: 1 }],
    text: '【エコ1】ターン開始時+1¢。', flavor: '金で買えない勝利はない。',
  },
  {
    id: 'blitz', name: 'ブリッツ', en: 'BLITZ', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 2, hp: 3, aim: 5, abilities: [{ k: 'onDeploy', effect: { kind: 'damageEnemiesInZone', amount: 1 } }],
    text: '配置時：このゾーンの敵全員に1ダメージ。', flavor: 'ピンを抜いてから入るのが礼儀。',
  },
  {
    id: 'breacher', name: 'ブリーチャー', en: 'BREACHER', type: 'operator', cost: 3, rarity: 'rare', role: 'support',
    atk: 2, hp: 4, aim: 5, abilities: [{ k: 'onDeploy', effect: { kind: 'flashZone' } }],
    text: '配置時：このゾーンの敵全員をフラッシュ（AIM0）。', flavor: '目を閉じろ、って言ったろ？',
  },
  {
    id: 'ghost', name: 'ゴースト', en: 'GHOST', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 3, hp: 2, aim: 6, abilities: [{ k: 'stealth' }],
    text: '【ステルス】配置したターンは射撃の対象にならない。', flavor: '足音はしなかった。',
  },
  {
    id: 'angel', name: 'エンジェル', en: 'ANGEL', type: 'operator', cost: 3, rarity: 'rare', role: 'support',
    atk: 2, hp: 4, aim: 3, abilities: [{ k: 'medic', n: 2 }],
    text: '【メディック2】ターン終了時、このゾーンの味方全員のHPを2回復。', flavor: '死ぬのは許可してない。',
  },
  {
    id: 'banshee', name: 'バンシー', en: 'BANSHEE', type: 'operator', cost: 3, rarity: 'rare', role: 'support',
    atk: 2, hp: 4, aim: 5, abilities: [{ k: 'suppress', n: 2 }],
    text: '【制圧2】このゾーンの敵のAIM-2。', flavor: '頭を上げたら終わりだよ。',
  },
  {
    id: 'hawk', name: 'ホーク', en: 'HAWK', type: 'operator', cost: 4, rarity: 'rare', role: 'sniper',
    atk: 3, hp: 2, aim: 4, abilities: [{ k: 'snipe' }],
    text: '【狙撃】', flavor: 'ワンショット、ワンキル。',
  },
  {
    id: 'reaper', name: 'リーパー', en: 'REAPER', type: 'operator', cost: 4, rarity: 'epic', role: 'assault',
    atk: 3, hp: 4, aim: 6, abilities: [{ k: 'grow', atk: 1, hp: 2 }],
    text: 'キルするたびATK+1・HP+2。', flavor: '死神は腹が減っている。',
  },
  {
    id: 'vanguard', name: 'ヴァンガード', en: 'VANGUARD', type: 'operator', cost: 4, rarity: 'epic', role: 'tank',
    atk: 3, hp: 6, aim: 4, abilities: [{ k: 'guard' }, { k: 'leader', n: 1 }],
    text: '【ガード】【指揮1】このゾーンの他の味方AIM+1。', flavor: '俺に続け！',
  },
  {
    id: 'titan', name: 'タイタン', en: 'TITAN', type: 'operator', cost: 5, rarity: 'epic', role: 'tank',
    atk: 3, hp: 7, aim: 2, abilities: [{ k: 'guard' }, { k: 'armored' }],
    text: '【ガード】【防弾】', flavor: '鉄の壁、歩く要塞。',
  },
  {
    id: 'ace', name: 'エース', en: 'ACE', type: 'operator', cost: 6, rarity: 'legend', role: 'assault',
    atk: 4, hp: 5, aim: 8, abilities: [{ k: 'chain' }],
    text: '【連鎖】キルするたびもう一度撃つ（最大+2回）。', flavor: '1v5？ ちょうどいい。',
  },
  {
    id: 'deadeye', name: 'デッドアイ', en: 'DEADEYE', type: 'operator', cost: 6, rarity: 'legend', role: 'sniper',
    atk: 5, hp: 4, aim: 5, abilities: [{ k: 'snipe' }, { k: 'pierce' }],
    text: '【狙撃】【貫通】', flavor: '2km先の心臓まで見える。',
  },
  {
    id: 'shard', name: 'シャード', en: 'SHARD', type: 'operator', cost: 4, rarity: 'epic', role: 'assault',
    atk: 7, hp: 1, aim: 8,
    text: 'ATK7 / HP1。ガラスの刃。', flavor: '割れなければ、切れる。',
  },
  {
    id: 'anchor', name: 'アンカー', en: 'ANCHOR', type: 'operator', cost: 4, rarity: 'rare', role: 'tank',
    atk: 0, hp: 10, aim: 1, abilities: [{ k: 'guard' }, { k: 'armored' }],
    text: 'ATK0。【ガード】【防弾】動く掩体。', flavor: 'ここから先は通さない。',
  },
  {
    id: 'mimic', name: 'ミミック', en: 'MIMIC', type: 'operator', cost: 4, rarity: 'epic', role: 'assault',
    atk: 1, hp: 2, aim: 3, abilities: [{ k: 'mimic' }],
    text: '【擬態】配置時：このゾーンで最もATKが高い敵のATK/HP/AIMをコピー。', flavor: '見た目は敵、中身も敵。',
  },
  {
    id: 'widow', name: 'ウィドウ', en: 'WIDOW', type: 'operator', cost: 5, rarity: 'epic', role: 'sniper',
    atk: 2, hp: 3, aim: 5, abilities: [{ k: 'bane' }],
    text: '【必殺】このユニットがダメージを与えた敵は即死する。', flavor: 'かすっただけで終わりだ。',
  },
  {
    id: 'leech', name: 'リーチ', en: 'LEECH', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 2, hp: 4, aim: 4, abilities: [{ k: 'drain' }],
    text: '【吸血】射撃で与えたダメージ分、自身のHPを回復。', flavor: '血は燃料だ。',
  },
  {
    id: 'blast', name: 'ブラスト', en: 'BLAST', type: 'operator', cost: 4, rarity: 'rare', role: 'support',
    atk: 2, hp: 3, aim: 3, abilities: [{ k: 'lastWords', effect: { kind: 'damageEnemiesInZone', amount: 3 } }],
    text: '【遺言】破壊時：このゾーンの敵全員に3ダメージ。', flavor: '死んでも爆弾は残る。',
  },
  {
    id: 'martyr', name: 'マーター', en: 'MARTYR', type: 'operator', cost: 2, rarity: 'epic', role: 'support',
    atk: 1, hp: 2, aim: 4, abilities: [{ k: 'lastWords', effect: { kind: 'damageAllInZone', amount: 2 } }],
    text: '【遺言】破壊時：このゾーンの全員（味方含む）に2ダメージ。', flavor: '一緒に逝こうぜ。',
  },
  {
    id: 'phoenix', name: 'フェニックス', en: 'PHOENIX', type: 'operator', cost: 4, rarity: 'epic', role: 'assault',
    atk: 3, hp: 3, aim: 4, abilities: [{ k: 'phoenix' }],
    text: '【不死鳥】初めて致命傷を受けたとき、HP1で耐える（1回のみ）。', flavor: '灰から立ち上がる。',
  },
  {
    id: 'pack', name: 'パック', en: 'PACK', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 1, hp: 4, aim: 3, abilities: [{ k: 'crowd' }],
    text: '【群れ】同じゾーンの他の味方1体につきATK+1。', flavor: '狼は群れで狩る。',
  },
  {
    id: 'lonewolf', name: 'ローンウルフ', en: 'LONEWOLF', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 2, hp: 3, aim: 5, abilities: [{ k: 'lonely', n: 3 }],
    text: '【孤高】同じゾーンに味方がいなければATK+3。', flavor: '一人のほうがマシだ。',
  },
  {
    id: 'scav', name: 'スキャヴ', en: 'SCAV', type: 'operator', cost: 3, rarity: 'rare', role: 'assault',
    atk: 2, hp: 3, aim: 4, abilities: [{ k: 'scavenge' }],
    text: '【漁り】同じゾーンの味方が破壊されるたび、ATK+1・最大HP+1・HP+1。', flavor: '死体からも戦利品。',
  },
  {
    id: 'spark', name: 'スパーク', en: 'SPARK', type: 'operator', cost: 2, rarity: 'epic', role: 'assault',
    atk: 5, hp: 2, aim: 7, abilities: [{ k: 'ephemeral' }],
    text: '【消滅】ターン終了時に破壊される。', flavor: '一瞬の閃光。',
  },
];

const gear: CardDef[] = [
  {
    id: 'smg', name: 'SMG VX-9', en: 'VX-9', type: 'gear', cost: 1, rarity: 'common', slot: 'weapon', weaponClass: 'smg',
    mods: { atk: 1, aim: 2 }, text: 'ATK+1 AIM+2', flavor: '先に撃て。',
  },
  {
    id: 'knife', name: 'タクティカルナイフ', en: 'KNIFE', type: 'gear', cost: 1, rarity: 'rare', slot: 'weapon', weaponClass: 'knife',
    mods: { aim: 4 }, abilities: [{ k: 'knifeKill' }], text: 'AIM+4。この武器でキルするとSP+1。', flavor: '屈辱を与えろ。',
  },
  {
    id: 'vest', name: '防弾ベスト', en: 'VEST', type: 'gear', cost: 1, rarity: 'common', slot: 'armor', weaponClass: 'armor',
    mods: { hp: 2 }, text: 'HP+2', flavor: 'ないよりマシ。',
  },
  {
    id: 'ar', name: 'AR M4-K', en: 'M4-K', type: 'gear', cost: 2, rarity: 'common', slot: 'weapon', weaponClass: 'ar',
    mods: { atk: 2, aim: 1 }, text: 'ATK+2 AIM+1', flavor: '迷ったらこれ。',
  },
  {
    id: 'shotgun', name: 'SG BR-12', en: 'BR-12', type: 'gear', cost: 2, rarity: 'common', slot: 'weapon', weaponClass: 'sg',
    mods: { atk: 3, aim: -1 }, abilities: [{ k: 'spread', n: 1 }], text: 'ATK+3 AIM-1【散弾1】', flavor: '角待ちの友。',
  },
  {
    id: 'heavyarmor', name: 'ヘビーアーマー', en: 'HEAVY', type: 'gear', cost: 2, rarity: 'common', slot: 'armor', weaponClass: 'armor',
    mods: { hp: 4 }, text: 'HP+4', flavor: 'フルバイの証。',
  },
  {
    id: 'sniper', name: 'SR AWM', en: 'AWM', type: 'gear', cost: 3, rarity: 'rare', slot: 'weapon', weaponClass: 'sr',
    mods: { atk: 2 }, abilities: [{ k: 'snipe' }], text: 'ATK+2【狙撃】', flavor: '一発で黙らせる。',
  },
  {
    id: 'lmg', name: 'LMG HAMMER', en: 'HAMMER', type: 'gear', cost: 3, rarity: 'rare', slot: 'weapon', weaponClass: 'lmg',
    mods: { atk: 3 }, abilities: [{ k: 'pierce' }], text: 'ATK+3【貫通】', flavor: '壁ごと抜け。',
  },
  {
    id: 'railgun', name: 'レールガン', en: 'RAILGUN', type: 'gear', cost: 4, rarity: 'epic', slot: 'weapon', weaponClass: 'sr',
    mods: { atk: 4, aim: 2 }, abilities: [{ k: 'ephemeral' }],
    text: 'ATK+4 AIM+2。【消滅】装備者はターン終了時に破壊される。', flavor: '撃て。あとは灰になれ。',
  },
  {
    id: 'hexscope', name: 'ヘックスコープ', en: 'HEXSCOPE', type: 'gear', cost: 2, rarity: 'epic', slot: 'weapon', weaponClass: 'sr',
    mods: { aim: 5 }, abilities: [{ k: 'bleed', n: 1 }],
    text: 'AIM+5。【出血1】ターン終了時、装備者に1ダメージ。', flavor: '精度と引き換えに、血を流せ。',
  },
  {
    id: 'banerounds', name: '必殺弾', en: 'BANE ROUNDS', type: 'gear', cost: 3, rarity: 'epic', slot: 'weapon', weaponClass: 'ar',
    mods: { atk: 1 }, abilities: [{ k: 'bane' }],
    text: 'ATK+1。【必殺】ダメージを与えた敵は即死する。', flavor: '一発で十分。',
  },
  {
    id: 'bombvest', name: '爆弾ベスト', en: 'BOMB VEST', type: 'gear', cost: 2, rarity: 'epic', slot: 'armor', weaponClass: 'armor',
    mods: { hp: 2 }, abilities: [{ k: 'lastWords', effect: { kind: 'damageEnemiesInZone', amount: 4 } }],
    text: 'HP+2。【遺言】破壊時：このゾーンの敵全員に4ダメージ。', flavor: '死ぬときは派手に。',
  },
];

const tactics: CardDef[] = [
  {
    id: 'eco', name: 'エコラウンド', en: 'ECO', type: 'tactic', cost: 0, rarity: 'common', target: 'none', speed: 0,
    effect: { kind: 'creditsNextTurn', amount: 5 }, text: '次のターン+5¢。', flavor: '今は我慢の時。',
  },
  {
    id: 'fallback', name: '撤退', en: 'FALLBACK', type: 'tactic', cost: 0, rarity: 'common', target: 'allyUnit', speed: 0,
    effect: { kind: 'recall' }, text: '味方1体を手札に戻す（装備は失う）。', flavor: '生きてりゃ次がある。',
  },
  {
    id: 'smoke', name: 'スモーク', en: 'SMOKE', type: 'tactic', cost: 1, rarity: 'common', target: 'zone', speed: 0,
    effect: { kind: 'smokeZone' }, text: 'このターン、そのゾーンでは交戦が起きない。', flavor: 'ワンウェイは練習済み。',
  },
  {
    id: 'flashbang', name: 'フラッシュバン', en: 'FLASH', type: 'tactic', cost: 1, rarity: 'common', target: 'zone', speed: 1,
    effect: { kind: 'flashZone' }, text: 'そのゾーンの敵全員のAIMを0にする（このターン）。', flavor: 'ポップフラッシュ！',
  },
  {
    id: 'stim', name: 'スティム', en: 'STIM', type: 'tactic', cost: 1, rarity: 'common', target: 'allyUnit', speed: 1,
    effect: { kind: 'stim', hp: 2, aim: 2 }, text: '味方1体の最大HP・HP+2、このターンAIM+2。', flavor: 'チクッとするぞ。',
  },
  {
    id: 'drone', name: '偵察ドローン', en: 'DRONE', type: 'tactic', cost: 2, rarity: 'common', target: 'none', speed: 0,
    effect: { kind: 'draw', amount: 2 }, text: 'カードを2枚引く。', flavor: '情報は弾より強い。',
  },
  {
    id: 'focusfire', name: '一斉射撃', en: 'FOCUS FIRE', type: 'tactic', cost: 2, rarity: 'rare', target: 'zone', speed: 1,
    effect: { kind: 'buffZoneAllies', atk: 1 }, text: 'そのゾーンの味方全員、このターンATK+1。', flavor: '合わせろ、3・2・1！',
  },
  {
    id: 'frag', name: 'フラググレネード', en: 'FRAG', type: 'tactic', cost: 2, rarity: 'common', target: 'zone', speed: 2,
    effect: { kind: 'damageEnemiesInZone', amount: 2 }, text: 'そのゾーンの敵全員に2ダメージ。', flavor: 'フラグアウト！',
  },
  {
    id: 'molotov', name: 'モロトフ', en: 'MOLOTOV', type: 'tactic', cost: 2, rarity: 'rare', target: 'zone', speed: 2,
    effect: { kind: 'fireZone', amount: 1, turns: 2 }, text: 'そのゾーンに炎。このターンと次のターンの終了時、敵全員に1ダメージ。', flavor: '角待ちは焼き払え。',
  },
  {
    id: 'precision', name: '精密射撃', en: 'PRECISION', type: 'tactic', cost: 2, rarity: 'rare', target: 'enemyUnit', speed: 2,
    effect: { kind: 'damageUnit', amount: 3 }, text: '敵1体に3ダメージ。', flavor: '頭を出した瞬間を狙え。',
  },
  {
    id: 'reinforce', name: '増援要請', en: 'REINFORCE', type: 'tactic', cost: 2, rarity: 'rare', target: 'none', speed: 3,
    effect: { kind: 'reinforce' }, text: '倒された自軍オペレーター1体を手札に戻す。', flavor: 'リスポーンはまだか！',
  },
  {
    id: 'c4', name: 'C4爆弾', en: 'C4', type: 'tactic', cost: 3, rarity: 'epic', target: 'zone', speed: 3,
    effect: { kind: 'plantC4' },
    text: '味方がいるゾーンに設置。次のターン終了時、相手がそのゾーンを支配していなければ爆発し、敵全員に6ダメージ＋2pt。',
    flavor: 'スパイク設置完了。',
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(
  [...operators, ...gear, ...tactics].map((c) => [c.id, c]),
);

export const ALL_CARDS: CardDef[] = [...operators, ...gear, ...tactics];

export function card(id: string): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

export const STREAKS: Record<StreakId, StreakDef> = {
  uav: {
    id: 'uav', name: 'UAV', en: 'UAV', cost: 2, speed: 0, target: 'none',
    text: '作戦中に即発動。このターンの間、相手の手札が見える。',
  },
  airstrike: {
    id: 'airstrike', name: '空爆', en: 'AIRSTRIKE', cost: 4, speed: 2, target: 'zone',
    text: 'そのゾーンの敵全員に3ダメージ。',
  },
  nuke: {
    id: 'nuke', name: '戦術核', en: 'TACTICAL NUKE', cost: 12, speed: 9, target: 'none',
    text: '次のターン終了時に着弾して勝利。その時点で相手が2ゾーン以上確保していれば阻止される。',
  },
};

export const STREAK_ORDER: StreakId[] = ['uav', 'airstrike', 'nuke'];

export const ZONE_MODS: Record<string, ZoneModDef> = {
  open: { id: 'open', name: 'オープンエリア', text: '効果なし' },
  highground: { id: 'highground', name: '高台', text: '支配すると2pt' },
  choke: { id: 'choke', name: 'チョークポイント', text: '配置上限：各2体' },
  longrange: { id: 'longrange', name: 'ロングレンジ', text: '【狙撃】持ちATK+2' },
  cqb: { id: 'cqb', name: '屋内戦', text: '全員ATK+1' },
  supply: { id: 'supply', name: '補給ポイント', text: '支配すると次ターン+2¢' },
  toxic: { id: 'toxic', name: '汚染区域', text: 'ターン終了時、全員に1ダメージ' },
  outpost: { id: 'outpost', name: '前線基地', text: 'ここに出すオペレーターのコスト-1' },
  dark: { id: 'dark', name: '暗所', text: '全員AIM0扱い（全員同時に撃つ）' },
  cover: { id: 'cover', name: '遮蔽物', text: 'ここで受ける射撃ダメージ-1' },
  radar: { id: 'radar', name: 'レーダー塔', text: '支配するとSP+1' },
};

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;

export interface DeckValidation {
  ok: boolean;
  errors: string[];
  counts: Map<string, number>;
}

/** Count occurrences of each card id in a list. */
export function countCards(cards: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Validate a constructed deck.
 * - Exactly DECK_SIZE cards
 * - Each id exists
 * - At most MAX_COPIES of any card
 * - If owned is provided, copies cannot exceed owned counts
 */
export function validateDeck(cards: string[], owned?: Record<string, number>): DeckValidation {
  const errors: string[] = [];
  const counts = countCards(cards);
  if (cards.length !== DECK_SIZE) errors.push(`デッキは${DECK_SIZE}枚で編成してください（現在${cards.length}枚）`);
  for (const [id, n] of counts) {
    if (!CARDS[id]) errors.push(`不明なカード: ${id}`);
    else if (n > MAX_COPIES) errors.push(`${CARDS[id].name}は最大${MAX_COPIES}枚まで（${n}枚）`);
    if (owned) {
      const have = owned[id] ?? 0;
      if (n > have) errors.push(`${CARDS[id]?.name ?? id}の所持が足りません（所持${have}/必要${n}）`);
    }
  }
  return { ok: errors.length === 0, errors, counts };
}

export interface DeckDef {
  id: string;
  name: string;
  en: string;
  style: string;
  description: string;
  color: string;
  cards: string[];
}

function expand(list: [string, number][]): string[] {
  return list.flatMap(([id, n]) => Array.from({ length: n }, () => id));
}

export const DECKS: DeckDef[] = [
  {
    id: 'rush',
    name: 'ラッシュ',
    en: 'RUSH',
    style: '速攻・高AIM',
    description: 'AIMの速いアサルトで先手を取り、キルを稼いでストリークで押し切る。フラッシュからのエントリーが基本。',
    color: '#ff4655',
    cards: expand([
      ['rookie', 2], ['jolt', 2], ['ghost', 2], ['blitz', 2], ['breacher', 1], ['reaper', 1], ['ace', 1],
      ['scout', 1], ['pack', 1], ['leech', 1], ['spark', 1],
      ['smg', 2], ['ar', 1], ['knife', 1], ['shotgun', 1], ['vest', 1],
      ['flashbang', 2], ['frag', 1], ['stim', 1], ['c4', 1], ['eco', 1], ['smoke', 1], ['molotov', 1], ['drone', 1],
    ]),
  },
  {
    id: 'sniper',
    name: 'スナイパー',
    en: 'SNIPER',
    style: '狙撃・防御',
    description: 'ガードで前線を固め、スナイパーで隣のゾーンまで撃ち抜く。スモークと精密射撃で盤面を管理する。',
    color: '#2ee6d6',
    cards: expand([
      ['scout', 2], ['bulwark', 2], ['hawk', 2], ['haze', 2], ['wire', 1], ['titan', 1], ['deadeye', 1],
      ['anchor', 1], ['widow', 1], ['lonewolf', 1], ['angel', 1],
      ['sniper', 2], ['heavyarmor', 1], ['vest', 1], ['hexscope', 1],
      ['smoke', 2], ['precision', 2], ['drone', 1], ['fallback', 1], ['molotov', 1], ['flashbang', 1], ['eco', 1], ['stim', 1],
    ]),
  },
  {
    id: 'tactical',
    name: 'タクティカル',
    en: 'TACTICAL',
    style: 'ユーティリティ・C4',
    description: '制圧・回復・トラップで有利な場所を作り、C4で一気に点を取る。経済力で後半に押し勝つ。',
    color: '#ffb547',
    cards: expand([
      ['rookie', 1], ['kingpin', 2], ['wire', 2], ['blitz', 1], ['banshee', 1], ['angel', 1], ['breacher', 1],
      ['vanguard', 1], ['hawk', 1], ['haze', 1], ['blast', 1], ['martyr', 1], ['scav', 1], ['mimic', 1],
      ['shotgun', 1], ['lmg', 1], ['vest', 1], ['bombvest', 1], ['banerounds', 1],
      ['c4', 2], ['molotov', 1], ['frag', 1], ['flashbang', 1], ['focusfire', 1], ['reinforce', 1], ['eco', 1], ['drone', 1],
    ]),
  },
];

const CUSTOM_DECK: DeckDef = {
  id: 'custom',
  name: 'カスタム',
  en: 'CUSTOM',
  style: '自由編成',
  description: '所持カードから自由に編成したデッキ。',
  color: '#2ee6d6',
  cards: [],
};

export function deckById(id: string): DeckDef {
  if (id === 'custom') return CUSTOM_DECK;
  return DECKS.find((d) => d.id === id) ?? DECKS[0];
}

/** Build an owned-count map from a card list (e.g. starter grant). */
export function ownedFromList(cards: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of countCards(cards)) out[id] = n;
  return out;
}
