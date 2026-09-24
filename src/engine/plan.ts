import { card, STREAKS } from './cards';
import { findUnit, operatorCost, zoneCapacity } from './state';
import type { Action, GameView, Plan, UnitRef, ZoneId } from './types';
import { ZONES } from './types';

export const MOVE_COST = 1;

export interface PlanCheck {
  valid: Action[];
  errors: { index: number; message: string }[];
  credits: number;
  sp: number;
}

export function actionCost(view: GameView, a: Action): { credits: number; sp: number } {
  const hand = view.self.hand;
  switch (a.t) {
    case 'deploy': {
      const hc = hand.find((h) => h.hid === a.hid);
      return { credits: hc ? operatorCost(hc.cardId, view.zones[a.zone].modId) : 0, sp: 0 };
    }
    case 'gear':
    case 'tactic': {
      const hc = hand.find((h) => h.hid === a.hid);
      return { credits: hc ? card(hc.cardId).cost : 0, sp: 0 };
    }
    case 'move':
      return { credits: MOVE_COST, sp: 0 };
    case 'streak':
      return { credits: 0, sp: STREAKS[a.id].cost };
  }
}

/**
 * Validate a plan sequentially against a player's view. Invalid actions are skipped
 * (not applied) so later actions are checked against the state without them.
 */
export function checkPlan(view: GameView, plan: Plan): PlanCheck {
  const me = view.me;
  const enemy = me === 0 ? 1 : 0;
  let credits = view.self.credits;
  let sp = view.self.sp;
  const used = new Set<string>();
  const pendingDeploy = new Map<string, ZoneId>();
  const counts = view.zones.map((z) => z.units[me].length);
  const moved = new Set<string>();
  const streaksUsed = new Set<string>();
  const valid: Action[] = [];
  const errors: PlanCheck['errors'] = [];
  const c4Checks: { index: number; zone: ZoneId }[] = [];

  const ownUnitExists = (ref: UnitRef): boolean => {
    if ('hid' in ref) return pendingDeploy.has(ref.hid);
    const u = findUnit(view, ref.uid);
    return !!u && u.owner === me;
  };

  plan.actions.forEach((a, index) => {
    const fail = (message: string) => errors.push({ index, message });
    const cost = actionCost(view, a);
    if (a.t !== 'move' && a.t !== 'streak') {
      if (used.has(a.hid)) return fail('そのカードは使用済み');
      const hc = view.self.hand.find((h) => h.hid === a.hid);
      if (!hc) return fail('手札にないカード');
      const def = card(hc.cardId);
      if (a.t === 'deploy' && def.type !== 'operator') return fail('オペレーターではない');
      if (a.t === 'gear' && def.type !== 'gear') return fail('装備ではない');
      if (a.t === 'tactic' && def.type !== 'tactic') return fail('戦術ではない');
    }
    if (cost.credits > credits) return fail('クレジット不足');
    if (cost.sp > sp) return fail('SP不足');

    switch (a.t) {
      case 'deploy': {
        if (!ZONES.includes(a.zone)) return fail('ゾーンが不正');
        if (counts[a.zone] >= zoneCapacity(view, a.zone)) return fail('ゾーンが満員');
        counts[a.zone] += 1;
        pendingDeploy.set(a.hid, a.zone);
        break;
      }
      case 'gear': {
        if (!ownUnitExists(a.target)) return fail('対象がいない');
        break;
      }
      case 'tactic': {
        const def = card(view.self.hand.find((h) => h.hid === a.hid)!.cardId);
        if (def.target === 'zone') {
          if (a.zone === undefined || !ZONES.includes(a.zone)) return fail('ゾーンを選択');
          if (def.effect?.kind === 'plantC4') {
            if (view.zones[a.zone].c4) return fail('既にC4が設置されている');
            c4Checks.push({ index, zone: a.zone });
          }
        } else if (def.target === 'enemyUnit') {
          if (!a.target || !('uid' in a.target)) return fail('敵を選択');
          const u = findUnit(view, a.target.uid);
          if (!u || u.owner !== enemy) return fail('敵を選択');
        } else if (def.target === 'allyUnit') {
          if (!a.target || !ownUnitExists(a.target)) return fail('味方を選択');
          if (def.effect?.kind === 'recall' && 'hid' in a.target) return fail('出したばかりのユニットは戻せない');
        }
        break;
      }
      case 'move': {
        const u = findUnit(view, a.uid);
        if (!u || u.owner !== me) return fail('自分のユニットではない');
        if (moved.has(a.uid)) return fail('このターンは移動済み');
        if (Math.abs(u.zone - a.zone) !== 1) return fail('隣のゾーンにしか移動できない');
        if (counts[a.zone] >= zoneCapacity(view, a.zone)) return fail('移動先が満員');
        counts[u.zone] -= 1;
        counts[a.zone] += 1;
        moved.add(a.uid);
        break;
      }
      case 'streak': {
        if (streaksUsed.has(a.id)) return fail('このターンは使用済み');
        if (STREAKS[a.id].target === 'zone' && (a.zone === undefined || !ZONES.includes(a.zone))) return fail('ゾーンを選択');
        streaksUsed.add(a.id);
        break;
      }
    }
    if (a.t !== 'move' && a.t !== 'streak') used.add(a.hid);
    credits -= cost.credits;
    sp -= cost.sp;
    valid.push(a);
  });

  // C4 needs a friendly operator in the zone once all moves/deploys are counted.
  for (const c of c4Checks) {
    if (counts[c.zone] <= 0) {
      const i = valid.findIndex((a) => a === plan.actions[c.index]);
      if (i >= 0) {
        const removed = valid.splice(i, 1)[0];
        credits += actionCost(view, removed).credits;
        errors.push({ index: c.index, message: 'C4は味方がいるゾーンにしか設置できない' });
      }
    }
  }

  return { valid, errors, credits, sp };
}

/** Try adding an action; returns an error message if it would be rejected. */
export function tryAdd(view: GameView, plan: Plan, action: Action): string | null {
  const res = checkPlan(view, { actions: [...plan.actions, action] });
  const err = res.errors.find((e) => e.index === plan.actions.length);
  return err ? err.message : null;
}

export interface Targets {
  zones: ZoneId[];
  units: UnitRef[];
}

/** List legal targets for a hand card given the current pending plan. */
export function legalTargets(view: GameView, plan: Plan, hid: string): Targets {
  const hc = view.self.hand.find((h) => h.hid === hid);
  const out: Targets = { zones: [], units: [] };
  if (!hc) return out;
  const def = card(hc.cardId);
  const unitRefs: UnitRef[] = [];
  for (const z of view.zones) for (const side of z.units) for (const u of side) unitRefs.push({ uid: u.uid });
  for (const a of plan.actions) if (a.t === 'deploy') unitRefs.push({ hid: a.hid });

  if (def.type === 'operator') {
    for (const zone of ZONES) if (!tryAdd(view, plan, { t: 'deploy', hid, zone })) out.zones.push(zone);
  } else if (def.type === 'gear') {
    for (const ref of unitRefs) if (!tryAdd(view, plan, { t: 'gear', hid, target: ref })) out.units.push(ref);
  } else if (def.target === 'zone') {
    for (const zone of ZONES) if (!tryAdd(view, plan, { t: 'tactic', hid, zone })) out.zones.push(zone);
  } else if (def.target === 'enemyUnit' || def.target === 'allyUnit') {
    for (const ref of unitRefs) if (!tryAdd(view, plan, { t: 'tactic', hid, target: ref })) out.units.push(ref);
  }
  return out;
}
