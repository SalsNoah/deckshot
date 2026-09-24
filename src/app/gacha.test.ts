import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card } from '../engine';
import { canRollKira, grantKira, KIRA_CHANCE, pullGacha, type PullResult } from './gacha';

describe('kira gacha', () => {
  it('only operators can roll kira', () => {
    for (const c of ALL_CARDS) {
      expect(canRollKira(c.id)).toBe(c.type === 'operator');
    }
  });

  it('rolls kira silently at KIRA_CHANCE for operators', () => {
    let i = 0;
    // Force first card pick to land on an operator: rarity common, index 0 = first common
    // Sequence: rarity roll (low → common), pool index (0), then kira roll (< 0.1)
    const rng = () => {
      const seq = [0.01, 0, KIRA_CHANCE - 0.001];
      return seq[i++] ?? 0.99;
    };
    const pulled = pullGacha(rng);
    expect(pulled).toHaveLength(3);
    expect(card(pulled[0].cardId).type).toBe('operator');
    expect(pulled[0].kira).toBe(true);
  });

  it('never marks gear or tactics as kira', () => {
    // Keep rolling until we get a non-operator and assert kira is false.
    // Use a deterministic rng that always picks legend then last index — still operator-heavy.
    // Instead: manually build PullResult path via grantKira + force canRollKira gate in pull.
    let foundNonOp = false;
    for (let n = 0; n < 200; n++) {
      const pulled = pullGacha(() => Math.random());
      for (const p of pulled) {
        if (!canRollKira(p.cardId)) {
          foundNonOp = true;
          expect(p.kira).toBe(false);
        }
      }
    }
    expect(foundNonOp).toBe(true);
  });

  it('grants kira copies only for kira pulls', () => {
    const pulled: PullResult[] = [
      { cardId: 'rookie', kira: true },
      { cardId: 'smg', kira: false },
      { cardId: 'rookie', kira: true },
    ];
    expect(grantKira({}, pulled)).toEqual({ rookie: 2 });
  });
});
