import { card, deckById, STREAK_ORDER, STREAKS } from './cards';
import { checkPlan, legalTargets, RESUPPLY_COST, tryAdd } from './plan';
import { resolveTurn } from './resolve';
import { rngNext } from './rng';
import { abilitiesOf, allUnits, effAtk, other, stateFromView, viewFor, zoneValue } from './state';
import type { Action, GameState, GameView, HandCard, Plan, PlayerId, Unit, UnitRef, ZoneId } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface AiProfile {
  candidates: number;
  noise: number;
  takeProb: number;
  lookahead: boolean;
}

const PROFILES: Record<Difficulty, AiProfile> = {
  easy: { candidates: 6, noise: 150, takeProb: 0.5, lookahead: false },
  normal: { candidates: 110, noise: 6, takeProb: 0.75, lookahead: false },
  hard: { candidates: 200, noise: 0, takeProb: 0.8, lookahead: true },
};

type Rnd = () => number;

function makeRnd(seed: number): Rnd {
  let s = seed >>> 0;
  return () => {
    const [v, next] = rngNext(s);
    s = next;
    return v;
  };
}

function pick<T>(rnd: Rnd, arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(rnd() * arr.length)] : undefined;
}

function unitValue(g: GameState, u: Unit): number {
  let v = effAtk(g, u) * 1.6 + u.hp + u.aim * 0.35;
  for (const a of abilitiesOf(u)) {
    switch (a.k) {
      case 'guard': v += 1.5; break;
      case 'armored': v += 2; break;
      case 'snipe': v += 2; break;
      case 'pierce': v += 1; break;
      case 'chain': v += 2; break;
      case 'grow': v += 1.5; break;
      case 'medic': v += a.n; break;
      case 'eco': v += 2 * a.n; break;
      case 'leader': case 'suppress': v += 1; break;
      case 'trap': v += 1; break;
      default: break;
    }
  }
  return v;
}

export function evaluate(g: GameState, me: PlayerId): number {
  const opp = other(me);
  if (g.winner === me) return 100000;
  if (g.winner === opp) return -100000;
  if (g.winner === 'draw') return -500;
  const P = g.players;
  const target = g.config.targetScore;
  let v = 40 * (P[me].score - P[opp].score);
  if (P[me].score >= target - 2) v += 15;
  if (P[opp].score >= target - 2) v -= 15;

  for (const z of g.zones) {
    const mine = z.units[me].reduce((s, u) => s + unitValue(g, u), 0);
    const theirs = z.units[opp].reduce((s, u) => s + unitValue(g, u), 0);
    v += 2.5 * (mine - theirs);
    const zv = zoneValue(z.modId, g.turn);
    if (mine > 0 && theirs === 0) v += 7 * zv;
    else if (theirs > 0 && mine === 0) v -= 7 * zv;
    else if (mine > 0 && theirs > 0) v += 2 * zv * Math.sign(mine - theirs);
    if (z.c4) {
      const owner = z.c4.owner;
      const sign = owner === me ? 1 : -1;
      const ownerHolds = z.units[owner].length > 0;
      v += sign * (ownerHolds ? 22 : 8);
    }
    for (const f of z.fires) v += (f.owner === me ? 1 : -1) * 2 * z.units[other(f.owner)].length;
  }

  const spValue = (sp: number) => sp * (sp >= 6 ? 6 : 3);
  v += spValue(P[me].sp) - spValue(P[opp].sp) * 0.8;
  if (P[me].nukeTurn === g.turn) v += 50;
  if (P[opp].nukeTurn === g.turn) v -= 50;
  v += 0.7 * P[me].credits + 0.7 * P[me].bonusNextTurn;
  v += 1.5 * P[me].hand.length;
  return v;
}

