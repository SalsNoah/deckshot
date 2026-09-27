/**
 * First-run training match: a fixed four-turn scenario the player is coached through, one tap at a time.
 * Both decks are stacked, the zones and initiative are fixed, and both sides play the script below,
 * so every run plays out identically and the player wins 10–4 on turn 4 with an ACE.
 */
import {
  createGame, resolveTurn, surrender, viewFor,
  type Action, type GameState, type GameView, type Plan, type StreakId, type ZoneId,
} from '../engine';
import type { EmoteId } from '../net/protocol';
import type { MatchConnection, MatchHandlers } from './match';

/** One scripted action, named by card so it reads like the coach's instructions. */
export type TutPlay =
  | { t: 'deploy'; card: string; zone: ZoneId }
  | { t: 'gear'; card: string; on: string }
  | { t: 'tactic'; card: string; zone: ZoneId }
  | { t: 'move'; unit: string; zone: ZoneId }
  | { t: 'streak'; id: StreakId; zone: ZoneId }
  | { t: 'resupply' };

/** A spot on the battle screen the coach can point at (`unit:` = one of the player's units by card id). */
export type TutFocus =
  | 'board' | 'score' | 'credits' | 'sp' | 'resupply' | 'ready'
  | `zone:${ZoneId}` | `move:${ZoneId}` | `hand:${string}` | `unit:${string}` | `streak:${StreakId}`;

/** The single input that moves an action step forward. */
export type TutGate =
  | { k: 'hand'; card: string }
  | { k: 'zone'; zone: ZoneId }
  | { k: 'unit'; card: string }
  | { k: 'move'; zone: ZoneId }
  | { k: 'streak'; id: StreakId }
  | { k: 'resupply' }
  | { k: 'ready' };

/** What the player just tried to do on the battle screen. */
export type TutInput =
  | { k: 'hand'; card: string }
  | { k: 'zone'; zone: ZoneId }
  | { k: 'unit'; card: string; mine: boolean }
  | { k: 'move'; zone: ZoneId }
  | { k: 'streak'; id: StreakId }
  | { k: 'resupply' }
  | { k: 'ready' };

export interface TutStep {
  /** Coach line; `**word**` is emphasized. */
  say: string;
  /** Absent on info steps, which continue on a tap anywhere. */
  gate?: TutGate;
  focus?: TutFocus;
}

type Beat = { say: string; focus?: TutFocus } | { play: TutPlay; say: string[] };

interface TutTurn {
  beats: Beat[];
  ready: string;
  cpu: TutPlay[];
}

export const TUTORIAL_OPP = '訓練用BOT';

/** Draw order, first card first. The first `startHand` cards are the opening hand. */
const PLAYER_DECK = [
  'jolt', 'ar', 'brute',
  'frag', // T1
  'smoke', // T2
  'vest', // T3
  'ace', // T3 resupply
  'flashbang', // T4
  'rookie', 'smg', 'ghost', 'stim', 'drone', 'knife', 'eco', 'blitz',
];
const CPU_DECK = [
  'rookie', 'rookie', 'bulwark',
  'dot', // T1
  'blitz', // T2
  'jolt', // T3
  'reaper', // T4
  'scout', 'smoke', 'vest', 'haze', 'eco', 'wire', 'bit', 'frag', 'ar',
];

