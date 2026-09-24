/**
 * AI-vs-AI balance simulation.
 * Usage: npm run sim -- [gamesPerPairing=60] [difficultyA=normal] [difficultyB=difficultyA]
 * With two different difficulties, "A wins" in the pairing table measures the difficulty gap.
 */
import {
  activateUav, createGame, DECKS, planAI, resolveTurn, viewFor, wantsUav,
  type Difficulty, type GameState, type Plan, type PlayerId,
} from '../src/engine';

const games = Number(process.argv[2] ?? 60);
const difficulty = (process.argv[3] ?? 'normal') as Difficulty;
const difficultyB = (process.argv[4] ?? difficulty) as Difficulty;

interface Stats {
  games: number;
  turns: number;
  wins: Record<string, number>;
  reasons: Record<string, number>;
  draws: number;
  firstInitiativeWins: number;
  kills: number;
  headshots: number;
  c4Explode: number;
  c4Defuse: number;
  aces: number;
  nukeArmed: number;
  nukeFizzle: number;
  cardPlays: Record<string, number>;
  cardInWinner: Record<string, number>;
  cardInLoser: Record<string, number>;
}

const stats: Stats = {
  games: 0, turns: 0, wins: {}, reasons: {}, draws: 0, firstInitiativeWins: 0, kills: 0, headshots: 0,
  c4Explode: 0, c4Defuse: 0, aces: 0, nukeArmed: 0, nukeFizzle: 0, cardPlays: {}, cardInWinner: {}, cardInLoser: {},
};
const pairing: Record<string, { a: number; b: number; d: number }> = {};

function play(deckA: string, deckB: string, seed: number) {
  let g: GameState = createGame({ seed, players: [{ name: 'A', deckId: deckA }, { name: 'B', deckId: deckB }] });
  const firstInit = g.initiative;
  const played: [string[], string[]] = [[], []];
  const diffs: [Difficulty, Difficulty] = [difficulty, difficultyB];
  const count = (p: PlayerId, id: string) => {
    played[p].push(id);
    stats.cardPlays[id] = (stats.cardPlays[id] ?? 0) + 1;
  };
  while (g.winner === null) {
    for (const p of [0, 1] as PlayerId[]) {
      if (!wantsUav(viewFor(g, p), diffs[p])) continue;
      g = activateUav(g, p) ?? g;
      count(p, 'streak:uav');
    }
    const plans: [Plan, Plan] = [
      planAI(viewFor(g, 0), difficulty, seed * 31 + g.turn),
      planAI(viewFor(g, 1), difficultyB, seed * 57 + g.turn),
    ];
    const res = resolveTurn(g, plans);
    for (const ev of res.events) {
      if (ev.e === 'reveal') {
        ev.plays.forEach((list, p) => list.forEach((pl) => {
          const id = pl.t === 'streak' ? `streak:${pl.id}` : pl.t === 'move' || pl.t === 'resupply' ? pl.t : pl.cardId;
          count(p as PlayerId, id);
        }));
      }
      if (ev.e === 'kill') {
        stats.kills++;
        if (ev.hs) stats.headshots++;
      }
      if (ev.e === 'c4Explode') stats.c4Explode++;
      if (ev.e === 'c4Defuse') stats.c4Defuse++;
      if (ev.e === 'multikill' && ev.ace) stats.aces++;
      if (ev.e === 'nukeArmed') stats.nukeArmed++;
      if (ev.e === 'nukeFizzle') stats.nukeFizzle++;
    }
    g = res.state;
  }
  stats.games++;
  stats.turns += g.turn;
  stats.reasons[g.winReason!] = (stats.reasons[g.winReason!] ?? 0) + 1;
  const key = `${deckA} vs ${deckB}`;
  pairing[key] ??= { a: 0, b: 0, d: 0 };
  if (g.winner === 'draw') {
    stats.draws++;
    pairing[key].d++;
    return;
  }
  const w = g.winner as PlayerId;
  const deck = w === 0 ? deckA : deckB;
  stats.wins[deck] = (stats.wins[deck] ?? 0) + 1;
  if (w === 0) pairing[key].a++;
  else pairing[key].b++;
  if (w === firstInit) stats.firstInitiativeWins++;
  for (const id of new Set(played[w])) stats.cardInWinner[id] = (stats.cardInWinner[id] ?? 0) + 1;
  for (const id of new Set(played[w === 0 ? 1 : 0])) stats.cardInLoser[id] = (stats.cardInLoser[id] ?? 0) + 1;
}

const t0 = Date.now();
let seed = 1;
for (const a of DECKS) {
  for (const b of DECKS) {
    for (let i = 0; i < games; i++) play(a.id, b.id, seed++);
  }
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
console.log(`\n=== ${stats.games} games (A:${difficulty} vs B:${difficultyB}) in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
const aWins = Object.values(pairing).reduce((s, v) => s + v.a, 0);
console.log(`player A win rate: ${pct(aWins, stats.games - stats.draws)}`);
console.log(`avg turns: ${(stats.turns / stats.games).toFixed(2)}`);
console.log('end reasons:', stats.reasons, `draws: ${stats.draws}`);
console.log(`first-initiative win rate: ${pct(stats.firstInitiativeWins, stats.games - stats.draws)}`);
console.log(`kills/game: ${(stats.kills / stats.games).toFixed(1)}, headshot rate: ${pct(stats.headshots, stats.kills)}`);
console.log(`C4 explode/game: ${(stats.c4Explode / stats.games).toFixed(2)}, defuse/game: ${(stats.c4Defuse / stats.games).toFixed(2)}, ACE/game: ${(stats.aces / stats.games).toFixed(2)}`);
console.log(`nuke armed/game: ${(stats.nukeArmed / stats.games).toFixed(2)}, stopped: ${pct(stats.nukeFizzle, stats.nukeArmed)}`);
console.log('\nDeck win rate (mirror matches excluded):');
for (const d of DECKS) {
  let w = 0;
  let n = 0;
  for (const [k, v] of Object.entries(pairing)) {
    const [x, y] = k.split(' vs ');
    if (x === y) continue;
    if (x === d.id) { w += v.a; n += v.a + v.b; }
    if (y === d.id) { w += v.b; n += v.a + v.b; }
  }
  console.log(`  ${d.id.padEnd(9)} ${pct(w, n)} of ${n} decided games`);
}
console.log('\nPairings (A wins / B wins / draws):');
for (const [k, v] of Object.entries(pairing)) console.log(`  ${k.padEnd(22)} ${v.a} / ${v.b} / ${v.d}`);
console.log('\nPlays (count, win rate of the player who played it):');
const rows = Object.entries(stats.cardPlays).sort((a, b) => b[1] - a[1]);
for (const [id, n] of rows) {
  const w = stats.cardInWinner[id] ?? 0;
  const l = stats.cardInLoser[id] ?? 0;
  console.log(`  ${id.padEnd(18)} ${String(n).padStart(5)}  ${pct(w, w + l)}`);
}