function randomPlan(view: GameView, rnd: Rnd, profile: AiProfile): Plan {
  const plan: Plan = { actions: [] };
  const add = (a: Action) => {
    if (!tryAdd(view, plan, a)) plan.actions.push(a);
  };
  const me = view.me;
  const hand = [...view.self.hand].sort(() => rnd() - 0.5);
  const byType = (t: string) => hand.filter((h) => card(h.cardId).type === t);

  const ownRefs = (refs: UnitRef[]) =>
    refs.filter((r) => 'hid' in r || view.zones.some((z) => z.units[me].some((u) => u.uid === r.uid)));
  const enemyRefs = (refs: UnitRef[]) =>
    refs.filter((r) => 'uid' in r && view.zones.some((z) => z.units[other(me)].some((u) => u.uid === r.uid)));

  // Nuke whenever it's available.
  if (view.self.sp >= STREAKS.nuke.cost) add({ t: 'streak', id: 'nuke' });

  for (const u of view.zones.flatMap((z) => z.units[me])) {
    if (rnd() < 0.1) {
      const to = pick(rnd, [u.zone - 1, u.zone + 1].filter((z) => z >= 0 && z <= 2)) as ZoneId | undefined;
      if (to !== undefined) add({ t: 'move', uid: u.uid, zone: to });
    }
  }

  for (const h of byType('operator')) {
    if (rnd() > profile.takeProb) continue;
    const zone = pick(rnd, legalTargets(view, plan, h.hid).zones);
    if (zone !== undefined) add({ t: 'deploy', hid: h.hid, zone });
  }
  for (const h of byType('gear')) {
    if (rnd() > profile.takeProb) continue;
    const ref = pick(rnd, ownRefs(legalTargets(view, plan, h.hid).units));
    if (ref) add({ t: 'gear', hid: h.hid, target: ref });
  }
  for (const h of byType('tactic')) {
    const def = card(h.cardId);
    if (rnd() > profile.takeProb * (def.effect?.kind === 'creditsNextTurn' ? 0.4 : 1)) continue;
    const t = legalTargets(view, plan, h.hid);
    if (def.target === 'zone') {
      const zone = pick(rnd, t.zones);
      if (zone !== undefined) add({ t: 'tactic', hid: h.hid, zone });
    } else if (def.target === 'enemyUnit') {
      const ref = pick(rnd, enemyRefs(t.units));
      if (ref) add({ t: 'tactic', hid: h.hid, target: ref });
    } else if (def.target === 'allyUnit') {
      const ref = pick(rnd, ownRefs(t.units));
      if (ref) add({ t: 'tactic', hid: h.hid, target: ref });
    } else {
      add({ t: 'tactic', hid: h.hid });
    }
  }
  for (const id of STREAK_ORDER) {
    if (id === 'nuke' || id === 'uav' || rnd() > 0.35) continue;
    const zone = STREAKS[id].target === 'zone' ? (Math.floor(rnd() * 3) as ZoneId) : undefined;
    add({ t: 'streak', id, zone });
  }
  return plan;
}

