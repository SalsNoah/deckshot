import { DECKS, ownedFromList, type Difficulty, validateDeck } from '../engine';

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
  /** Paid gacha tickets (1 ticket = 1 pull of 3 cards). */
  gachaTickets: number;
  /** Local calendar date `YYYY-MM-DD` of last free gacha, or null. */
  lastFreeGacha: string | null;
  difficulty: Difficulty;
  sound: boolean;
  seenHowTo: boolean;
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
  return { ...DEFAULT, name: `Player${Math.floor(1000 + Math.random() * 9000)}`, owned: { ...DEFAULT.owned }, deck: [...DEFAULT.deck] };
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

export interface RankTier {
  name: string;
  en: string;
  min: number;
  color: string;
}

export const RANKS: RankTier[] = [
  { name: 'ルーキー', en: 'ROOKIE', min: 0, color: '#8a96a8' },
  { name: 'ブロンズ', en: 'BRONZE', min: 100, color: '#c98a55' },
  { name: 'シルバー', en: 'SILVER', min: 250, color: '#c7d2de' },
  { name: 'ゴールド', en: 'GOLD', min: 450, color: '#ffc94d' },
  { name: 'プラチナ', en: 'PLATINUM', min: 700, color: '#5fe3d0' },
  { name: 'ダイヤ', en: 'DIAMOND', min: 1000, color: '#8fb8ff' },
  { name: 'マスター', en: 'MASTER', min: 1400, color: '#c77dff' },
  { name: 'レジェンド', en: 'LEGEND', min: 1900, color: '#ff4655' },
];

export function rankOf(rp: number): { tier: RankTier; next?: RankTier; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && rp >= RANKS[i + 1].min) i++;
  const tier = RANKS[i];
  const next = RANKS[i + 1];
  const progress = next ? (rp - tier.min) / (next.min - tier.min) : 1;
  return { tier, next, progress };
}

export const RP_TABLE: Record<Difficulty | 'online', { win: number; loss: number }> = {
  easy: { win: 12, loss: -6 },
  normal: { win: 25, loss: -12 },
  hard: { win: 40, loss: -15 },
  online: { win: 30, loss: -20 },
};
