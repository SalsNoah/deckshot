import type { GameState } from './types';

/** mulberry32 step: returns [value in [0,1), next state]. */
export function rngNext(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function random(g: GameState): number {
  const [v, next] = rngNext(g.rng);
  g.rng = next;
  return v;
}

export function randInt(g: GameState, n: number): number {
  return Math.floor(random(g) * n);
}

export function shuffle<T>(g: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(g, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
