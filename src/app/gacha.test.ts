import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card } from '../engine';
import {
  canRollOperatorCosmetic, FLOW_UNLOCK_MATCHES, grantKira, grantSign, KIRA_CHANCE, KIRA_ONLY_CHANCE,
  pullGacha, rollOperatorCosmetic, SIGN_CHANCE, type PullResult,
} from './gacha';
import { applyOperatorMatchUses } from './profile';

describe('kira / sign gacha', () => {
  it('only operators can roll cosmetics', () => {
    for (const c of ALL_CARDS) {
      expect(canRollOperatorCosmetic(c.id)).toBe(c.type === 'operator');
    }
  });

  it('keeps cosmetic bands at 90% / 9% / 1%', () => {
    expect(SIGN_CHANCE).toBe(0.01);
    expect(KIRA_ONLY_CHANCE).toBe(0.09);
    expect(KIRA_CHANCE).toBeCloseTo(0.1);
  });

  it('rolls gold+sign in the first 1% band', () => {
    expect(rollOperatorCosmetic(() => 0)).toEqual({ kira: true, sign: true });
    expect(rollOperatorCosmetic(() => SIGN_CHANCE - 0.0001)).toEqual({ kira: true, sign: true });
  });

  it('rolls gold-only in the next 9% band', () => {
    expect(rollOperatorCosmetic(() => SIGN_CHANCE)).toEqual({ kira: true, sign: false });
    expect(rollOperatorCosmetic(() => KIRA_CHANCE - 0.0001)).toEqual({ kira: true, sign: false });
  });

  it('rolls normal outside the gold bands', () => {
    expect(rollOperatorCosmetic(() => KIRA_CHANCE)).toEqual({ kira: false, sign: false });
    expect(rollOperatorCosmetic(() => 0.99)).toEqual({ kira: false, sign: false });
  });

  it('rolls cosmetics silently for operators', () => {
    let i = 0;
    // rarity → common, pool index 0, then cosmetic in sign band
    const rng = () => {
      const seq = [0.01, 0, SIGN_CHANCE - 0.001];
      return seq[i++] ?? 0.99;
    };
    const pulled = pullGacha(rng);
    expect(pulled).toHaveLength(3);
    expect(card(pulled[0].cardId).type).toBe('operator');
    expect(pulled[0].kira).toBe(true);
    expect(pulled[0].sign).toBe(true);
  });

  it('never marks gear or tactics as kira or sign', () => {
    let foundNonOp = false;
    for (let n = 0; n < 200; n++) {
      const pulled = pullGacha(() => Math.random());
      for (const p of pulled) {
        if (!canRollOperatorCosmetic(p.cardId)) {
          foundNonOp = true;
          expect(p.kira).toBe(false);
          expect(p.sign).toBe(false);
        }
      }
    }
    expect(foundNonOp).toBe(true);
  });

  it('draws multi packs as packs × pull size', () => {
    const pulled = pullGacha(() => 0.5, 10);
    expect(pulled).toHaveLength(30);
  });

  it('grants kira and sign copies only for matching pulls', () => {
    const pulled: PullResult[] = [
      { cardId: 'rookie', kira: true, sign: false },
      { cardId: 'smg', kira: false, sign: false },
      { cardId: 'ghost', kira: true, sign: true },
      { cardId: 'rookie', kira: true, sign: true },
    ];
    expect(grantKira({}, pulled)).toEqual({ rookie: 2, ghost: 1 });
    expect(grantSign({}, pulled)).toEqual({ ghost: 1, rookie: 1 });
  });
});

describe('animation unlock from battles', () => {
  it('counts unique operators in the deck once per match', () => {
    const once = applyOperatorMatchUses({ operatorUses: {}, flowOwned: {} }, ['rookie', 'rookie', 'smg', 'scout']);
    expect(once.operatorUses).toEqual({ rookie: 1, scout: 1 });
    expect(once.flowOwned).toEqual({});
  });

  it('unlocks flow at FLOW_UNLOCK_MATCHES uses', () => {
    const before = { operatorUses: { rookie: FLOW_UNLOCK_MATCHES - 1 }, flowOwned: {} as Record<string, number> };
    const after = applyOperatorMatchUses(before, ['rookie']);
    expect(after.operatorUses.rookie).toBe(FLOW_UNLOCK_MATCHES);
    expect(after.flowOwned.rookie).toBe(1);
  });
});
