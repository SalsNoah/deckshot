import { card, STREAKS } from './cards';
import { checkPlan, MOVE_COST, RESUPPLY_COST } from './plan';
import { randInt } from './rng';
import {
  abilitiesOf, abilityN, addToHand, allUnits, beginTurn, comebackBonus, drawCard, effAim, effAtk, findUnit,
  hasAbility, isStealthed, operatorCost, other, snapshot, viewFor, zoneCapacity, zoneValue,
} from './state';
import type {
  Ability, DamageSource, Effect, GameEvent, GameEventBody, GameState, Plan, PlayerId, PublicPlay, StreakId, Unit, ZoneId,
} from './types';

interface QueuedEffect {
  p: PlayerId;
  speed: number;
  order: number;
  cardId?: string;
  streak?: StreakId;
  zone?: ZoneId;
  uid?: string;
}

interface Killer {
  p: PlayerId;
  unit?: Unit;
}

export interface TurnResult {
  state: GameState;
  events: GameEvent[];
}

const C4_DAMAGE = 6;
const C4_POINTS = 2;
const MAX_CHAIN = 2;
export const LONG_SHOT_PENALTY = 1;
/** SP a player gains per turn when the enemy kills their units. */
export const DEATH_SP_PER_TURN = 1;
/** A pending nuke is stopped if its target holds at least this many zones when it lands. */
export const NUKE_BLOCK_ZONES = 2;

class Resolver {
  events: GameEvent[] = [];
  killsThisTurn: [number, number] = [0, 0];
  deathSp: [number, number] = [0, 0];
  tier = 0;

  constructor(public g: GameState, private withSnapshots: boolean) {}

  emit(body: GameEventBody) {
    if (!this.withSnapshots) {
      if (body.e === 'gameOver') this.events.push({ ...body, snap: snapshot(this.g) } as GameEvent);
      return;
    }
    this.events.push({ ...body, snap: snapshot(this.g) } as GameEvent);
  }

  enemiesIn(zone: ZoneId, p: PlayerId): Unit[] {
    return this.g.zones[zone].units[other(p)].filter((u) => u.hp > 0);
  }

  removeUnit(u: Unit) {
    const side = this.g.zones[u.zone].units[u.owner];
    const i = side.findIndex((x) => x.uid === u.uid);
    if (i >= 0) side.splice(i, 1);
  }

  /** Apply damage (armor aware). Returns damage actually dealt. */
  damage(u: Unit, amount: number, opts: { shot?: boolean } = {}): number {
    if (amount <= 0 || u.hp <= 0) return 0;
    let dmg = amount;
    if (opts.shot && this.g.zones[u.zone].modId === 'cover') dmg -= 1;
    if (hasAbility(u, 'armored')) dmg -= 1;
    dmg = Math.max(1, dmg);
    u.hp -= dmg;
    if (u.hp <= 0 && hasAbility(u, 'phoenix') && !u.phoenixUsed) {
      u.hp = 1;
      u.phoenixUsed = true;
      this.emit({ e: 'buff', uids: [u.uid], label: '不死鳥' });
    }
    if (dmg > 0 && u.hp > 0) {
      const n = abilityN(u, 'berserk');
      if (n > 0) {
        u.atk += n;
        this.emit({ e: 'buff', uids: [u.uid], label: `ATK+${n}` });
      }
    }
    return dmg;
  }

