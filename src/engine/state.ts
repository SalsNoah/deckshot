import { card, deckById, ZONE_MODS } from './cards';
import { randInt, shuffle } from './rng';
import type {
  Ability, BoardSnap, GameConfig, GameState, GameView, PlayerId, PlayerState, Unit, UnitSnap, ZoneId, ZoneState,
} from './types';

export const DEFAULT_CONFIG: GameConfig = {
  targetScore: 10,
  maxTurns: 10,
  maxPerZone: 3,
  startHand: 6,
  maxHand: 10,
  creditCap: 16,
};

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Base credit income. Grows by +2 each turn (T1=3 … T7+=15, capped by creditCap elsewhere). */
export function baseIncome(turn: number): number {
  return Math.min(1 + turn * 2, 15);
}

export interface PlayerSetup {
  name: string;
  deckId: string;
  cards?: string[];
}

export interface CreateGameOptions {
  seed?: number;
  players: [PlayerSetup, PlayerSetup];
  config?: Partial<GameConfig>;
  zoneMods?: [string, string, string];
}

function newPlayer(id: PlayerId, setup: PlayerSetup): PlayerState {
  const list = [...(setup.cards ?? deckById(setup.deckId).cards)];
  return {
    id,
    name: setup.name,
    deckId: setup.deckId,
    deckList: [...list],
    deck: list,
    hand: [],
    graveyard: [],
    credits: 0,
    bonusNextTurn: 0,
    sp: 0,
    score: 0,
    kills: 0,
    headshots: 0,
    uavTurn: -1,
  };
}

function newZone(id: ZoneId, modId: string): ZoneState {
  return { id, modId, units: [[], []], smoked: false, fires: [], c4: null, controller: null };
}

export function createGame(opts: CreateGameOptions): GameState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const g: GameState = {
    rng: seed,
    turn: 0,
    initiative: 0,
    players: [newPlayer(0, opts.players[0]), newPlayer(1, opts.players[1])],
    zones: [newZone(0, 'open'), newZone(1, 'open'), newZone(2, 'open')],
    winner: null,
    winReason: null,
    nextId: 1,
    config: { ...DEFAULT_CONFIG, ...opts.config },
  };
  const mods = opts.zoneMods ?? pickZoneMods(g);
  g.zones.forEach((z, i) => (z.modId = mods[i]));
  g.initiative = randInt(g, 2) as PlayerId;
  for (const p of g.players) {
    shuffle(g, p.deck);
    for (let i = 0; i < g.config.startHand; i++) drawCard(g, p.id);
  }
  beginTurn(g);
  return g;
}

function pickZoneMods(g: GameState): [string, string, string] {
  const pool = Object.keys(ZONE_MODS);
  shuffle(g, pool);
  return [pool[0], pool[1], pool[2]];
}

export function drawCard(g: GameState, p: PlayerId): boolean {
  const pl = g.players[p];
  const cardId = pl.deck.pop();
  if (!cardId) return false;
  if (pl.hand.length >= g.config.maxHand) return false;
  pl.hand.push({ hid: `h${g.nextId++}`, cardId });
  return true;
}

export function addToHand(g: GameState, p: PlayerId, cardId: string): boolean {
  const pl = g.players[p];
  if (pl.hand.length >= g.config.maxHand) return false;
  pl.hand.push({ hid: `h${g.nextId++}`, cardId });
  return true;
}

/** Advance to the next turn: income, eco, draw, initiative swap. */
export function beginTurn(g: GameState): void {
  g.turn += 1;
  if (g.turn > 1) g.initiative = other(g.initiative);
  for (const pl of g.players) {
    let income = baseIncome(g.turn) + pl.bonusNextTurn;
    for (const z of g.zones) {
      for (const u of z.units[pl.id]) {
        for (const a of abilitiesOf(u)) if (a.k === 'eco') income += a.n;
      }
    }
    pl.bonusNextTurn = 0;
    pl.credits = Math.min(g.config.creditCap, pl.credits + income);
    drawCard(g, pl.id);
  }
}

export function abilitiesOf(u: Unit): Ability[] {
  const list: Ability[] = [...(card(u.cardId).abilities ?? [])];
  if (u.weapon) list.push(...(card(u.weapon).abilities ?? []));
  if (u.armor) list.push(...(card(u.armor).abilities ?? []));
  return list;
}

export function hasAbility(u: Unit, k: Ability['k']): boolean {
  return abilitiesOf(u).some((a) => a.k === k);
}

export function abilityN(u: Unit, k: Ability['k']): number {
  let n = 0;
  for (const a of abilitiesOf(u)) {
    if (a.k !== k) continue;
    if ('n' in a && typeof a.n === 'number') n += a.n;
  }
  return n;
}

export function zoneCapacity(g: GameState | GameView, zone: ZoneId): number {
  return g.zones[zone].modId === 'choke' ? 2 : g.config.maxPerZone;
}

export function zoneValue(modId: string, turn = 1): number {
  const base = modId === 'highground' ? 2 : 1;
  return turn >= 7 ? base * 2 : base;
}

export function operatorCost(cardId: string, modId: string): number {
  const c = card(cardId);
  if (c.type === 'operator' && modId === 'outpost') return Math.max(1, c.cost - 1);
  return c.cost;
}

type Board = { turn: number; zones: ZoneState[] };

