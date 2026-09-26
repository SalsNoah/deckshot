import { describe, expect, it } from 'vitest';
import {
  activateUav, baseIncome, card, checkPlan, createGame, DECKS, effAim, effAtk, findUnit, planAI, resolveTurn, RESUPPLY_COST,
  validateDeck, viewFor,
  type GameEvent, type GameState, type Plan, type PlayerId, type Unit, type ZoneId,
} from './index';

const EMPTY: Plan = { actions: [] };

function setup(mods: [string, string, string] = ['open', 'open', 'open']): GameState {
  const g = createGame({
    seed: 42,
    players: [{ name: 'A', deckId: 'rush' }, { name: 'B', deckId: 'sniper' }],
    zoneMods: mods,
  });
  g.initiative = 0;
  return g;
}

function spawn(g: GameState, p: PlayerId, cardId: string, zone: ZoneId, patch: Partial<Unit> = {}): Unit {
  const def = card(cardId);
  const u: Unit = {
    uid: `t${g.nextId++}`, cardId, owner: p, zone,
    atk: def.atk!, hp: def.hp!, maxHp: def.hp!, aim: def.aim!,
    deployedTurn: 0, kills: 0, tmpAim: 0, tmpAtk: 0, flashed: false, chainShots: 0, ...patch,
  };
  g.zones[zone].units[p].push(u);
  return u;
}

function giveCard(g: GameState, p: PlayerId, cardId: string): string {
  const hid = `x${g.nextId++}`;
  g.players[p].hand.push({ hid, cardId });
  return hid;
}

const ofType = <T extends GameEvent['e']>(events: GameEvent[], e: T) =>
  events.filter((x): x is Extract<GameEvent, { e: T }> => x.e === e);