  kill(u: Unit, killer: Killer | null, hs: boolean, source: 'shot' | DamageSource) {
    if (!findUnit(this.g, u.uid)) return;
    const lastWords = abilitiesOf(u).filter((a): a is Extract<Ability, { k: 'lastWords' }> => a.k === 'lastWords');
    const zone = u.zone;
    const owner = u.owner;
    this.removeUnit(u);
    const victimOwner = u.owner;
    this.g.players[victimOwner].graveyard.push(u.cardId);
    if (killer && killer.p !== victimOwner && this.deathSp[victimOwner] < DEATH_SP_PER_TURN) {
      this.g.players[victimOwner].sp += 1;
      this.deathSp[victimOwner] += 1;
    }
    if (killer && killer.p !== victimOwner) {
      const kp = this.g.players[killer.p];
      kp.kills += 1;
      kp.sp += 1;
      kp.bonusNextTurn += hs ? 2 : 1;
      if (hs) kp.headshots += 1;
      this.killsThisTurn[killer.p] += 1;
      const ku = killer.unit;
      if (ku && ku.hp > 0 && findUnit(this.g, ku.uid)) {
        ku.kills += 1;
        for (const a of abilitiesOf(ku)) {
          if (a.k === 'grow') {
            ku.atk += a.atk;
            ku.maxHp += a.hp;
            ku.hp += a.hp;
          }
        }
        if (source === 'shot' && hasAbility(ku, 'knifeKill')) kp.sp += 1;
      }
    }
    this.emit({
      e: 'kill',
      uid: u.uid,
      cardId: u.cardId,
      victimOwner,
      by: killer?.unit?.uid,
      byCardId: killer?.unit?.cardId,
      byPlayer: killer?.p,
      weapon: killer?.unit?.weapon,
      hs,
      source,
    });
    for (const a of lastWords) {
      this.applyEffect(a.effect, owner, zone, undefined, source === 'shot' ? 'deploy' : source, u);
    }
    for (const ally of this.g.zones[zone].units[owner]) {
      if (ally.hp <= 0 || !hasAbility(ally, 'scavenge')) continue;
      ally.atk += 1;
      ally.maxHp += 1;
      ally.hp += 1;
      this.emit({ e: 'buff', uids: [ally.uid], label: 'ATK+1 HP+1' });
    }
  }

  /** Damage a group of units at once, emit damage events, then resolve deaths. */
  areaDamage(targets: Unit[], amount: number, source: DamageSource, killer: Killer | null) {
    const hit: Unit[] = [];
    for (const u of targets) {
      const dealt = this.damage(u, amount);
      if (dealt > 0) {
        hit.push(u);
        this.emit({ e: 'damage', uid: u.uid, amount: dealt, source, zone: u.zone });
      }
    }
    for (const u of hit) if (u.hp <= 0) this.kill(u, killer, false, source);
  }

  enterZone(u: Unit) {
    const traps = this.g.zones[u.zone].units[other(u.owner)].filter((t) => t.hp > 0 && abilityN(t, 'trap') > 0);
    for (const t of traps) {
      if (u.hp <= 0) break;
      const dealt = this.damage(u, abilityN(t, 'trap'));
      this.emit({ e: 'damage', uid: u.uid, amount: dealt, source: 'trap', zone: u.zone });
      if (u.hp <= 0) this.kill(u, { p: t.owner, unit: t }, false, 'trap');
    }
  }

