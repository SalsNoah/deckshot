import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card } from '../engine';
import {
  canRollOperatorCosmetic, FLOW_CHANCE, grantFlow, grantKira, KIRA_CHANCE, pullGacha, type PullResult,
} from './gacha';

describe('kira gacha', () => {
  it('only operators can roll cosmetics', () => {
    for (const c of ALL_CARDS) {
      expect(canRollOperatorCosmetic(c.id)).toBe(c.type === 'operator');
    }
  });

  it('rolls kira silently at KIRA_CHANCE for operators', () => {
    let i = 0;
    // rarity → common, pool index 0, kira yes, flow no
    const rng = () => {
      const seq = [0.01, 0, KIRA_CHANCE - 0.001, 0.99];
      return seq[i++] ?? 0.99;
    };
    const pulled = pullGacha(rng);
    expect(pulled).toHaveLength(3);
    expect(card(pulled[0].cardId).type).toBe('operator');
    expect(pulled[0].kira).toBe(true);
    expect(pulled[0].flow).toBe(false);
  });

  it('rolls hair-flow silently at FLOW_CHANCE for operators', () => {
    let i = 0;
    // rarity → common, pool index 0, kira no, flow yes
    const rng = () => {
      const seq = [0.01, 0, 0.99, FLOW_CHANCE - 0.0001];
      return seq[i++] ?? 0.99;
    };
    const pulled = pullGacha(rng);
    expect(card(pulled[0].cardId).type).toBe('operator');
    expect(pulled[0].kira).toBe(false);
    expect(pulled[0].flow).toBe(true);
  });

  it('never marks gear or tactics as kira or flow', () => {
    let foundNonOp = false;
    for (let n = 0; n < 200; n++) {
      const pulled = pullGacha(() => Math.random());
      for (const p of pulled) {
        if (!canRollOperatorCosmetic(p.cardId)) {
          foundNonOp = true;
          expect(p.kira).toBe(false);
          expect(p.flow).toBe(false);
        }
      }
    }
    expect(foundNonOp).toBe(true);
  });

  it('grants kira and flow copies only for matching pulls', () => {
    const pulled: PullResult[] = [
      { cardId: 'rookie', kira: true, flow: false },
      { cardId: 'smg', kira: false, flow: false },
      { cardId: 'ghost', kira: false, flow: true },
      { cardId: 'rookie', kira: true, flow: true },
    ];
    expect(grantKira({}, pulled)).toEqual({ rookie: 2 });
    expect(grantFlow({}, pulled)).toEqual({ ghost: 1, rookie: 1 });
  });
});
