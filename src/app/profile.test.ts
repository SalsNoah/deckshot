import { describe, expect, it } from 'vitest';
import { RANKS, matchRpDelta, rankOf } from './profile';

describe('matchRpDelta', () => {
  it('awards 50 RP on a win at every rank', () => {
    for (const tier of RANKS) {
      expect(matchRpDelta(tier.min, 'win')).toBe(50);
    }
  });

  it('does not subtract RP from Rookie through Silver', () => {
    expect(matchRpDelta(0, 'loss')).toBe(0);
    expect(matchRpDelta(100, 'loss')).toBe(0);
    expect(matchRpDelta(449, 'loss')).toBe(0);
  });

  it('subtracts 50 at Gold and 15 more at each rank above', () => {
    expect(matchRpDelta(450, 'loss')).toBe(-50);
    expect(matchRpDelta(700, 'loss')).toBe(-65);
    expect(matchRpDelta(1000, 'loss')).toBe(-80);
    expect(matchRpDelta(1400, 'loss')).toBe(-95);
    expect(matchRpDelta(1900, 'loss')).toBe(-110);
  });

  it('leaves draws unchanged', () => {
    expect(matchRpDelta(800, 'draw')).toBe(0);
  });

  it('uses the rank before the match', () => {
    expect(rankOf(449).tier.id).toBe('silver');
    expect(rankOf(450).tier.id).toBe('gold');
  });
});