describe('game setup', () => {
  it('deals hands, income and three zone mods', () => {
    const g = createGame({ seed: 1, players: [{ name: 'A', deckId: 'rush' }, { name: 'B', deckId: 'tactical' }] });
    expect(g.turn).toBe(1);
    for (const p of g.players) {
      expect(p.hand).toHaveLength(7);
      expect(p.deck).toHaveLength(23);
      expect(p.credits).toBe(3);
    }
    expect(new Set(g.zones.map((z) => z.modId)).size).toBe(3);
  });

  it('every preset deck has 30 cards and at most 2 copies', () => {
    for (const deckId of ['rush', 'sniper', 'tactical']) {
      const g = createGame({ seed: 3, players: [{ name: 'A', deckId }, { name: 'B', deckId }] });
      const all = [...g.players[0].deck, ...g.players[0].hand.map((h) => h.cardId)];
      expect(all).toHaveLength(30);
      const counts = new Map<string, number>();
      all.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it('validateDeck enforces size, copies, and ownership', () => {
    const rush = [...DECKS[0].cards];
    expect(validateDeck(rush).ok).toBe(true);
    expect(validateDeck(rush.slice(0, 10)).ok).toBe(false);
    const threeRookies = Array.from({ length: 30 }, (_, i) => (i < 3 ? 'rookie' : 'flashbang'));
    expect(validateDeck(threeRookies).ok).toBe(false);
    expect(validateDeck(rush, { rookie: 1 }).ok).toBe(false);
    const owned = Object.fromEntries([...new Set(rush)].map((id) => [id, 2]));
    expect(validateDeck(rush, owned).ok).toBe(true);
  });

  it('custom cards override preset and set deckList', () => {
    const cards = [
      ...'rookie,rookie,scout,scout,jolt,jolt,bulwark,bulwark,haze,wire'.split(','),
      ...'smg,smg,ar,vest,flashbang,flashbang,frag,stim,eco,smoke'.split(','),
      ...'ghost,ghost,blitz,blitz,knife,shotgun,drone,molotov,precision,fallback'.split(','),
    ];
    expect(cards).toHaveLength(30);
    const g = createGame({
      seed: 9,
      players: [
        { name: 'A', deckId: 'custom', cards },
        { name: 'B', deckId: 'rush' },
      ],
    });
    expect(g.players[0].deckList).toEqual(cards);
    expect(g.players[0].deckList).toHaveLength(30);
  });
});

describe('combat', () => {
  it('higher AIM shoots first and the victim cannot shoot back (headshot from full HP)', () => {
    const g = setup();
    const fast = spawn(g, 0, 'jolt', 0, { aim: 7 });
    const slow = spawn(g, 1, 'rookie', 0);
    const { state, events } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(findUnit(state, slow.uid)).toBeUndefined();
    expect(findUnit(state, fast.uid)!.hp).toBe(fast.maxHp);
    const kill = ofType(events, 'kill')[0];
    expect(kill.hs).toBe(true);
    expect(state.players[0].kills).toBe(1);
    expect(state.players[0].sp).toBe(1);
  });

  it('equal AIM trades simultaneously', () => {
    const g = setup();
    const a = spawn(g, 0, 'rookie', 1, { atk: 2 });
    const b = spawn(g, 1, 'rookie', 1, { atk: 2 });
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(findUnit(state, a.uid)).toBeUndefined();
    expect(findUnit(state, b.uid)).toBeUndefined();
  });

  it('guards draw fire; snipers ignore guards', () => {
    const g = setup();
    spawn(g, 0, 'rookie', 0, { aim: 9, atk: 1 });
    const sniper = spawn(g, 0, 'hawk', 0, { aim: 8 });
    const guard = spawn(g, 1, 'bulwark', 0);
    const soft = spawn(g, 1, 'jolt', 0);
    const { events } = resolveTurn(g, [EMPTY, EMPTY]);
    const shots = ofType(events, 'shot');
    expect(shots[0].to).toBe(guard.uid);
    expect(shots.find((s) => s.from === sniper.uid)!.to).toBe(soft.uid);
  });

  it('snipers shoot into an adjacent zone when their own zone is empty', () => {
    const g = setup();
    const sniper = spawn(g, 0, 'hawk', 1);
    const far = spawn(g, 1, 'rookie', 2);
    const { events } = resolveTurn(g, [EMPTY, EMPTY]);
    const shot = ofType(events, 'shot').find((s) => s.from === sniper.uid)!;
    expect(shot.to).toBe(far.uid);
    expect(shot.toZone).toBe(2);
  });

  it('flashbang drops enemy AIM to 0 so the flasher wins the duel', () => {
    const g = setup();
    const mine = spawn(g, 0, 'rookie', 0, { atk: 3, hp: 3, maxHp: 3 });
    const theirs = spawn(g, 1, 'jolt', 0, { aim: 9, atk: 3 });
    const hid = giveCard(g, 0, 'flashbang');
    const { state } = resolveTurn(g, [{ actions: [{ t: 'tactic', hid, zone: 0 }] }, EMPTY]);
    expect(findUnit(state, theirs.uid)).toBeUndefined();
    expect(findUnit(state, mine.uid)).toBeDefined();
  });

  it('smoke prevents combat in that zone', () => {
    const g = setup();
    spawn(g, 0, 'rookie', 2);
    spawn(g, 1, 'rookie', 2);
    const hid = giveCard(g, 1, 'smoke');
    const { events } = resolveTurn(g, [EMPTY, { actions: [{ t: 'tactic', hid, zone: 2 }] }]);
    expect(ofType(events, 'shot')).toHaveLength(0);
  });

  it('ACE chains extra shots after kills', () => {
    const g = setup();
    const ace = spawn(g, 0, 'ace', 1);
    spawn(g, 1, 'rookie', 1);
    spawn(g, 1, 'rookie', 1);
    spawn(g, 1, 'scout', 1, { aim: 1 });
    const { state, events } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.zones[1].units[1]).toHaveLength(0);
    expect(ofType(events, 'shot').filter((s) => s.from === ace.uid)).toHaveLength(3);
    const mk = ofType(events, 'multikill')[0];
    expect(mk.count).toBe(3);
    expect(mk.ace).toBe(true);
  });

  it('traps damage enemies that deploy into the zone', () => {
    const g = setup();
    spawn(g, 1, 'wire', 0);
    const hid = giveCard(g, 0, 'scout');
    const { state, events } = resolveTurn(g, [{ actions: [{ t: 'deploy', hid, zone: 0 }] }, EMPTY]);
    expect(ofType(events, 'damage').some((d) => d.source === 'trap')).toBe(true);
    expect(state.zones[0].units[0]).toHaveLength(0);
  });
});

describe('scoring and objectives', () => {
  it('uncontested zones score, contested do not, high ground is worth 2', () => {
    const g = setup(['highground', 'open', 'open']);
    spawn(g, 0, 'bulwark', 0);
    spawn(g, 0, 'bulwark', 1);
    spawn(g, 1, 'bulwark', 1);
    spawn(g, 1, 'bulwark', 2);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.players[0].score).toBe(2);
    expect(state.players[1].score).toBe(1);
  });

  it('C4 explodes next turn if the defender has not retaken the zone', () => {
    const g = setup();
    spawn(g, 0, 'bulwark', 2);
    const hid = giveCard(g, 0, 'c4');
    const t1 = resolveTurn(g, [{ actions: [{ t: 'tactic', hid, zone: 2 }] }, EMPTY]);
    expect(t1.state.zones[2].c4?.owner).toBe(0);
    const before = t1.state.players[0].score;
    const t2 = resolveTurn(t1.state, [EMPTY, EMPTY]);
    expect(ofType(t2.events, 'c4Explode')).toHaveLength(1);
    expect(t2.state.players[0].score).toBe(before + 2 + 1);
  });

  it('C4 is defused when the defender controls the zone', () => {
    const g = setup();
    spawn(g, 0, 'rookie', 2);
    const hid = giveCard(g, 0, 'c4');
    const t1 = resolveTurn(g, [{ actions: [{ t: 'tactic', hid, zone: 2 }] }, EMPTY]);
    const s = structuredClone(t1.state);
    s.zones[2].units[0] = [];
    spawn(s, 1, 'bulwark', 2);
    const t2 = resolveTurn(s, [EMPTY, EMPTY]);
    expect(ofType(t2.events, 'c4Defuse')).toHaveLength(1);
    expect(ofType(t2.events, 'c4Explode')).toHaveLength(0);
  });

  it('tactical nuke lands at the end of the next turn and wins', () => {
    const g = setup();
    g.players[1].sp = 12;
    spawn(g, 0, 'titan', 0);
    const t1 = resolveTurn(g, [EMPTY, { actions: [{ t: 'streak', id: 'nuke' }] }]);
    expect(t1.state.winner).toBeNull();
    expect(ofType(t1.events, 'nukeArmed')).toHaveLength(1);
    expect(t1.state.players[1].nukeTurn).toBe(t1.state.turn);
    expect(viewFor(t1.state, 0).opp.nukeTurn).toBe(t1.state.turn);
    const t2 = resolveTurn(t1.state, [EMPTY, EMPTY]);
    expect(t2.state.winner).toBe(1);
    expect(t2.state.winReason).toBe('nuke');
    expect(t2.state.zones[0].units[0]).toHaveLength(0);
    expect(t2.events.at(-1)!.e).toBe('gameOver');
  });

  it('tactical nuke is stopped when the target holds two zones', () => {
    const g = setup();
    g.players[1].sp = 12;
    spawn(g, 0, 'titan', 0);
    spawn(g, 0, 'titan', 1);
    const t1 = resolveTurn(g, [EMPTY, { actions: [{ t: 'streak', id: 'nuke' }] }]);
    const t2 = resolveTurn(t1.state, [EMPTY, EMPTY]);
    expect(ofType(t2.events, 'nukeFizzle')).toHaveLength(1);
    expect(t2.state.winReason).not.toBe('nuke');
    expect(t2.state.players[1].nukeTurn).toBe(-1);
  });

  it('tactical nuke cannot be armed twice or on the final turn', () => {
    const g = setup();
    g.players[0].sp = 30;
    g.players[0].nukeTurn = g.turn;
    expect(checkPlan(viewFor(g, 0), { actions: [{ t: 'streak', id: 'nuke' }] }).valid).toHaveLength(0);
    g.players[0].nukeTurn = -1;
    g.turn = g.config.maxTurns;
    expect(checkPlan(viewFor(g, 0), { actions: [{ t: 'streak', id: 'nuke' }] }).valid).toHaveLength(0);
  });

  it('losing units gives SP once per turn', () => {
    const g = setup();
    spawn(g, 0, 'ace', 1);
    spawn(g, 1, 'rookie', 1);
    spawn(g, 1, 'rookie', 1);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.zones[1].units[1]).toHaveLength(0);
    expect(state.players[1].sp).toBe(1);
  });

  it('reaching the target score wins', () => {
    const g = setup();
    g.players[0].score = 9;
    spawn(g, 0, 'bulwark', 0);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.winner).toBe(0);
  });

  it('match point gives the trailing player +1 per held zone', () => {
    const g = setup();
    g.players[0].score = 8;
    g.players[1].score = 3;
    spawn(g, 0, 'bulwark', 0);
    spawn(g, 1, 'bulwark', 2);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.players[0].score).toBe(9);
    expect(state.players[1].score).toBe(5);
  });

  it('zone points double from turn 7', () => {
    const g = setup(['open', 'highground', 'open']);
    g.turn = 7;
    spawn(g, 0, 'bulwark', 0);
    spawn(g, 0, 'bulwark', 1);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    // open 1→2, highground 2→4
    expect(state.players[0].score).toBe(6);
  });
});

