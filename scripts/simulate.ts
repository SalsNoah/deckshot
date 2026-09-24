/**
 * AI-vs-AI balance simulation.
 * Usage: npm run sim -- [gamesPerPairing=60] [difficultyA=normal] [difficultyB=difficultyA]
 * With two different difficulties, "A wins" in the pairing table measures the difficulty gap.
 */
import { createGame, DECKS, planAI, resolveTurn, viewFor, type Difficulty, type GameState, type Plan, type PlayerId } from '../src/engine';

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
  cardPlays: Record<string, number>;
  cardInWinner: Record<string, number>;
}

const stats: Stats = {
  games: 0, turns: 0, wins: {}, reasons: {}, draws: 0, firstInitiativeWins: 0, kills: 0, headshots: 0,
  c4Explode: 0, c4Defuse: 0, aces: 0, cardPlays: {}, cardInWinner: {},
};
const pairing: Record<string, { a: number; b: number; d: number }> = {};

function play(deckA: string, deckB: string, seed: number) {
  let g: GameState = createGame({ seed, players: [{ name: 'A', deckId: deckA }, { name: 'B', deckId: deckB }] });
  const firstInit = g.initiative;
  const played: [string[], string[]] = [[], []];
  while (g.winner === null) {
    const plans: [Plan, Plan] = [
      planAI(viewFor(g, 0), difficulty, seed * 31 + g.turn),
      planAI(viewFor(g, 1), difficultyB, seed * 57 + g.turn),
    ];
    const res = resolveTurn(g, plans);
    for (const ev of res.events) {
      if (ev.e === 'reveal') {
        ev.plays.forEach((list, p) => list.forEach((pl) => {
          const id = pl.t === 'streak' ? `streak:${pl.id}` : pl.t === 'move' ? 'move' : pl.cardId;
          played[p].push(id);
          stats.cardPlays[id] = (stats.cardPlays[id] ?? 0) + 1;
        }));
      }
      if (ev.e === 'kill') {
        stats.kills++;
        if (ev.hs) stats.headshots++;
      }
      if (ev.e === 'c4Explode') stats.c4Explode++;
      if (ev.e === 'c4Defuse') stats.c4Defuse++;
      if (ev.e === 'multikill' && ev.ace) stats.aces++;
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
console.log('\nDeck overall wins:');
for (const d of DECKS) {
  const total = Object.entries(pairing).filter(([k]) => k.split(' vs ').includes(d.id))
    .reduce((s, [k, v]) => {
      const [x, y] = k.split(' vs ');
      if (x === d.id && y === d.id) return s + v.a + v.b + v.d;
      return s + v.a + v.b + v.d;
    }, 0);
  console.log(`  ${d.id.padEnd(9)} ${pct(stats.wins[d.id] ?? 0, total)} of ${total} appearances`);
}
console.log('\nPairings (A wins / B wins / draws):');
for (const [k, v] of Object.entries(pairing)) console.log(`  ${k.padEnd(22)} ${v.a} / ${v.b} / ${v.d}`);
console.log('\nPlays (count, win-appearance rate):');
const rows = Object.entries(stats.cardPlays).sort((a, b) => b[1] - a[1]);
for (const [id, n] of rows) console.log(`  ${id.padEnd(18)} ${String(n).padStart(5)}  ${pct(stats.cardInWinner[id] ?? 0, stats.games)}`);
