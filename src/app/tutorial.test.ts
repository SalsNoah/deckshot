import { describe, expect, it } from 'vitest';
import { checkPlan, resolveTurn, viewFor, type GameEvent, type GameState } from '../engine';
import { createTutorialGame, gateAllows, TUTORIAL_TURNS, tutorialPlans, tutorialSteps } from './tutorial';

function playTurn(g: GameState): { g: GameState; events: GameEvent[] } {
  const plans = tutorialPlans(g);
  for (const p of [0, 1] as const) {
    expect(checkPlan(viewFor(g, p), plans[p]).errors, `turn ${g.turn} player ${p}`).toEqual([]);
  }
  const res = resolveTurn(g, plans);
  return { g: res.state, events: res.events };
}

const score = (g: GameState) => [g.players[0].score, g.players[1].score];

describe('tutorial scenario', () => {
  it('plays out the scripted story and the player wins on the last scripted turn', () => {
    let g = createTutorialGame('P');
    const log: GameEvent[][] = [];
    for (let t = 1; t <= TUTORIAL_TURNS; t++) {
      expect(g.turn).toBe(t);
      const r = playTurn(g);
      g = r.g;
      log.push(r.events);
    }
    const [t1, t2, t3, t4] = log;
    const hs = (ev: GameEvent[]) => ev.some((e) => e.e === 'shot' && e.p === 0 && e.hs);

    expect(hs(t1!)).toBe(true);
    expect(hs(t2!)).toBe(true);
    expect(t3!.some((e) => e.e === 'multikill' && e.p === 0 && e.count === 2)).toBe(true);
    expect(t4!.some((e) => e.e === 'multikill' && e.p === 0 && e.ace)).toBe(true);

    expect(g.winner).toBe(0);
    expect(g.winReason).toBe('score');
    expect(score(g)).toEqual([10, 4]);
    expect(g.players[1].kills).toBe(0);
  });

  it('keeps the score story the coach narrates', () => {
    let g = createTutorialGame('P');
    const after: number[][] = [];
    for (let t = 1; t <= TUTORIAL_TURNS; t++) {
      g = playTurn(g).g;
      after.push(score(g));
    }
    expect(after).toEqual([[1, 1], [4, 2], [6, 4], [10, 4]]);
  });

  it('every coached tap targets something that exists at that moment', () => {
    let g = createTutorialGame('P');
    for (let t = 1; t <= TUTORIAL_TURNS; t++) {
      const v = viewFor(g, 0);
      const mine = v.zones.flatMap((z) => z.units[0]).map((u) => u.cardId);
      for (const s of tutorialSteps(t)) {
        const gate = s.gate;
        if (gate?.k === 'hand') expect(v.self.hand.map((h) => h.cardId), `turn ${t}`).toContain(gate.card);
        if (gate?.k === 'unit') expect(mine, `turn ${t}`).toContain(gate.card);
      }
      expect(tutorialSteps(t).at(-1)?.gate).toEqual({ k: 'ready' });
      g = playTurn(g).g;
    }
  });

  it('only lets the coached input through', () => {
    expect(gateAllows({ k: 'hand', card: 'jolt' }, { k: 'hand', card: 'jolt' })).toBe(true);
    expect(gateAllows({ k: 'hand', card: 'jolt' }, { k: 'hand', card: 'ar' })).toBe(false);
    expect(gateAllows({ k: 'zone', zone: 0 }, { k: 'zone', zone: 2 })).toBe(false);
    expect(gateAllows({ k: 'unit', card: 'jolt' }, { k: 'unit', card: 'jolt', mine: false })).toBe(false);
    expect(gateAllows({ k: 'ready' }, { k: 'resupply' })).toBe(false);
    expect(gateAllows(undefined, { k: 'ready' })).toBe(false);
  });
});