describe('plans and hidden information', () => {
  it('rejects unaffordable actions and full zones', () => {
    const g = setup(['choke', 'open', 'open']);
    g.players[0].credits = 3;
    const a = giveCard(g, 0, 'rookie');
    const b = giveCard(g, 0, 'rookie');
    const c = giveCard(g, 0, 'rookie');
    const d = giveCard(g, 0, 'ace');
    const res = checkPlan(viewFor(g, 0), {
      actions: [
        { t: 'deploy', hid: a, zone: 0 },
        { t: 'deploy', hid: b, zone: 0 },
        { t: 'deploy', hid: c, zone: 0 },
        { t: 'deploy', hid: d, zone: 1 },
      ],
    });
    expect(res.valid).toHaveLength(2);
    expect(res.errors.map((e) => e.index)).toEqual([2, 3]);
  });

  it('gear can target an operator deployed in the same plan', () => {
    const g = setup();
    g.players[0].credits = 10;
    const op = giveCard(g, 0, 'rookie');
    const gun = giveCard(g, 0, 'ar');
    const { state } = resolveTurn(g, [
      { actions: [{ t: 'deploy', hid: op, zone: 1 }, { t: 'gear', hid: gun, target: { hid: op } }] },
      EMPTY,
    ]);
    expect(state.zones[1].units[0][0].weapon).toBe('ar');
  });

  it('views hide the opponent hand unless UAV is active', () => {
    const g = setup();
    const v = viewFor(g, 0);
    expect(v.opp.hand).toBeUndefined();
    expect(v.opp.handCount).toBe(g.players[1].hand.length);
    expect('deck' in v.self).toBe(false);
  });

  it('UAV reveals the opponent hand immediately for the current planning phase', () => {
    const g = setup();
    expect(activateUav(g, 1)).toBeNull();
    g.players[1].sp = 3;
    const s = activateUav(g, 1)!;
    expect(s.players[1].sp).toBe(1);
    expect(viewFor(s, 1).opp.hand).toHaveLength(s.players[0].hand.length);
    expect(viewFor(s, 0).opp.uavActive).toBe(true);
    expect(activateUav(s, 1)).toBeNull();
    expect(checkPlan(viewFor(s, 1), { actions: [{ t: 'streak', id: 'uav' }] }).valid).toHaveLength(0);
    const next = resolveTurn(s, [EMPTY, EMPTY]).state;
    expect(viewFor(next, 1).opp.hand).toBeUndefined();
  });

  it('resupply costs credits and draws a card once per turn', () => {
    const g = setup();
    g.players[0].credits = 10;
    const handBefore = g.players[0].hand.length;
    const res = checkPlan(viewFor(g, 0), { actions: [{ t: 'resupply' }, { t: 'resupply' }] });
    expect(res.valid).toHaveLength(1);
    const { state, events } = resolveTurn(g, [{ actions: [{ t: 'resupply' }] }, EMPTY]);
    expect(ofType(events, 'draw').some((d) => d.p === 0 && d.count === 1)).toBe(true);
    // +1 from resupply, +1 from the normal draw at the start of the next turn
    expect(state.players[0].hand.length).toBe(handBefore + 2);
    expect(state.players[0].credits).toBe(Math.min(state.config.creditCap, 10 - RESUPPLY_COST + baseIncome(state.turn)));
  });

  it('resupply is refunded when the hand is full', () => {
    const g = setup();
    g.players[0].credits = 5;
    while (g.players[0].hand.length < g.config.maxHand) giveCard(g, 0, 'rookie');
    const { state } = resolveTurn(g, [{ actions: [{ t: 'resupply' }] }, EMPTY]);
    expect(state.players[0].credits).toBe(Math.min(state.config.creditCap, 5 + baseIncome(state.turn)));
  });

  it('income grows by 2 per turn up to 11', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(baseIncome)).toEqual([3, 5, 7, 9, 11, 11, 11]);
  });

  it('resolution is deterministic', () => {
    const g = createGame({ seed: 7, players: [{ name: 'A', deckId: 'rush' }, { name: 'B', deckId: 'tactical' }] });
    const p0 = planAI(viewFor(g, 0), 'normal', 1);
    const p1 = planAI(viewFor(g, 1), 'normal', 2);
    const a = resolveTurn(g, [p0, p1]);
    const b = resolveTurn(g, [p0, p1]);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe('extreme abilities', () => {
  it('bane kills regardless of remaining HP', () => {
    const g = setup();
    spawn(g, 0, 'widow', 0, { aim: 9 });
    const tank = spawn(g, 1, 'titan', 0);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(findUnit(state, tank.uid)).toBeUndefined();
  });

  it('phoenix survives the first lethal hit at 1 HP', () => {
    const g = setup();
    const bird = spawn(g, 0, 'phoenix', 0, { aim: 1 });
    spawn(g, 1, 'rookie', 0, { atk: 5, aim: 9 });
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    const u = findUnit(state, bird.uid);
    expect(u).toBeDefined();
    expect(u!.hp).toBe(1);
    expect(u!.phoenixUsed).toBe(true);
  });

  it('lastWords of blast damages enemies when destroyed', () => {
    const g = setup();
    const bomb = spawn(g, 0, 'blast', 0, { aim: 1 });
    const foe = spawn(g, 1, 'titan', 0, { atk: 5, aim: 9 });
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(findUnit(state, bomb.uid)).toBeUndefined();
    const left = findUnit(state, foe.uid);
    expect(left).toBeDefined();
    // titan has armored → lastWords 3 becomes 2
    expect(left!.hp).toBe(foe.hp - 2);
  });

  it('ephemeral units die at end of turn', () => {
    const g = setup();
    const spark = spawn(g, 0, 'spark', 1);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(findUnit(state, spark.uid)).toBeUndefined();
  });

  it('lonely buffs ATK when alone; crowd scales with allies', () => {
    const g = setup();
    const lone = spawn(g, 0, 'lonewolf', 0);
    const pack = spawn(g, 0, 'pack', 1);
    spawn(g, 0, 'rookie', 1);
    spawn(g, 0, 'rookie', 1);
    expect(effAtk(g, lone)).toBe(5); // 2+3
    expect(effAtk(g, pack)).toBe(4); // 2+2 allies
  });

  it('bond buffs ATK/AIM only when the partner is in the same zone', () => {
    const g = setup();
    const ember = spawn(g, 0, 'ember', 0);
    expect(effAtk(g, ember)).toBe(2);
    const frost = spawn(g, 0, 'frost', 0);
    expect(effAtk(g, ember)).toBe(4); // +2 from bond
    expect(effAim(g, frost)).toBe(7); // 4+3 bond
    // Different zone → no bond
    const fang = spawn(g, 0, 'fang', 1);
    spawn(g, 0, 'claw', 2);
    expect(effAtk(g, fang)).toBe(3);
  });

  it('mimic copies the highest-ATK enemy on deploy', () => {
    const g = setup();
    g.players[0].credits = 10;
    spawn(g, 1, 'ace', 1);
    g.zones[1].smoked = true;
    const hid = giveCard(g, 0, 'mimic');
    const { state } = resolveTurn(g, [{ actions: [{ t: 'deploy', hid, zone: 1 }] }, EMPTY]);
    const u = state.zones[1].units[0].find((x) => x.cardId === 'mimic')!;
    expect(u.atk).toBe(5);
    expect(u.hp).toBe(6);
    expect(u.maxHp).toBe(6);
    expect(u.aim).toBe(8);
  });

  it('berserk gains ATK each time it survives damage', () => {
    const g = setup();
    const mochi = spawn(g, 0, 'mochi', 0);
    spawn(g, 1, 'rookie', 0, { aim: 5 });
    spawn(g, 1, 'rookie', 0, { aim: 6 });
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    const u = findUnit(state, mochi.uid)!;
    expect(u.hp).toBe(3);
    expect(u.atk).toBe(2);
  });

  it('sweep shoots every enemy in its zone and drain heals from each hit', () => {
    const g = setup();
    const havoc = spawn(g, 0, 'havoc', 1, { hp: 5 });
    spawn(g, 1, 'rookie', 1);
    spawn(g, 1, 'bulwark', 1);
    spawn(g, 1, 'scout', 1);
    const { state, events } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(ofType(events, 'shot').filter((s) => s.from === havoc.uid)).toHaveLength(3);
    expect(state.zones[1].units[1]).toHaveLength(0);
    expect(findUnit(state, havoc.uid)!.hp).toBe(10);
  });

  it('capture adds a point when its zone is held', () => {
    const g = setup();
    spawn(g, 0, 'beacon', 0);
    spawn(g, 1, 'bulwark', 2);
    const { state } = resolveTurn(g, [EMPTY, EMPTY]);
    expect(state.players[0].score).toBe(2);
    expect(state.players[1].score).toBe(1);
  });

  it('salvo damages enemies in every zone on deploy', () => {
    const g = setup();
    g.players[0].credits = 10;
    g.zones.forEach((z) => (z.smoked = true));
    const a = spawn(g, 1, 'titan', 0);
    const b = spawn(g, 1, 'rookie', 2);
    const mine = spawn(g, 0, 'rookie', 2);
    const hid = giveCard(g, 0, 'salvo');
    const { state } = resolveTurn(g, [{ actions: [{ t: 'deploy', hid, zone: 1 }] }, EMPTY]);
    expect(findUnit(state, a.uid)!.hp).toBe(a.hp - 1); // armored
    expect(findUnit(state, b.uid)).toBeUndefined();
    expect(findUnit(state, mine.uid)!.hp).toBe(mine.hp);
  });

  it('bit banks credits for next turn', () => {
    const g = setup();
    g.players[0].credits = 1;
    const hid = giveCard(g, 0, 'bit');
    const { state } = resolveTurn(g, [{ actions: [{ t: 'deploy', hid, zone: 0 }] }, EMPTY]);
    expect(state.players[0].credits).toBe(Math.min(state.config.creditCap, baseIncome(state.turn) + 2));
  });
});

describe('AI', () => {
  it('plays full games to completion', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let g = createGame({ seed, players: [{ name: 'A', deckId: 'rush' }, { name: 'B', deckId: 'sniper' }] });
      let guard = 0;
      while (g.winner === null && guard++ < 30) {
        const plans: [Plan, Plan] = [planAI(viewFor(g, 0), 'easy', seed), planAI(viewFor(g, 1), 'easy', seed + 99)];
        for (const p of [0, 1] as PlayerId[]) expect(checkPlan(viewFor(g, p), plans[p]).errors).toEqual([]);
        g = resolveTurn(g, plans, { snapshots: false }).state;
      }
      expect(g.winner).not.toBeNull();
      expect(g.turn).toBeLessThanOrEqual(g.config.maxTurns);
    }
  });
});
