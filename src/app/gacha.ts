import { ALL_CARDS, card, type Rarity } from '../engine';

export const GACHA_PULL_SIZE = 3;

/** Number of single pulls in a multi (10連). */
export const GACHA_MULTI_PACKS = 10;

/** Ticket cost for a multi pull (1 ticket per pack). */
export const GACHA_MULTI_TICKETS = GACHA_MULTI_PACKS;

/** Operator pulls become kira (shiny) at this rate. Rolled silently. */
export const KIRA_CHANCE = 0.1;

/** Operator pulls get hair-flow portrait animation at this rate. Rolled silently. */
export const FLOW_CHANCE = 0.01;

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

export interface PullResult {
  cardId: string;
  /** True when this pull is a kira operator. */
  kira: boolean;
  /** True when this pull has hair-flow portrait animation. */
  flow: boolean;
}

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

/** Operators (characters) can roll cosmetics. Gear / tactics never do. */
export function canRollOperatorCosmetic(cardId: string): boolean {
  return card(cardId).type === 'operator';
}

/** @deprecated use canRollOperatorCosmetic */
export function canRollKira(cardId: string): boolean {
  return canRollOperatorCosmetic(cardId);
}

/** Draw `packs` × GACHA_PULL_SIZE cards. Cosmetics are rolled silently for operators. */
export function pullGacha(rng: () => number = Math.random, packs = 1): PullResult[] {
  const count = Math.max(1, Math.floor(packs)) * GACHA_PULL_SIZE;
  return Array.from({ length: count }, () => {
    const cardId = pickCard(rng);
    const op = canRollOperatorCosmetic(cardId);
    const kira = op && rng() < KIRA_CHANCE;
    const flow = op && rng() < FLOW_CHANCE;
    return { cardId, kira, flow };
  });
}

/** Merge pulled card ids into an owned map (duplicates stack). */
export function grantCards(owned: Record<string, number>, pulled: PullResult[] | string[]): Record<string, number> {
  const next = { ...owned };
  for (const p of pulled) {
    const id = typeof p === 'string' ? p : p.cardId;
    next[id] = (next[id] ?? 0) + 1;
  }
  return next;
}

/** Merge kira results into a kira-owned map (operators only). */
export function grantKira(kiraOwned: Record<string, number>, pulled: PullResult[]): Record<string, number> {
  const next = { ...kiraOwned };
  for (const p of pulled) {
    if (!p.kira) continue;
    next[p.cardId] = (next[p.cardId] ?? 0) + 1;
  }
  return next;
}

/** Merge hair-flow results into a flow-owned map (operators only). */
export function grantFlow(flowOwned: Record<string, number>, pulled: PullResult[]): Record<string, number> {
  const next = { ...flowOwned };
  for (const p of pulled) {
    if (!p.flow) continue;
    next[p.cardId] = (next[p.cardId] ?? 0) + 1;
  }
  return next;
}