export function effAtk(g: Board, u: Unit): number {
  let v = u.atk + u.tmpAtk;
  if (u.weapon) v += card(u.weapon).mods?.atk ?? 0;
  const mod = g.zones[u.zone].modId;
  if (mod === 'cqb') v += 1;
  if (mod === 'longrange' && hasAbility(u, 'snipe')) v += 2;
  const allies = g.zones[u.zone].units[u.owner].filter((a) => a.uid !== u.uid && a.hp > 0);
  if (hasAbility(u, 'lonely') && allies.length === 0) v += abilityN(u, 'lonely') || 3;
  if (hasAbility(u, 'crowd')) v += allies.length;
  return Math.max(0, v);
}

export function effAim(g: Board, u: Unit): number {
  const zone = g.zones[u.zone];
  if (zone.modId === 'dark' || u.flashed) return 0;
  let v = u.aim + u.tmpAim;
  if (u.weapon) v += card(u.weapon).mods?.aim ?? 0;
  if (u.armor) v += card(u.armor).mods?.aim ?? 0;
  if (hasAbility(u, 'flank') && u.deployedTurn === g.turn) v += 3;
  for (const ally of zone.units[u.owner]) {
    if (ally.uid !== u.uid && ally.hp > 0) v += abilityN(ally, 'leader');
  }
  for (const enemy of zone.units[u.owner === 0 ? 1 : 0]) {
    if (enemy.hp > 0) v -= abilityN(enemy, 'suppress');
  }
  return Math.max(0, v);
}

export function isStealthed(g: Board, u: Unit): boolean {
  return u.deployedTurn === g.turn && hasAbility(u, 'stealth');
}

export function allUnits(g: Board): Unit[] {
  const out: Unit[] = [];
  for (const z of g.zones) out.push(...z.units[0], ...z.units[1]);
  return out;
}

export function findUnit(g: Board, uid: string): Unit | undefined {
  for (const z of g.zones) {
    for (const side of z.units) {
      const u = side.find((x) => x.uid === uid);
      if (u) return u;
    }
  }
  return undefined;
}

export function unitSnap(g: Board, u: Unit): UnitSnap {
  return {
    uid: u.uid,
    cardId: u.cardId,
    owner: u.owner,
    zone: u.zone,
    atk: effAtk(g, u),
    hp: u.hp,
    maxHp: u.maxHp,
    aim: effAim(g, u),
    weapon: u.weapon,
    armor: u.armor,
    flashed: u.flashed,
    stealth: isStealthed(g, u),
    fresh: u.deployedTurn === g.turn,
    kills: u.kills,
  };
}

export function snapshot(g: GameState): BoardSnap {
  return {
    turn: g.turn,
    zones: g.zones.map((z) => ({
      id: z.id,
      modId: z.modId,
      units: [z.units[0].map((u) => unitSnap(g, u)), z.units[1].map((u) => unitSnap(g, u))],
      smoked: z.smoked,
      fire: [
        z.fires.filter((f) => f.owner === 0).reduce((s, f) => s + f.dmg, 0),
        z.fires.filter((f) => f.owner === 1).reduce((s, f) => s + f.dmg, 0),
      ],
      c4: z.c4 ? { ...z.c4 } : null,
      controller: z.controller,
    })),
    players: [0, 1].map((i) => {
      const p = g.players[i];
      return { score: p.score, credits: p.credits, sp: p.sp, kills: p.kills, handCount: p.hand.length };
    }) as BoardSnap['players'],
  };
}

export function viewFor(g: GameState, me: PlayerId): GameView {
  const self = g.players[me];
  const opp = g.players[other(me)];
  const { deck, ...selfRest } = self;
  return {
    me,
    turn: g.turn,
    initiative: g.initiative,
    config: { ...g.config },
    zones: structuredClone(g.zones),
    self: { ...structuredClone(selfRest), deckCount: deck.length },
    opp: {
      id: opp.id,
      name: opp.name,
      deckId: opp.deckId,
      deckList: [...opp.deckList],
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      credits: opp.credits,
      sp: opp.sp,
      score: opp.score,
      kills: opp.kills,
      headshots: opp.headshots,
      hand: self.uavTurn === g.turn ? structuredClone(opp.hand) : undefined,
      graveyard: [...opp.graveyard],
    },
    winner: g.winner,
    winReason: g.winReason,
  };
}

/** Rebuild a playable state from a player's view (unknown info left empty). Used by the AI to simulate. */
export function stateFromView(v: GameView): GameState {
  const { deckCount: _deckCount, ...selfRest } = v.self;
  const self: PlayerState = { ...structuredClone(selfRest), deck: [] };
  const opp: PlayerState = {
    id: v.opp.id,
    name: v.opp.name,
    deckId: v.opp.deckId,
    deckList: [...(v.opp.deckList ?? [])],
    deck: [],
    hand: v.opp.hand ? structuredClone(v.opp.hand) : [],
    graveyard: [...v.opp.graveyard],
    credits: v.opp.credits,
    bonusNextTurn: 0,
    sp: v.opp.sp,
    score: v.opp.score,
    kills: v.opp.kills,
    headshots: v.opp.headshots,
    uavTurn: -1,
  };
  const players = (v.me === 0 ? [self, opp] : [opp, self]) as [PlayerState, PlayerState];
  return {
    rng: 12345,
    turn: v.turn,
    initiative: v.initiative,
    players,
    zones: structuredClone(v.zones) as GameState['zones'],
    winner: v.winner,
    winReason: v.winReason,
    nextId: 100000,
    config: { ...v.config },
  };
}
