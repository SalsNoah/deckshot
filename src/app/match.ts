import {
  boardAdvantage, createGame, planAI, resolveTurn, surrender, viewFor,
  type Difficulty, type GameEvent, type GameState, type GameView, type Plan,
} from '../engine';
import type { EmoteId } from '../net/protocol';

export interface MatchHandlers {
  onOpponentReady: () => void;
  onResolved: (events: GameEvent[], view: GameView) => void;
  onEmote: (mine: boolean, id: EmoteId) => void;
  onOpponentLeft: () => void;
  onRematch: (view: GameView) => void;
}

export interface MatchConnection {
  readonly mode: 'cpu' | 'online';
  readonly oppName: string;
  readonly planSeconds: number | null;
  initialView: GameView;
  setHandlers(h: MatchHandlers): void;
  submit(plan: Plan): void;
  emote(id: EmoteId): void;
  surrender(): void;
  rematch(): void;
  close(): void;
}

const CPU_NAMES: Record<Difficulty, string> = {
  easy: 'BOT・新兵',
  normal: 'BOT・隊長',
  hard: 'BOT・エース',
};

export class LocalCpuMatch implements MatchConnection {
  readonly mode = 'cpu' as const;
  readonly planSeconds = null;
  readonly oppName: string;
  initialView: GameView;
  private state: GameState;
  private handlers: MatchHandlers | null = null;
  private timers: number[] = [];

  constructor(
    private playerName: string,
    private playerCards: string[],
    private difficulty: Difficulty,
    private cpuDeckId: string,
  ) {
    this.oppName = CPU_NAMES[difficulty];
    this.state = this.newGame();
    this.initialView = viewFor(this.state, 0);
  }

  private newGame(): GameState {
    return createGame({
      players: [
        { name: this.playerName, deckId: 'custom', cards: this.playerCards },
        { name: this.oppName, deckId: this.cpuDeckId },
      ],
    });
  }

  setHandlers(h: MatchHandlers) {
    this.handlers = h;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  submit(plan: Plan) {
    const view = viewFor(this.state, 1);
    this.later(250, () => {
      const cpuPlan = planAI(view, this.difficulty);
      this.handlers?.onOpponentReady();
      this.later(350, () => {
        const res = resolveTurn(this.state, [plan, cpuPlan]);
        this.state = res.state;
        this.handlers?.onResolved(res.events, viewFor(this.state, 0));
        this.maybeEmote(res.events);
      });
    });
  }

  private maybeEmote(events: GameEvent[]) {
    const over = events.find((e) => e.e === 'gameOver');
    let id: EmoteId | null = null;
    if (over) id = 'gg';
    else if (events.some((e) => e.e === 'multikill' && e.p === 1)) id = Math.random() < 0.5 ? 'read' : 'fire';
    else if (events.some((e) => e.e === 'multikill' && e.p === 0)) id = Math.random() < 0.5 ? 'wow' : 'scream';
    else if (events.some((e) => e.e === 'kill' && e.hs && e.byPlayer === 0) && Math.random() < 0.35) id = 'nice';
    else if (this.state.turn === 1 && Math.random() < 0.6) id = 'thanks';
    else if (boardAdvantage(viewFor(this.state, 1)) < -25 && Math.random() < 0.25) id = 'notyet';
    if (!id) return;
    const delay = Math.min(9000, events.length * 260) + 400;
    const emoteId = id;
    this.later(delay, () => this.handlers?.onEmote(false, emoteId));
  }

  emote(id: EmoteId) {
    this.handlers?.onEmote(true, id);
    if (id === 'gg' || id === 'nice') this.later(1400, () => this.handlers?.onEmote(false, id === 'gg' ? 'gg' : 'thanks'));
  }

  surrender() {
    const res = surrender(this.state, 0);
    this.state = res.state;
    this.handlers?.onResolved(res.events, viewFor(this.state, 0));
  }

  rematch() {
    this.state = this.newGame();
    this.handlers?.onRematch(viewFor(this.state, 0));
  }

  close() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.handlers = null;
  }
}
