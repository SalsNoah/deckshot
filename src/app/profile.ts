import { DECKS, card, ownedFromList, type Difficulty, validateDeck } from '../engine';
import { FLOW_UNLOCK_MATCHES } from './gacha';

export interface Profile {
  name: string;
  rp: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  headshots: number;
  nukes: number;
  /** Cosmetic / CPU opponent preference; player battles use `deck`. */
  deckId: string;
  /** Fixed-size constructed deck (DECK_SIZE cards). */
  deck: string[];
  /** Owned card copies. */
  owned: Record<string, number>;
  /** Owned kira (shiny) operator copies. Cosmetic; still counts via `owned`. */
  kiraOwned: Record<string, number>;
  /** Owned signature operator copies. Cosmetic; still counts via `owned`. */
  signOwned: Record<string, number>;
  /** Owned motion-animated operator copies. Unlocked by battle use, not gacha. */
  flowOwned: Record<string, number>;
  /** Matches played with each operator (deck inclusion). */
  operatorUses: Record<string, number>;
  /** Paid gacha tickets (1 ticket = 1 pull of 3 cards). */
  gachaTickets: number;
  /** Local calendar date `YYYY-MM-DD` of last free gacha, or null. */
  lastFreeGacha: string | null;
  difficulty: Difficulty;
  sound: boolean;
  seenHowTo: boolean;
}

function countMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof n === 'number' && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

const KEY = 'deckshot.profile.v1';

function starterOwnedAndDeck(): { owned: Record<string, number>; deck: string[] } {
  const deck = [...DECKS[0].cards];
  return { owned: ownedFromList(deck), deck };
}

const STARTER = starterOwnedAndDeck();

const DEFAULT: Profile = {
  name: '',
  rp: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  kills: 0,
  headshots: 0,
  nukes: 0,
  deckId: 'custom',
  deck: STARTER.deck,
  owned: STARTER.owned,
  kiraOwned: {},
  signOwned: {},
  flowOwned: {},
  operatorUses: {},
  gachaTickets: 3,
  lastFreeGacha: null,
  difficulty: 'normal',
  sound: true,
  seenHowTo: false,
};

function migrate(raw: Partial<Profile> & Record<string, unknown>): Profile {
  const base: Profile = {
    ...DEFAULT,
    ...raw,
    owned: raw.owned && typeof raw.owned === 'object' ? { ...raw.owned } : { ...DEFAULT.owned },
    kiraOwned: countMap(raw.kiraOwned),
    signOwned: countMap(raw.signOwned),
    flowOwned: countMap(raw.flowOwned),
    operatorUses: countMap(raw.operatorUses),
    deck: Array.isArray(raw.deck) ? [...raw.deck] : [...DEFAULT.deck],
    gachaTickets: typeof raw.gachaTickets === 'number' ? raw.gachaTickets : DEFAULT.gachaTickets,
    lastFreeGacha: typeof raw.lastFreeGacha === 'string' ? raw.lastFreeGacha : null,
  };

  // Legacy profiles only had deckId presets — grant that preset as owned + active deck.
  if (!raw.owned || !Array.isArray(raw.deck)) {
    const preset = DECKS.find((d) => d.id === (raw.deckId as string)) ?? DECKS[0];
    base.owned = ownedFromList(preset.cards);
    base.deck = [...preset.cards];
    base.deckId = 'custom';
    if (typeof raw.gachaTickets !== 'number') base.gachaTickets = 3;
  }

  // Sanitize illegal decks against owned.
  const check = validateDeck(base.deck, base.owned);
  if (!check.ok) {
    const fallback = [...DECKS[0].cards];
    for (const id of fallback) base.owned[id] = Math.max(base.owned[id] ?? 0, fallback.filter((c) => c === id).length);
    base.deck = fallback;
  }

  return base;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    // ignore corrupt storage
  }
  return {
    ...DEFAULT,
    name: `Player${Math.floor(1000 + Math.random() * 9000)}`,
    owned: { ...DEFAULT.owned },
    kiraOwned: {},
    signOwned: {},
    flowOwned: {},
    operatorUses: {},
    deck: [...DEFAULT.deck],
  };
}

/** True when the player owns at least one kira copy of this operator. */
export function hasKira(p: { kiraOwned?: Record<string, number> } | null | undefined, cardId: string): boolean {
  return (p?.kiraOwned?.[cardId] ?? 0) > 0;
}

/** True when the player owns at least one signed copy of this operator. */
export function hasSign(p: { signOwned?: Record<string, number> } | null | undefined, cardId: string): boolean {
  return (p?.signOwned?.[cardId] ?? 0) > 0;
}

