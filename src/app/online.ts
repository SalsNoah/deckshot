import type { GameEvent, GameView, Plan } from '../engine';
import { DEFAULT_PORT, type ClientMsg, type EmoteId, type ServerMsg } from '../net/protocol';
import type { MatchConnection, MatchHandlers } from './match';

export function defaultServerUrl(): string {
  const env = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (env) return env.replace(/\/$/, '');

  const { protocol, hostname, port } = window.location;
  const ws = protocol === 'https:' ? 'wss' : 'ws';
  const host = hostname || 'localhost';

  // Local Vite / preview → dedicated game server on 8787
  const vitePorts = new Set(['5173', '5174', '5175', '4173', '4174']);
  if (vitePorts.has(port) || host === 'localhost' || host === '127.0.0.1') {
    return `${ws}://${host}:${DEFAULT_PORT}`;
  }

  // Production (Render etc.): same origin as the page
  return `${ws}://${host}${port ? `:${port}` : ''}`;
}

export type LobbyStatus =
  | { s: 'connecting' }
  | { s: 'idle' }
  | { s: 'queued' }
  | { s: 'room'; code: string }
  | { s: 'error'; message: string }
  | { s: 'closed' };

export class OnlineClient {
  private ws: WebSocket;
  private match: OnlineMatch | null = null;

  constructor(
    url: string,
    private name: string,
    private deck: string[],
    private onStatus: (s: LobbyStatus) => void,
    private onStart: (m: OnlineMatch) => void,
  ) {
    this.onStatus({ s: 'connecting' });
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.send({ t: 'hello', name: this.name, deckId: 'custom', cards: this.deck });
      this.onStatus({ s: 'idle' });
    };
    this.ws.onerror = () => this.onStatus({ s: 'error', message: 'サーバーに接続できません' });
    this.ws.onclose = () => {
      if (this.match) this.match.handle({ t: 'oppLeft' });
      else this.onStatus({ s: 'closed' });
    };
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.handle(msg);
    };
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'queued':
        this.onStatus({ s: 'queued' });
        break;
      case 'room':
        this.onStatus({ s: 'room', code: msg.code });
        break;
      case 'error':
        this.onStatus({ s: 'error', message: msg.message });
        break;
      case 'start':
        if (this.match) this.match.handle(msg);
        else {
          this.match = new OnlineMatch(this, msg.view, msg.oppName, msg.planSeconds);
          this.onStart(this.match);
        }
        break;
      default:
        this.match?.handle(msg);
    }
  }

  send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  quick() { this.send({ t: 'quick' }); }
  create() { this.send({ t: 'create' }); }
  join(code: string) { this.send({ t: 'join', code: code.trim().toUpperCase() }); }
  cancel() {
    this.send({ t: 'cancel' });
    this.onStatus({ s: 'idle' });
  }

  close() {
    this.match = null;
    this.ws.onclose = null;
    this.ws.close();
  }
}

export class OnlineMatch implements MatchConnection {
  readonly mode = 'online' as const;
  private handlers: MatchHandlers | null = null;
  private buffer: ServerMsg[] = [];
  private turn: number;

  constructor(
    private client: OnlineClient,
    public initialView: GameView,
    readonly oppName: string,
    readonly planSeconds: number,
  ) {
    this.turn = initialView.turn;
  }

  setHandlers(h: MatchHandlers) {
    this.handlers = h;
    const pending = this.buffer;
    this.buffer = [];
    pending.forEach((m) => this.handle(m));
  }

  handle(msg: ServerMsg) {
    const h = this.handlers;
    if (!h) {
      this.buffer.push(msg);
      return;
    }
    switch (msg.t) {
      case 'oppReady':
        h.onOpponentReady();
        break;
      case 'resolved':
        this.turn = msg.view.turn;
        h.onResolved(msg.events as GameEvent[], msg.view);
        break;
      case 'view':
        h.onView(msg.view);
        break;
      case 'emote':
        h.onEmote(msg.mine, msg.id);
        break;
      case 'oppLeft':
        h.onOpponentLeft();
        break;
      case 'start':
        this.turn = msg.view.turn;
        h.onRematch(msg.view);
        break;
      default:
        break;
    }
  }

  submit(plan: Plan) {
    this.client.send({ t: 'plan', turn: this.turn, plan });
  }

  uav() {
    this.client.send({ t: 'uav', turn: this.turn });
  }

  emote(id: EmoteId) {
    this.client.send({ t: 'emote', id });
  }

  surrender() {
    this.client.send({ t: 'surrender' });
  }

  rematch() {
    this.client.send({ t: 'rematch' });
  }

  close() {
    this.handlers = null;
    this.client.close();
  }
}
