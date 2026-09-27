import { DECKS, card, ownedFromList, type Difficulty, validateDeck } from '../engine';
import { FLOW_UNLOCK_MATCHES } from './gacha';

/** How many independent decks the player can keep. */
export const DECK_SLOTS = 3;
/** User volume steps: 0 = mute … 4 = max. */
export type VolStep = 0 | 1 | 2 | 3 | 4;
export const VOL_STEPS: VolStep[] = [0, 1, 2, 3, 4];
export const VOL_DEFAULT: VolStep = 3;

/** First-run flow: the training match, then the starter deck pick. */
export type Onboarding = 'tutorial' | 'deck' | 'done';

export function clampVol(n: unknown, fallback: VolStep = VOL_DEFAULT): VolStep {
  const v = typeof n === 'number' ? Math.floor(n) : fallback;
  if (v <= 0) return 0;
  if (v >= 4) return 4;
  return v as VolStep;
}

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
  /** Active slot's cards (mirrors `decks[activeDeck]`). */
  deck: string[];
  /** All saved deck slots. */
  decks: string[][];
  /** Index into `decks` currently selected for battle / edit. */
  activeDeck: number;
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
  /** BGM volume 0–4. */
  bgmVol: VolStep;
  /** SE volume 0–4. */
  seVol: VolStep;
  seenHowTo: boolean;
  onboarding: Onboarding;
}

/** Persist cards into the active slot and keep `deck` in sync. */
export function withDeckCards(p: Profile, cards: string[], slot = p.activeDeck): Pick<Profile, 'deck' | 'decks' | 'activeDeck' | 'deckId'> {
  const i = Math.max(0, Math.min(DECK_SLOTS - 1, slot));
  const decks = Array.from({ length: DECK_SLOTS }, (_, k) =>
    k === i ? [...cards] : [...(p.decks[k] ?? [])]);
  return { decks, activeDeck: i, deck: [...cards], deckId: 'custom' };
}

/** Switch the active slot (battle + edit target). */
export function selectDeckSlot(p: Profile, slot: number): Pick<Profile, 'deck' | 'decks' | 'activeDeck'> {
  const i = Math.max(0, Math.min(DECK_SLOTS - 1, slot));
  const decks = Array.from({ length: DECK_SLOTS }, (_, k) => [...(p.decks[k] ?? [])]);
  return { decks, activeDeck: i, deck: [...decks[i]!] };
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

function emptySlots(active: string[]): string[][] {
  return Array.from({ length: DECK_SLOTS }, (_, i) => (i === 0 ? [...active] : []));
}

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
  decks: emptySlots(STARTER.deck),
  activeDeck: 0,
  owned: STARTER.owned,
  kiraOwned: {},
  signOwned: {},
  flowOwned: {},
  operatorUses: {},
  gachaTickets: 3,
  lastFreeGacha: null,
  difficulty: 'normal',
  bgmVol: VOL_DEFAULT,
  seVol: VOL_DEFAULT,
  seenHowTo: false,
  onboarding: 'tutorial',
};

function migrateDecks(raw: Record<string, unknown>, deck: string[]): { decks: string[][]; activeDeck: number; deck: string[] } {
  const rawSlots = Array.isArray(raw.decks) ? raw.decks : null;
  let decks: string[][];
  if (rawSlots && rawSlots.length > 0) {
    decks = Array.from({ length: DECK_SLOTS }, (_, i) => {
      const slot = rawSlots[i];
      return Array.isArray(slot) ? slot.filter((id): id is string => typeof id === 'string') : [];
    });
  } else {
    decks = emptySlots(deck);
  }
  const activeDeck = Math.max(0, Math.min(DECK_SLOTS - 1, typeof raw.activeDeck === 'number' ? Math.floor(raw.activeDeck) : 0));
  // Prefer the active slot when it has cards; otherwise keep the legacy `deck` field.
  const active = decks[activeDeck]!.length ? [...decks[activeDeck]!] : [...deck];
  decks[activeDeck] = [...active];
  return { decks, activeDeck, deck: active };
}

function migrateVol(raw: Record<string, unknown>): { bgmVol: VolStep; seVol: VolStep } {
  if ('bgmVol' in raw || 'seVol' in raw) {
    return { bgmVol: clampVol(raw.bgmVol), seVol: clampVol(raw.seVol) };
  }
  // Legacy boolean `sound`.
  if (raw.sound === false) return { bgmVol: 0, seVol: 0 };
  return { bgmVol: VOL_DEFAULT, seVol: VOL_DEFAULT };
}