  applyEffect(effect: Effect, p: PlayerId, zone: ZoneId | undefined, uid: string | undefined, source: DamageSource, by?: Unit) {
    const g = this.g;
    const killer: Killer = { p, unit: by };
    switch (effect.kind) {
      case 'damageEnemiesInZone':
        if (zone !== undefined) this.areaDamage(this.enemiesIn(zone, p), effect.amount, source, killer);
        break;
      case 'damageAllInZone':
        if (zone !== undefined) {
          const all = [...g.zones[zone].units[0], ...g.zones[zone].units[1]].filter((u) => u.hp > 0);
          this.areaDamage(all, effect.amount, source, killer);
        }
        break;
      case 'damageUnit': {
        const u = uid ? findUnit(g, uid) : undefined;
        if (u && u.owner !== p) this.areaDamage([u], effect.amount, source, killer);
        break;
      }
      case 'flashZone': {
        if (zone === undefined) break;
        const list = this.enemiesIn(zone, p);
        list.forEach((u) => (u.flashed = true));
        this.emit({ e: 'flash', uids: list.map((u) => u.uid), zone });
        break;
      }
      case 'smokeZone':
        if (zone === undefined) break;
        g.zones[zone].smoked = true;
        this.emit({ e: 'smoke', zone });
        break;
      case 'fireZone':
        if (zone === undefined) break;
        g.zones[zone].fires.push({ owner: p, dmg: effect.amount, turnsLeft: effect.turns });
        this.emit({ e: 'fire', zone, p });
        break;
      case 'stim': {
        const u = uid ? findUnit(g, uid) : undefined;
        if (!u || u.owner !== p) break;
        u.maxHp += effect.hp;
        u.hp += effect.hp;
        u.tmpAim += effect.aim;
        this.emit({ e: 'buff', uids: [u.uid], label: `HP+${effect.hp} AIM+${effect.aim}` });
        break;
      }
      case 'buffZoneAllies': {
        if (zone === undefined) break;
        const list = g.zones[zone].units[p];
        list.forEach((u) => (u.tmpAtk += effect.atk));
        this.emit({ e: 'buff', uids: list.map((u) => u.uid), label: `ATK+${effect.atk}` });
        break;
      }
      case 'draw': {
        let n = 0;
        for (let i = 0; i < effect.amount; i++) if (drawCard(g, p)) n++;
        this.emit({ e: 'draw', p, count: n });
        break;
      }
      case 'creditsNextTurn':
        g.players[p].bonusNextTurn += effect.amount;
        break;
      case 'plantC4': {
        if (zone === undefined) break;
        const z = g.zones[zone];
        if (z.c4 || z.units[p].length === 0) {
          this.emit({ e: 'tactic', p, cardId: 'c4', zone, fizzle: true });
          break;
        }
        z.c4 = { owner: p, explodeTurn: g.turn + 1 };
        this.emit({ e: 'c4Plant', p, zone });
        break;
      }
      case 'recall': {
        const u = uid ? findUnit(g, uid) : undefined;
        if (!u || u.owner !== p) break;
        this.removeUnit(u);
        addToHand(g, p, u.cardId);
        this.emit({ e: 'recall', p, uid: u.uid, cardId: u.cardId });
        break;
      }
      case 'reinforce': {
        const gy = g.players[p].graveyard;
        if (gy.length === 0) break;
        const [cardId] = gy.splice(randInt(g, gy.length), 1);
        addToHand(g, p, cardId);
        this.emit({ e: 'draw', p, count: 1 });
        break;
      }
    }
  }

  resolveStreak(q: QueuedEffect) {
    const g = this.g;
    const p = q.p;
    switch (q.streak) {
      case 'airstrike':
        this.emit({ e: 'streak', p, id: 'airstrike', zone: q.zone });
        if (q.zone !== undefined) this.areaDamage(this.enemiesIn(q.zone, p), 3, 'streak', { p });
        break;
      case 'nuke':
        g.players[p].nukeTurn = g.turn + 1;
        this.emit({ e: 'nukeArmed', p });
        break;
    }
  }

  /** Land nukes armed last turn. Returns true if one ended the game. */
  detonateNukes(): boolean {
    const g = this.g;
    const fired: PlayerId[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      const pl = g.players[p];
      if (pl.nukeTurn !== g.turn) continue;
      pl.nukeTurn = -1;
      const held = g.zones.filter((z) => z.controller === other(p)).length;
      if (held >= NUKE_BLOCK_ZONES) this.emit({ e: 'nukeFizzle', p });
      else fired.push(p);
    }
    if (fired.length === 0) return false;
    g.winner = fired.length === 2 ? 'draw' : fired[0];
    g.winReason = 'nuke';
    for (const p of fired) this.emit({ e: 'nuke', p });
    if (g.winner !== 'draw') {
      for (const u of allUnits(g).filter((u) => u.owner !== g.winner)) this.kill(u, null, false, 'streak');
    }
    return true;
  }