/** Guess the opponent's hand from their (public) deck list minus cards already seen. */
function sampleOpponentHand(view: GameView, rnd: Rnd): HandCard[] {
  if (view.opp.hand) return structuredClone(view.opp.hand);
  const opp = other(view.me);
  const pool = [...(view.opp.deckList.length ? view.opp.deckList : deckById(view.opp.deckId).cards)];
  const remove = (id?: string) => {
    const i = id ? pool.indexOf(id) : -1;
    if (i >= 0) pool.splice(i, 1);
  };
  view.opp.graveyard.forEach(remove);
  for (const z of view.zones) {
    for (const u of z.units[opp]) {
      remove(u.cardId);
      remove(u.weapon);
      remove(u.armor);
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, view.opp.handCount).map((cardId, i) => ({ hid: `oh${i}`, cardId }));
}

/** Predict likely opponent plans: for each sampled hand, their best reply to a passive turn from us. */
function predictOpponent(view: GameView, hyp: GameState, rnd: Rnd, samples: number, tries: number): { state: GameState; plan: Plan }[] {
  const me = view.me;
  const opp = other(me);
  const empty: Plan = { actions: [] };
  const out: { state: GameState; plan: Plan }[] = [];
  for (let s = 0; s < samples; s++) {
    const state = structuredClone(hyp);
    state.players[opp].hand = sampleOpponentHand(view, rnd);
    const oppView = viewFor(state, opp);
    let best = empty;
    let bestScore = -Infinity;
    for (let t = 0; t < tries; t++) {
      const plan = t === 0 ? empty : randomPlan(oppView, rnd, PROFILES.normal);
      const plans: [Plan, Plan] = opp === 0 ? [plan, empty] : [empty, plan];
      const score = evaluate(resolveTurn(state, plans, { snapshots: false }).state, opp);
      if (score > bestScore) {
        bestScore = score;
        best = plan;
      }
    }
    out.push({ state, plan: best });
  }
  return out;
}

/** With at least this many credits the CPU sets aside RESUPPLY_COST to draw an extra card. */
const RESUPPLY_RESERVE_AT = 8;

function withResupply(view: GameView, plan: Plan): Plan {
  if (checkPlan(view, plan).credits < RESUPPLY_COST) return plan;
  const action: Action = { t: 'resupply' };
  return tryAdd(view, plan, action) ? plan : { actions: [...plan.actions, action] };
}

/** Whether the CPU should spend SP on UAV this planning phase. Only 'hard' reads the revealed hand. */
export function wantsUav(view: GameView, difficulty: Difficulty): boolean {
  if (difficulty !== 'hard' || view.self.uavTurn === view.turn) return false;
  return view.self.sp >= STREAKS.uav.cost && view.self.sp < STREAKS.airstrike.cost;
}

export function planAI(view: GameView, difficulty: Difficulty = 'normal', seed = Date.now()): Plan {
  if (view.winner !== null) return { actions: [] };
  const profile = PROFILES[difficulty];
  const rnd = makeRnd(seed ^ (view.turn * 7919));
  const hyp = stateFromView(view);
  const me = view.me;
  const empty: Plan = { actions: [] };
  const sim = (state: GameState, mine: Plan, theirs: Plan) => {
    const plans: [Plan, Plan] = me === 0 ? [mine, theirs] : [theirs, mine];
    return evaluate(resolveTurn(state, plans, { snapshots: false }).state, me);
  };

  const reserve = view.self.credits >= RESUPPLY_RESERVE_AT && view.self.deckCount > 0 ? RESUPPLY_COST : 0;
  const planView: GameView = reserve ? { ...view, self: { ...view.self, credits: view.self.credits - reserve } } : view;
  const candidates: Plan[] = [empty];
  for (let i = 0; i < profile.candidates; i++) candidates.push(randomPlan(planView, rnd, profile));

  const scored = candidates.map((plan) => ({
    plan,
    score: sim(hyp, plan, empty) + (rnd() - 0.5) * profile.noise,
  }));
  scored.sort((a, b) => b.score - a.score);

  if (profile.lookahead) {
    const scenarios = predictOpponent(view, hyp, rnd, 6, 10);
    const top = scored.slice(0, 24);
    for (const c of top) {
      const results = scenarios.map((sc) => sim(sc.state, c.plan, sc.plan));
      const avg = results.reduce((s, v) => s + v, 0) / results.length;
      const worst = Math.min(...results);
      c.score = c.score * 0.25 + (avg * 0.7 + worst * 0.3) * 0.75;
    }
    top.sort((a, b) => b.score - a.score);
    return withResupply(view, top[0].plan);
  }
  return withResupply(view, scored[0].plan);
}

/** Quick summary used by the CPU to pick an emote. */
export function boardAdvantage(view: GameView): number {
  const g = stateFromView(view);
  const me = view.me;
  const mine = allUnits(g).filter((u) => u.owner === me).reduce((s, u) => s + unitValue(g, u), 0);
  const theirs = allUnits(g).filter((u) => u.owner !== me).reduce((s, u) => s + unitValue(g, u), 0);
  return mine - theirs + 10 * (view.self.score - view.opp.score);
}