function migrate(raw: Partial<Profile> & Record<string, unknown>): Profile {
  let deck = Array.isArray(raw.deck) ? [...raw.deck] : [...DEFAULT.deck];
  let owned = raw.owned && typeof raw.owned === 'object' ? { ...raw.owned as Record<string, number> } : { ...DEFAULT.owned };

  // Legacy profiles only had deckId presets — grant that preset as owned + active deck.
  if (!raw.owned || !Array.isArray(raw.deck)) {
    const preset = DECKS.find((d) => d.id === (raw.deckId as string)) ?? DECKS[0];
    owned = ownedFromList(preset.cards);
    deck = [...preset.cards];
  }

  // Sanitize illegal active deck against owned.
  const check = validateDeck(deck, owned);
  if (!check.ok) {
    const fallback = [...DECKS[0].cards];
    for (const id of fallback) owned[id] = Math.max(owned[id] ?? 0, fallback.filter((c) => c === id).length);
    deck = fallback;
  }

  const slots = migrateDecks(raw, deck);
  // Drop illegal cards from non-active slots without wiping the whole slot.
  for (let i = 0; i < DECK_SLOTS; i++) {
    const cleaned = slots.decks[i]!.filter((id) => (owned[id] ?? 0) > 0);
    const counts: Record<string, number> = {};
    slots.decks[i] = cleaned.filter((id) => {
      counts[id] = (counts[id] ?? 0) + 1;
      return counts[id]! <= (owned[id] ?? 0);
    });
  }
  slots.deck = [...slots.decks[slots.activeDeck]!];

  const vols = migrateVol(raw);

  return {
    ...DEFAULT,
    name: typeof raw.name === 'string' ? raw.name : DEFAULT.name,
    rp: typeof raw.rp === 'number' ? raw.rp : DEFAULT.rp,
    wins: typeof raw.wins === 'number' ? raw.wins : DEFAULT.wins,
    losses: typeof raw.losses === 'number' ? raw.losses : DEFAULT.losses,
    draws: typeof raw.draws === 'number' ? raw.draws : DEFAULT.draws,
    kills: typeof raw.kills === 'number' ? raw.kills : DEFAULT.kills,
    headshots: typeof raw.headshots === 'number' ? raw.headshots : DEFAULT.headshots,
    nukes: typeof raw.nukes === 'number' ? raw.nukes : DEFAULT.nukes,
    owned,
    kiraOwned: countMap(raw.kiraOwned),
    signOwned: countMap(raw.signOwned),
    flowOwned: countMap(raw.flowOwned),
    operatorUses: countMap(raw.operatorUses),
    deckId: 'custom',
    ...slots,
    gachaTickets: typeof raw.gachaTickets === 'number' ? raw.gachaTickets : DEFAULT.gachaTickets,
    lastFreeGacha: typeof raw.lastFreeGacha === 'string' ? raw.lastFreeGacha : null,
    difficulty: (raw.difficulty as Difficulty) ?? DEFAULT.difficulty,
    ...vols,
    seenHowTo: !!raw.seenHowTo,
    // Saves from before the tutorial existed belong to players who are already past first launch.
    onboarding: raw.onboarding === 'tutorial' || raw.onboarding === 'deck' ? raw.onboarding : 'done',
  };
}

/** First-run pick: the chosen preset becomes the whole collection and deck slot 1. */
export function starterGrant(deckId: string): Pick<Profile, 'owned' | 'deck' | 'decks' | 'activeDeck' | 'deckId' | 'onboarding' | 'seenHowTo'> {
  const preset = DECKS.find((d) => d.id === deckId) ?? DECKS[0];
  return {
    owned: ownedFromList(preset.cards),
    deck: [...preset.cards],
    decks: emptySlots(preset.cards),
    activeDeck: 0,
    deckId: 'custom',
    onboarding: 'done',
    seenHowTo: true,
  };
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
    decks: emptySlots(DEFAULT.deck),
    activeDeck: 0,
    bgmVol: VOL_DEFAULT,
    seVol: VOL_DEFAULT,
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
