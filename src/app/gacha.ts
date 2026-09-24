import { ALL_CARDS, type Rarity } from '../engine';

export const GACHA_PULL_SIZE = 3;

/** One ticket = one 3-card pull. */
export const TICKET_PACKS: { id: string; tickets: number; label: string; priceLabel: string }[] = [
  { id: 't1', tickets: 1, label: 'チケット×1', priceLabel: '¥120' },
  { id: 't5', tickets: 5, label: 'チケット×5', priceLabel: '¥480' },
  { id: 't11', tickets: 11, label: 'チケット×11', priceLabel: '¥980' },
];

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 70,
  rare: 22,
  epic: 6.5,
  legend: 1.5,
};

const BY_RARITY: Record<Rarity, string[]> = {
  common: [],
  rare: [],
  epic: [],
  legend: [],
};
for (const c of ALL_CARDS) BY_RARITY[c.rarity].push(c.id);

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function canFreeGacha(lastFreeGacha: string | null | undefined, now = new Date()): boolean {
  return lastFreeGacha !== todayKey(now);
}

export function freeGachaDate(now = new Date()): string {
  return todayKey(now);
}

function pickRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of ['common', 'rare', 'epic', 'legend'] as Rarity[]) {
    roll -= RARITY_WEIGHT[r];
    if (roll <= 0) return r;
  }
  return 'common';
}

function pickCard(rng: () => number): string {
  const rarity = pickRarity(rng);
  const pool = BY_RARITY[rarity];
  return pool[Math.floor(rng() * pool.length)] ?? ALL_CARDS[0].id;
}

/** Draw GACHA_PULL_SIZE cards. Uses Math.random unless rng provided. */
export function pullGacha(rng: () => number = Math.random): string[] {
  return Array.from({ length: GACHA_PULL_SIZE }, () => pickCard(rng));
}

/** Merge pulled card ids into an owned map (duplicates stack). */
export function grantCards(owned: Record<string, number>, pulled: string[]): Record<string, number> {
  const next = { ...owned };
  for (const id of pulled) next[id] = (next[id] ?? 0) + 1;
  return next;
}