const TURNS: Record<number, TutTurn> = {
  1: {
    beats: [
      { say: 'ようこそ、新兵。ここは訓練場だ。実戦形式で、操作をひと通り覚えてもらう。' },
      {
        say: '戦場は **A / MID / B** の3ゾーン。ターン終了時、**自分のユニットだけがいるゾーン**を確保して得点。先に **10pt** 取った方が勝ちだ。',
        focus: 'board',
      },
      { say: 'カードは **クレジット（¢）** を払って使う。カード左上の数字がコストだ。いまは **3¢** ある。', focus: 'credits' },
      {
        play: { t: 'deploy', card: 'jolt', zone: 0 },
        say: ['まずはオペレーターを出す。手札の **JOLT** をタップ。', '配置するゾーンを選ぶ。**A** をタップ。'],
      },
    ],
    ready: '作戦はこれで決まりだ。**READY** で確定！ 相手も同時に、見えないところで作戦を立てている。',
    cpu: [{ t: 'deploy', card: 'rookie', zone: 0 }, { t: 'deploy', card: 'rookie', zone: 2 }],
  },
  2: {
    beats: [
      {
        say: 'ナイスショット！ 撃ち合いは **AIMが高い順**。JOLTが先に撃ち、HP満タンの敵を一撃で倒した。これが **HEADSHOT**、ボーナスで¢が増える。',
        focus: 'unit:jolt',
      },
      { say: 'Aを確保して **+1pt**。敵もBを確保した。キルを取ると **SP** も溜まる。', focus: 'score' },
      {
        play: { t: 'gear', card: 'ar', on: 'jolt' },
        say: ['次は装備だ。手札のアサルトライフル **M4-K** をタップ。', '装備させる味方をタップ。**JOLT** に持たせろ。'],
      },
      { say: 'MIDは **高台**。確保すると **2pt** 入る。ゾーンの効果は各ゾーン上のアイコンで確かめられる。', focus: 'zone:1' },
      { play: { t: 'deploy', card: 'brute', zone: 1 }, say: ['**BRUTE** をタップ。', '**MID** をタップして配置。'] },
    ],
    ready: '準備完了。**READY**！',
    cpu: [{ t: 'deploy', card: 'bulwark', zone: 0 }, { t: 'deploy', card: 'dot', zone: 2 }],
  },
  3: {
    beats: [
      { say: '装備でATKが上がったJOLTが、また一撃で仕留めた。高台も取って **4-2** でリードだ。', focus: 'score' },
      { say: 'Bに敵が2体。まとめて片付けて、Bも奪い取るぞ。', focus: 'zone:2' },
      {
        play: { t: 'move', unit: 'brute', zone: 2 },
        say: ['ユニットは隣のゾーンへ動かせる。これが **ローテ**。MIDの **BRUTE** をタップ。', '**Bへローテ（1¢）** をタップ。'],
      },
      {
        play: { t: 'tactic', card: 'frag', zone: 2 },
        say: ['戦術カードの出番だ。**FRAG** をタップ。', '**B** をタップ。ゾーンの敵全員に2ダメージ！'],
      },
      {
        play: { t: 'resupply' },
        say: ['¢が余ったら **補給**。4¢でカードを1枚引ける。引いたカードは次のターンから使える。'],
      },
    ],
    ready: '行くぞ。**READY**！',
    cpu: [{ t: 'deploy', card: 'blitz', zone: 1 }, { t: 'deploy', card: 'jolt', zone: 1 }],
  },
  4: {
    beats: [
      { say: 'DOUBLE KILL！ …だが、空いた高台を敵に取られた。攻めれば守りが薄くなる。これも読み合いだ。', focus: 'zone:1' },
      {
        say: 'キルで溜まる **SP** はキルストリークに使う。UAV（2）・空爆（4）・戦術核（12）。いまSPは4、**空爆** が撃てる！',
        focus: 'sp',
      },
      {
        play: { t: 'streak', id: 'airstrike', zone: 1 },
        say: ['**空爆** をタップ。', '**MID** をタップ。ゾーンの敵全員に3ダメージだ！'],
      },
      {
        play: { t: 'deploy', card: 'ace', zone: 1 },
        say: ['補給で引いた **ACE** で高台を奪い返す。**ACE** をタップ。', '**MID** をタップ。'],
      },
    ],
    ready: 'これで決める。**READY**！',
    cpu: [{ t: 'deploy', card: 'reaper', zone: 2 }],
  },
};

export const TUTORIAL_TURNS = Object.keys(TURNS).length;

export function createTutorialGame(playerName: string): GameState {
  return createGame({
    seed: 1,
    stacked: true,
    initiative: 0,
    zoneMods: ['open', 'highground', 'open'],
    config: { startHand: 3 },
    players: [
      { name: playerName, deckId: 'training', cards: PLAYER_DECK },
      { name: TUTORIAL_OPP, deckId: 'training', cards: CPU_DECK },
    ],
  });
}

function gatesOf(p: TutPlay): TutGate[] {
  switch (p.t) {
    case 'deploy':
    case 'tactic':
      return [{ k: 'hand', card: p.card }, { k: 'zone', zone: p.zone }];
    case 'gear':
      return [{ k: 'hand', card: p.card }, { k: 'unit', card: p.on }];
    case 'move':
      return [{ k: 'unit', card: p.unit }, { k: 'move', zone: p.zone }];
    case 'streak':
      return [{ k: 'streak', id: p.id }, { k: 'zone', zone: p.zone }];
    case 'resupply':
      return [{ k: 'resupply' }];
  }
}