/** True when the player owns at least one motion-animated copy of this operator. */
export function hasFlow(p: { flowOwned?: Record<string, number> } | null | undefined, cardId: string): boolean {
  return (p?.flowOwned?.[cardId] ?? 0) > 0;
}

function sumMap(m: Record<string, number> | undefined): number {
  let n = 0;
  if (!m) return 0;
  for (const v of Object.values(m)) if (v > 0) n += Math.floor(v);
  return n;
}

/**
 * Mutually exclusive cosmetic copy counts among owned operators:
 * - `kira`: gold-frame only (no signature)
 * - `sign`: gold-frame + signature
 */
export function countCosmetics(p: {
  kiraOwned?: Record<string, number>;
  signOwned?: Record<string, number>;
} | null | undefined): { kira: number; sign: number } {
  const kiraOwned = p?.kiraOwned ?? {};
  const signOwned = p?.signOwned ?? {};
  const sign = sumMap(signOwned);
  let kira = 0;
  const ids = new Set([...Object.keys(kiraOwned), ...Object.keys(signOwned)]);
  for (const id of ids) {
    const k = Math.max(0, Math.floor(kiraOwned[id] ?? 0));
    const s = Math.max(0, Math.floor(signOwned[id] ?? 0));
    kira += Math.max(0, k - s);
  }
  return { kira, sign };
}

/**
 * Count one match for every unique operator in the deck.
 * At FLOW_UNLOCK_MATCHES uses, unlock portrait animation for that operator.
 */
export function applyOperatorMatchUses(
  profile: Pick<Profile, 'operatorUses' | 'flowOwned'>,
  deck: string[],
): Pick<Profile, 'operatorUses' | 'flowOwned'> {
  const operatorUses = { ...profile.operatorUses };
  const flowOwned = { ...profile.flowOwned };
  for (const id of new Set(deck)) {
    if (card(id).type !== 'operator') continue;
    const n = (operatorUses[id] ?? 0) + 1;
    operatorUses[id] = n;
    if (n >= FLOW_UNLOCK_MATCHES && (flowOwned[id] ?? 0) < 1) flowOwned[id] = 1;
  }
  return { operatorUses, flowOwned };
}


export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage may be unavailable (private mode)
  }
}

export function isDeckReady(p: Profile): boolean {
  return validateDeck(p.deck, p.owned).ok;
}

export type RankId = 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'legend';

export interface RankTier {
  id: RankId;
  name: string;
  en: string;
  min: number;
  color: string;
  /** RP lost on defeat. Rookie–Silver stay at 0. */
  loss: number;
}

export const WIN_RP = 50;

export const RANKS: RankTier[] = [
  { id: 'rookie', name: 'ルーキー', en: 'ROOKIE', min: 0, color: '#8a96a8', loss: 0 },
  { id: 'bronze', name: 'ブロンズ', en: 'BRONZE', min: 100, color: '#c98a55', loss: 0 },
  { id: 'silver', name: 'シルバー', en: 'SILVER', min: 250, color: '#c7d2de', loss: 0 },
  { id: 'gold', name: 'ゴールド', en: 'GOLD', min: 450, color: '#ffc94d', loss: 50 },
  { id: 'platinum', name: 'プラチナ', en: 'PLATINUM', min: 700, color: '#5fe3d0', loss: 65 },
  { id: 'diamond', name: 'ダイヤ', en: 'DIAMOND', min: 1000, color: '#8fb8ff', loss: 80 },
  { id: 'master', name: 'マスター', en: 'MASTER', min: 1400, color: '#c77dff', loss: 95 },
  { id: 'legend', name: 'レジェンド', en: 'LEGEND', min: 1900, color: '#ff4655', loss: 110 },
];

export function rankOf(rp: number): { tier: RankTier; next?: RankTier; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && rp >= RANKS[i + 1].min) i++;
  const tier = RANKS[i];
  const next = RANKS[i + 1];
  const progress = next ? (rp - tier.min) / (next.min - tier.min) : 1;
  return { tier, next, progress };
}

/** Win is always +50. Loss depends on the rank before the match. Draws are 0. */
export function matchRpDelta(rp: number, outcome: 'win' | 'loss' | 'draw'): number {
  if (outcome === 'win') return WIN_RP;
  if (outcome === 'loss') {
    const loss = rankOf(rp).tier.loss;
    return loss === 0 ? 0 : -loss;
  }
  return 0;
}