  chooseTarget(u: Unit, exclude?: Set<string>): Unit | null {
    const g = this.g;
    const ok = (e: Unit) => e.hp > 0 && !isStealthed(g, e) && !exclude?.has(e.uid);
    let pool = g.zones[u.zone].units[other(u.owner)].filter(ok);
    if (hasAbility(u, 'snipe')) {
      if (pool.length === 0) {
        for (const adj of [u.zone - 1, u.zone + 1]) {
          if (adj < 0 || adj > 2 || g.zones[adj].smoked) continue;
          pool.push(...g.zones[adj].units[other(u.owner)].filter(ok));
        }
      }
      if (pool.length === 0) return null;
      return [...pool].sort((a, b) => effAtk(g, b) - effAtk(g, a) || a.hp - b.hp)[0];
    }
    const flanking = hasAbility(u, 'flank') && u.deployedTurn === g.turn;
    const guards = flanking ? [] : pool.filter((e) => hasAbility(e, 'guard'));
    if (guards.length) pool = guards;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => a.hp - b.hp || effAtk(g, b) - effAtk(g, a))[0];
  }

  /** Fire a set of simultaneous shots (same AIM tier). Returns shooters that scored a kill. */
  fireShots(shooters: Unit[], extra: boolean): Unit[] {
    const g = this.g;
    this.tier += 1;
    const shots: { u: Unit; tgt: Unit; atk: number }[] = [];
    for (const u of shooters) {
      const tgt = this.chooseTarget(u);
      if (!tgt) continue;
      const atk = effAtk(g, u) - (tgt.zone !== u.zone ? LONG_SHOT_PENALTY : 0);
      if (atk > 0) shots.push({ u, tgt, atk });
    }
    if (shots.length === 0) return [];

    const hpStart = new Map<string, number>();
    for (const s of shots) if (!hpStart.has(s.tgt.uid)) hpStart.set(s.tgt.uid, s.tgt.hp);

    const dealt = shots.map((s) => this.damage(s.tgt, s.atk, { shot: true }));
    shots.forEach((s, i) => {
      if (dealt[i] <= 0) return;
      if (hasAbility(s.u, 'bane') && s.tgt.hp > 0) s.tgt.hp = 0;
      if (hasAbility(s.u, 'drain') && s.u.hp > 0) {
        const heal = Math.min(dealt[i], s.u.maxHp - s.u.hp);
        if (heal > 0) {
          s.u.hp += heal;
          this.emit({ e: 'heal', uid: s.u.uid, amount: heal });
        }
      }
    });
    const killerOf = new Map<string, { i: number; dmg: number }>();
    shots.forEach((s, i) => {
      if (s.tgt.hp > 0) return;
      const cur = killerOf.get(s.tgt.uid);
      if (!cur || dealt[i] > cur.dmg) killerOf.set(s.tgt.uid, { i, dmg: dealt[i] });
    });
    const isHs = (uid: string, dmg: number, maxHp: number) => {
      const start = hpStart.get(uid)!;
      return start === maxHp && dmg >= start;
    };

    shots.forEach((s, i) => {
      const k = killerOf.get(s.tgt.uid);
      const isKill = !!k && k.i === i;
      this.emit({
        e: 'shot', p: s.u.owner, from: s.u.uid, to: s.tgt.uid, dmg: dealt[i],
        hs: isKill && isHs(s.tgt.uid, dealt[i], s.tgt.maxHp), kill: isKill,
        fromZone: s.u.zone, toZone: s.tgt.zone, tier: this.tier, extra,
      });
    });

    // Pierce: overkill carries into the next target.
    const pierceKills: { u: Unit; tgt: Unit }[] = [];
    shots.forEach((s, i) => {
      if (!hasAbility(s.u, 'pierce')) return;
      const excess = dealt[i] - Math.max(0, hpStart.get(s.tgt.uid)!);
      if (excess <= 0) return;
      const dead = new Set(shots.filter((x) => x.tgt.hp <= 0).map((x) => x.tgt.uid));
      const next = this.chooseTarget(s.u, dead);
      if (!next) return;
      const d = this.damage(next, excess, { shot: true });
      this.emit({ e: 'damage', uid: next.uid, amount: d, source: 'splash', zone: next.zone });
      if (next.hp <= 0) pierceKills.push({ u: s.u, tgt: next });
    });

    // Spread: splash the rest of the target's zone.
    const spreadHits: { u: Unit; tgt: Unit }[] = [];
    for (const s of shots) {
      const n = abilityN(s.u, 'spread');
      if (n <= 0) continue;
      for (const e of g.zones[s.tgt.zone].units[other(s.u.owner)]) {
        if (e.uid === s.tgt.uid || e.hp <= 0) continue;
        const d = this.damage(e, n);
        this.emit({ e: 'damage', uid: e.uid, amount: d, source: 'splash', zone: e.zone });
        if (e.hp <= 0) spreadHits.push({ u: s.u, tgt: e });
      }
    }

    const scored: Unit[] = [];
    for (const [uid, k] of killerOf) {
      const s = shots[k.i];
      const tgt = findUnit(g, uid);
      if (!tgt) continue;
      this.kill(tgt, { p: s.u.owner, unit: s.u }, isHs(uid, k.dmg, tgt.maxHp), 'shot');
      if (!scored.includes(s.u)) scored.push(s.u);
    }
    for (const { u, tgt } of [...pierceKills, ...spreadHits]) {
      if (findUnit(g, tgt.uid)) {
        this.kill(tgt, { p: u.owner, unit: u }, false, 'shot');
        if (!scored.includes(u)) scored.push(u);
      }
    }
    return scored;
  }

  combat() {
    const g = this.g;
    if (allUnits(g).length === 0) return;
    this.emit({ e: 'combatStart' });
    const fired = new Set<string>();
    for (;;) {
      const cands = allUnits(g).filter((u) => u.hp > 0 && !fired.has(u.uid) && !g.zones[u.zone].smoked);
      if (cands.length === 0) break;
      const top = Math.max(...cands.map((u) => effAim(g, u)));
      const tier = cands.filter((u) => effAim(g, u) === top);
      tier.forEach((u) => fired.add(u.uid));
      let scored = this.fireShots(tier, false);
      // Chain: shooters with a kill fire again, up to MAX_CHAIN extra shots.
      while (scored.length) {
        const again = scored.filter((u) => hasAbility(u, 'chain') && u.chainShots < MAX_CHAIN && findUnit(g, u.uid));
        again.forEach((u) => (u.chainShots += 1));
        scored = [];
        for (const u of again) scored.push(...this.fireShots([u], true));
      }
    }
  }

  multikills() {
    for (const p of [0, 1] as PlayerId[]) {
      const n = this.killsThisTurn[p];
      if (n < 2) continue;
      const enemyLeft = allUnits(this.g).filter((u) => u.owner === other(p)).length;
      this.emit({ e: 'multikill', p, count: n, ace: n >= 3 && enemyLeft === 0 });
    }
  }

  endOfTurn() {
    const g = this.g;
    for (const z of g.zones) {
      for (const f of z.fires) {
        this.areaDamage(z.units[other(f.owner)].filter((u) => u.hp > 0), f.dmg, 'fire', { p: f.owner });
        f.turnsLeft -= 1;
      }
      z.fires = z.fires.filter((f) => f.turnsLeft > 0);
      if (z.modId === 'toxic') this.areaDamage([...z.units[0], ...z.units[1]], 1, 'toxic', null);
    }
    for (const z of g.zones) {
      if (!z.c4 || z.c4.explodeTurn !== g.turn) continue;
      const owner = z.c4.owner;
      const def = other(owner);
      const defended = z.units[def].length > 0 && z.units[owner].length === 0;
      z.c4 = null;
      if (defended) {
        g.players[def].sp += 1;
        this.emit({ e: 'c4Defuse', p: def, zone: z.id });
      } else {
        g.players[owner].score += C4_POINTS;
        this.emit({ e: 'c4Explode', p: owner, zone: z.id });
        this.areaDamage([...z.units[def]], C4_DAMAGE, 'c4', { p: owner });
      }
    }
    for (const u of allUnits(g)) {
      const n = abilityN(u, 'medic');
      if (n <= 0) continue;
      for (const ally of g.zones[u.zone].units[u.owner]) {
        const amount = Math.min(n, ally.maxHp - ally.hp);
        if (amount > 0) {
          ally.hp += amount;
          this.emit({ e: 'heal', uid: ally.uid, amount });
        }
      }
    }
    const bleeders = allUnits(g).filter((u) => u.hp > 0 && abilityN(u, 'bleed') > 0);
    for (const u of bleeders) {
      const n = abilityN(u, 'bleed');
      this.areaDamage([u], n, 'toxic', null);
    }
    for (const u of allUnits(g).filter((u) => u.hp > 0 && hasAbility(u, 'ephemeral'))) {
      this.kill(u, null, false, 'toxic');
    }
    for (const u of allUnits(g)) {
      u.tmpAim = 0;
      u.tmpAtk = 0;
      u.flashed = false;
      u.chainShots = 0;
    }
    for (const z of g.zones) z.smoked = false;
  }

  scoring() {
    const g = this.g;
    const held: [number, number] = [0, 0];
    const bonus = ([0, 1] as PlayerId[]).map((p) =>
      comebackBonus(g.players[p].score, g.players[other(p)].score, g.config.targetScore));
    for (const z of g.zones) {
      const a = z.units[0].length;
      const b = z.units[1].length;
      z.controller = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : null;
      if (z.controller === null) continue;
      const pl = g.players[z.controller];
      const pts = zoneValue(z.modId, g.turn) + bonus[z.controller];
      pl.score += pts;
      held[z.controller] += 1;
      if (z.modId === 'supply') pl.bonusNextTurn += 2;
      if (z.modId === 'radar') pl.sp += 1;
      this.emit({ e: 'score', p: z.controller, zone: z.id, pts });
    }
    for (const p of [0, 1] as PlayerId[]) {
      if (held[p] === 0 && held[other(p)] > 0) g.players[p].bonusNextTurn += 2;
    }
  }

  checkWinner(): boolean {
    const g = this.g;
    const [a, b] = [g.players[0], g.players[1]];
    const t = g.config.targetScore;
    if ((a.score >= t || b.score >= t) && a.score !== b.score) {
      g.winner = a.score > b.score ? 0 : 1;
      g.winReason = 'score';
    } else if (g.turn >= g.config.maxTurns) {
      g.winReason = 'turnLimit';
      if (a.score !== b.score) g.winner = a.score > b.score ? 0 : 1;
      else if (a.kills !== b.kills) g.winner = a.kills > b.kills ? 0 : 1;
      else g.winner = 'draw';
    }
    return g.winner !== null;
  }
}