function focusOf(g: TutGate): TutFocus {
  switch (g.k) {
    case 'hand': return `hand:${g.card}`;
    case 'zone': return `zone:${g.zone}`;
    case 'unit': return `unit:${g.card}`;
    case 'move': return `move:${g.zone}`;
    case 'streak': return `streak:${g.id}`;
    case 'resupply': return 'resupply';
    case 'ready': return 'ready';
  }
}

/** The coach's steps for a turn: briefing lines, then one step per tap of each scripted action, then READY. */
export function tutorialSteps(turn: number): TutStep[] {
  const t = TURNS[turn];
  if (!t) return [];
  const steps: TutStep[] = [];
  for (const b of t.beats) {
    if ('play' in b) {
      gatesOf(b.play).forEach((gate, i) => steps.push({ say: b.say[i] ?? b.say[b.say.length - 1]!, gate, focus: focusOf(gate) }));
    } else {
      steps.push({ say: b.say, focus: b.focus });
    }
  }
  steps.push({ say: t.ready, gate: { k: 'ready' }, focus: 'ready' });
  return steps;
}

export function gateAllows(gate: TutGate | undefined, i: TutInput): boolean {
  if (!gate || gate.k !== i.k) return false;
  switch (gate.k) {
    case 'hand': return i.k === 'hand' && i.card === gate.card;
    case 'zone': return i.k === 'zone' && i.zone === gate.zone;
    case 'unit': return i.k === 'unit' && i.mine && i.card === gate.card;
    case 'move': return i.k === 'move' && i.zone === gate.zone;
    case 'streak': return i.k === 'streak' && i.id === gate.id;
    case 'resupply':
    case 'ready':
      return true;
  }
}

/** Turn scripted plays into engine actions against the current hand and board. */
function scriptPlan(view: GameView, plays: TutPlay[]): Plan {
  const used = new Set<string>();
  const hid = (cardId: string) => {
    const h = view.self.hand.find((x) => x.cardId === cardId && !used.has(x.hid));
    if (!h) throw new Error(`tutorial: ${cardId} is not in hand on turn ${view.turn}`);
    used.add(h.hid);
    return h.hid;
  };
  const uid = (cardId: string) => {
    const u = view.zones.flatMap((z) => z.units[view.me]).find((x) => x.cardId === cardId);
    if (!u) throw new Error(`tutorial: ${cardId} is not on the board on turn ${view.turn}`);
    return u.uid;
  };
  const actions = plays.map((p): Action => {
    switch (p.t) {
      case 'deploy': return { t: 'deploy', hid: hid(p.card), zone: p.zone };
      case 'gear': return { t: 'gear', hid: hid(p.card), target: { uid: uid(p.on) } };
      case 'tactic': return { t: 'tactic', hid: hid(p.card), zone: p.zone };
      case 'move': return { t: 'move', uid: uid(p.unit), zone: p.zone };
      case 'streak': return { t: 'streak', id: p.id, zone: p.zone };
      case 'resupply': return { t: 'resupply' };
    }
  });
  return { actions };
}

/** Both sides' plans for the state's current turn. */
export function tutorialPlans(g: GameState): [Plan, Plan] {
  const t = TURNS[g.turn];
  if (!t) return [{ actions: [] }, { actions: [] }];
  const mine = t.beats.flatMap((b) => ('play' in b ? [b.play] : []));
  return [scriptPlan(viewFor(g, 0), mine), scriptPlan(viewFor(g, 1), t.cpu)];
}

export class TutorialMatch implements MatchConnection {
  readonly mode = 'cpu' as const;
  readonly planSeconds = null;
  readonly oppName = TUTORIAL_OPP;
  initialView: GameView;
  private state: GameState;
  private handlers: MatchHandlers | null = null;
  private timers: number[] = [];

  constructor(playerName: string) {
    this.state = createTutorialGame(playerName);
    this.initialView = viewFor(this.state, 0);
  }

  setHandlers(h: MatchHandlers) {
    this.handlers = h;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** The script plays both sides; the coach only lets the player reserve the scripted actions anyway. */
  submit() {
    const plans = tutorialPlans(this.state);
    this.later(300, () => {
      this.handlers?.onOpponentReady();
      this.later(350, () => {
        const res = resolveTurn(this.state, plans);
        this.state = res.state;
        this.handlers?.onResolved(res.events, viewFor(this.state, 0));
      });
    });
  }

  uav() {}

  emote(id: EmoteId) {
    this.handlers?.onEmote(true, id);
  }

  surrender() {
    const res = surrender(this.state, 0);
    this.state = res.state;
    this.handlers?.onResolved(res.events, viewFor(this.state, 0));
  }

  rematch() {}

  close() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.handlers = null;
  }
}
