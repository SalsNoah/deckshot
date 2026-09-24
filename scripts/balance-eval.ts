import { createGame, planAI, resolveTurn, viewFor, type Difficulty } from '../src/engine';

const N = 120;
const decks = ['rush', 'sniper', 'tactical'] as const;
const diff: Difficulty = 'normal';

type Acc = { n: number; win: number; lose: number; draw: number };

function heldZones(g: ReturnType<typeof createGame>): [number, number] {
  const held: [number, number] = [0, 0];
  for (const z of g.zones) {
    const a = z.units[0].length;
    const b = z.units[1].length;
    if (a > 0 && b === 0) held[0]++;
    if (b > 0 && a === 0) held[1]++;
  }
  return held;
}

function bump(acc: Acc, leader: 0 | 1, winner: 0 | 1 | 'draw') {
  acc.n++;
  if (winner === 'draw') acc.draw++;
  else if (winner === leader) acc.win++;
  else acc.lose++;
}

const board2: Acc = { n: 0, win: 0, lose: 0, draw: 0 };
const score2: Acc = { n: 0, win: 0, lose: 0, draw: 0 };
const board1: Acc = { n: 0, win: 0, lose: 0, draw: 0 };
const reasons: Record<string, number> = {};
const endTurns: number[] = [];
const scoreGapsT3: number[] = [];
const boardGapsT3: number[] = [];
let contestedT3 = 0;
let emptyLoserT3 = 0;

for (let seed = 1; seed <= N; seed++) {
  const d0 = decks[seed % 3];
  const d1 = decks[(seed + 1) % 3];
  let g = createGame({
    seed,
    players: [
      { name: 'A', deckId: d0 },
      { name: 'B', deckId: d1 },
    ],
  });

  let scoreLead: number | null = null;
  let boardLead: number | null = null;

  while (g.winner === null) {
    const plans = [
      planAI(viewFor(g, 0), diff, seed),
      planAI(viewFor(g, 1), diff, seed + 99),
    ] as const;
    g = resolveTurn(g, [...plans], { snapshots: false }).state;
    if (g.turn === 3) {
      scoreLead = g.players[0].score - g.players[1].score;
      const held = heldZones(g);
      boardLead = held[0] - held[1];
      scoreGapsT3.push(Math.abs(scoreLead));
      boardGapsT3.push(Math.abs(boardLead));
      if (held[0] + held[1] < 3) contestedT3++;
      if (held[0] === 0 || held[1] === 0) emptyLoserT3++;
    }
  }

  reasons[g.winReason ?? '?'] = (reasons[g.winReason ?? '?'] ?? 0) + 1;
  endTurns.push(g.turn);
  const w = g.winner!;

  if (boardLead !== null && Math.abs(boardLead) >= 2) {
    bump(board2, boardLead > 0 ? 0 : 1, w);
  }
  if (boardLead !== null && Math.abs(boardLead) === 1) {
    bump(board1, boardLead > 0 ? 0 : 1, w);
  }
  if (scoreLead !== null && Math.abs(scoreLead) >= 2) {
    bump(score2, scoreLead > 0 ? 0 : 1, w);
  }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (a: Acc) => (a.n ? +(a.win / a.n).toFixed(2) : null);

console.log(
  JSON.stringify(
    {
      N,
      turn3: {
        avgAbsScoreGap: +avg(scoreGapsT3).toFixed(2),
        avgAbsBoardGap: +avg(boardGapsT3).toFixed(2),
        gamesWithContestedOrEmpty: contestedT3,
        gamesWithOneSideZeroZones: emptyLoserT3,
      },
      convert: {
        boardLead2plus: { ...board2, convert: rate(board2) },
        boardLead1: { ...board1, convert: rate(board1) },
        scoreLead2plus: { ...score2, convert: rate(score2) },
      },
      avgEndTurn: +avg(endTurns).toFixed(2),
      reasons,
    },
    null,
    2,
  ),
);