export function resolveTurn(input: GameState, plans: [Plan, Plan], opts: { snapshots?: boolean } = {}): TurnResult {
  const g = structuredClone(input);
  const r = new Resolver(g, opts.snapshots ?? true);
  if (g.winner !== null) return { state: g, events: [] };

  const valid = ([0, 1] as PlayerId[]).map((p) => checkPlan(viewFor(g, p), plans[p]).valid);
  const order: PlayerId[] = [g.initiative, other(g.initiative)];
  const plays: [PublicPlay[], PublicPlay[]] = [[], []];
  const deploys: { p: PlayerId; cardId: string; zone: ZoneId; uid: string }[][] = [[], []];
  const gears: { p: PlayerId; cardId: string; uid: string }[][] = [[], []];
  const moves: { p: PlayerId; uid: string; zone: ZoneId }[][] = [[], []];
  const resupply: PlayerId[] = [];
  const queue: QueuedEffect[] = [];
  let seq = 0;

  for (const p of [0, 1] as PlayerId[]) {
    const pl = g.players[p];
    const pendingUid = new Map<string, string>();
    const take = (hid: string) => {
      const i = pl.hand.findIndex((h) => h.hid === hid);
      return pl.hand.splice(i, 1)[0].cardId;
    };
    const refUid = (ref: { uid: string } | { hid: string }) => ('uid' in ref ? ref.uid : pendingUid.get(ref.hid)!);
    for (const a of valid[p]) {
      switch (a.t) {
        case 'deploy': {
          const cardId = take(a.hid);
          pl.credits -= operatorCost(cardId, g.zones[a.zone].modId);
          const uid = `u${g.nextId++}`;
          pendingUid.set(a.hid, uid);
          deploys[p].push({ p, cardId, zone: a.zone, uid });
          plays[p].push({ t: 'deploy', cardId, zone: a.zone, uid });
          break;
        }
        case 'gear': {
          const cardId = take(a.hid);
          pl.credits -= card(cardId).cost;
          const uid = refUid(a.target);
          gears[p].push({ p, cardId, uid });
          plays[p].push({ t: 'gear', cardId, uid });
          break;
        }
        case 'tactic': {
          const cardId = take(a.hid);
          const def = card(cardId);
          pl.credits -= def.cost;
          const uid = a.target ? refUid(a.target) : undefined;
          queue.push({ p, speed: def.speed ?? 0, order: seq++, cardId, zone: a.zone, uid });
          plays[p].push({ t: 'tactic', cardId, zone: a.zone, uid });
          break;
        }
        case 'move':
          pl.credits -= MOVE_COST;
          moves[p].push({ p, uid: a.uid, zone: a.zone });
          plays[p].push({ t: 'move', uid: a.uid, zone: a.zone });
          break;
        case 'streak':
          pl.sp -= STREAKS[a.id].cost;
          queue.push({ p, speed: STREAKS[a.id].speed, order: seq++, streak: a.id, zone: a.zone });
          plays[p].push({ t: 'streak', id: a.id, zone: a.zone });
          break;
        case 'resupply':
          pl.credits -= RESUPPLY_COST;
          resupply.push(p);
          plays[p].push({ t: 'resupply' });
          break;
      }
    }
  }
  r.emit({ e: 'reveal', plays });

  for (const p of resupply) {
    if (drawCard(g, p)) r.emit({ e: 'draw', p, count: 1 });
    else g.players[p].credits += RESUPPLY_COST;
  }

  // Rotations
  for (const p of order) {
    for (const m of moves[p]) {
      const u = findUnit(g, m.uid);
      if (!u || u.owner !== p || u.hp <= 0) continue;
      if (g.zones[m.zone].units[p].length >= zoneCapacity(g, m.zone)) continue;
      const from = u.zone;
      r.removeUnit(u);
      u.zone = m.zone;
      g.zones[m.zone].units[p].push(u);
      r.emit({ e: 'move', p, uid: u.uid, from, to: m.zone });
      r.enterZone(u);
    }
  }

  // Deployments (placed simultaneously, then traps, then on-deploy effects)
  const deployed: Unit[] = [];
  for (const p of order) {
    for (const d of deploys[p]) {
      if (g.zones[d.zone].units[p].length >= zoneCapacity(g, d.zone)) continue;
      const def = card(d.cardId);
      const u: Unit = {
        uid: d.uid, cardId: d.cardId, owner: p, zone: d.zone,
        atk: def.atk ?? 0, hp: def.hp ?? 1, maxHp: def.hp ?? 1, aim: def.aim ?? 0,
        deployedTurn: g.turn, kills: 0, tmpAim: 0, tmpAtk: 0, flashed: false, chainShots: 0,
      };
      g.zones[d.zone].units[p].push(u);
      deployed.push(u);
      r.emit({ e: 'deploy', p, uid: u.uid, cardId: u.cardId, zone: u.zone });
    }
  }
  for (const u of deployed) if (u.hp > 0) r.enterZone(u);
  for (const u of deployed) {
    if (!findUnit(g, u.uid)) continue;
    for (const a of card(u.cardId).abilities ?? []) {
      if (a.k === 'onDeploy') r.applyEffect(a.effect, u.owner, u.zone, undefined, 'deploy', u);
      if (a.k === 'mimic') {
        const foes = g.zones[u.zone].units[other(u.owner)].filter((e) => e.hp > 0);
        if (foes.length === 0) continue;
        const best = [...foes].sort((a, b) => b.atk - a.atk || b.hp - a.hp)[0];
        u.atk = best.atk;
        u.hp = best.hp;
        u.maxHp = best.hp;
        u.aim = best.aim;
        r.emit({ e: 'buff', uids: [u.uid], label: '擬態' });
      }
    }
  }

  // Gear
  for (const p of order) {
    for (const gr of gears[p]) {
      const u = findUnit(g, gr.uid);
      if (!u || u.owner !== p) continue;
      const def = card(gr.cardId);
      if (def.slot === 'armor') {
        u.armor = gr.cardId;
        u.maxHp += def.mods?.hp ?? 0;
        u.hp += def.mods?.hp ?? 0;
      } else {
        u.weapon = gr.cardId;
      }
      r.emit({ e: 'equip', p, uid: u.uid, cardId: gr.cardId });
    }
  }

  // Tactics & streaks by speed, then initiative
  queue.sort((a, b) => a.speed - b.speed || order.indexOf(a.p) - order.indexOf(b.p) || a.order - b.order);
  for (const q of queue) {
    if (q.streak) {
      r.resolveStreak(q);
      continue;
    }
    const def = card(q.cardId!);
    const target = q.uid ? findUnit(g, q.uid) : undefined;
    const needsUnit = def.target === 'enemyUnit' || def.target === 'allyUnit';
    const fizzle = needsUnit && !target;
    r.emit({ e: 'tactic', p: q.p, cardId: def.id, zone: q.zone, uid: q.uid, fizzle });
    if (!fizzle && def.effect) r.applyEffect(def.effect, q.p, q.zone, q.uid, 'tactic');
  }

  r.combat();
  r.multikills();
  r.endOfTurn();
  r.scoring();

  if (r.detonateNukes() || r.checkWinner()) {
    r.emit({ e: 'gameOver', winner: g.winner, reason: g.winReason! });
  } else {
    beginTurn(g);
    r.emit({ e: 'turnStart', turn: g.turn });
  }
  return { state: g, events: r.events };
}

/**
 * Activate UAV during the planning phase: the opponent's hand stays visible until this turn resolves.
 * Returns null when it cannot be used (not enough SP, already active, game over).
 */
export function activateUav(input: GameState, p: PlayerId): GameState | null {
  const pl = input.players[p];
  if (input.winner !== null || pl.uavTurn === input.turn || pl.sp < STREAKS.uav.cost) return null;
  const g = structuredClone(input);
  g.players[p].sp -= STREAKS.uav.cost;
  g.players[p].uavTurn = g.turn;
  return g;
}

export function surrender(input: GameState, loser: PlayerId, reason: 'surrender' | 'disconnect' = 'surrender'): TurnResult {
  const g = structuredClone(input);
  g.winner = other(loser);
  g.winReason = reason;
  return { state: g, events: [{ e: 'gameOver', winner: g.winner, reason, snap: snapshot(g) }] };
}
