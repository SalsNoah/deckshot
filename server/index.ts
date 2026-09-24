import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  checkPlan, createGame, DECKS, deckById, resolveTurn, surrender, validateDeck, viewFor,
  type GameEvent, type GameState, type Plan, type PlayerId,
} from '../src/engine';
import { DEFAULT_PORT, EMOTES, PLAN_SECONDS, type ClientMsg, type ServerMsg } from '../src/net/protocol';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const DIST = resolve(process.cwd(), 'dist');
const MAX_MSG = 64 * 1024;
const GRACE_MS = 10_000;

interface Client {
  ws: WebSocket;
  name: string;
  deckId: string;
  cards: string[];
  room: Room | null;
  seat: PlayerId;
}

interface Room {
  code: string;
  seats: [Client | null, Client | null];
  state: GameState | null;
  plans: [Plan | null, Plan | null];
  rematch: [boolean, boolean];
  timer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();
let waiting: Client | null = null;

function send(c: Client | null, msg: ServerMsg) {
  if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function newCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

function newRoom(): Room {
  const room: Room = { code: newCode(), seats: [null, null], state: null, plans: [null, null], rematch: [false, false], timer: null };
  rooms.set(room.code, room);
  return room;
}

function seat(room: Room, c: Client, s: PlayerId) {
  room.seats[s] = c;
  c.room = room;
  c.seat = s;
}

function animationBudget(events: GameEvent[]): number {
  return Math.min(45_000, events.length * 450 + 2_000);
}

function armTimer(room: Room, extraMs: number) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (!room.state || room.state.winner !== null) return;
    room.plans = [room.plans[0] ?? { actions: [] }, room.plans[1] ?? { actions: [] }];
    resolveRoom(room);
  }, extraMs + PLAN_SECONDS * 1000 + GRACE_MS);
}

function startGame(room: Room) {
  const [a, b] = room.seats;
  if (!a || !b) return;
  room.state = createGame({
    players: [
      { name: a.name, deckId: a.deckId, cards: a.cards },
      { name: b.name, deckId: b.deckId, cards: b.cards },
    ],
  });
  room.plans = [null, null];
  room.rematch = [false, false];
  for (const s of [0, 1] as PlayerId[]) {
    const other = room.seats[s === 0 ? 1 : 0]!;
    send(room.seats[s], { t: 'start', view: viewFor(room.state, s), oppName: other.name, planSeconds: PLAN_SECONDS });
  }
  armTimer(room, 0);
  log(`start ${room.code}: ${a.name}(${a.deckId}) vs ${b.name}(${b.deckId})`);
}

function broadcastResult(room: Room, events: GameEvent[]) {
  for (const s of [0, 1] as PlayerId[]) {
    send(room.seats[s], { t: 'resolved', events, view: viewFor(room.state!, s) });
  }
}

function resolveRoom(room: Room) {
  if (!room.state || !room.plans[0] || !room.plans[1]) return;
  const res = resolveTurn(room.state, room.plans as [Plan, Plan]);
  room.state = res.state;
  room.plans = [null, null];
  broadcastResult(room, res.events);
  if (room.state.winner === null) armTimer(room, animationBudget(res.events));
  else if (room.timer) clearTimeout(room.timer);
}

function sanitizePlan(room: Room, s: PlayerId, raw: unknown): Plan {
  const actions = (raw as Plan | undefined)?.actions;
  if (!Array.isArray(actions)) return { actions: [] };
  try {
    return { actions: checkPlan(viewFor(room.state!, s), { actions: actions.slice(0, 40) }).valid };
  } catch {
    return { actions: [] };
  }
}

function leave(c: Client) {
  if (waiting === c) waiting = null;
  const room = c.room;
  if (!room) return;
  c.room = null;
  const other = room.seats[c.seat === 0 ? 1 : 0];
  room.seats[c.seat] = null;
  if (room.state && room.state.winner === null && other) {
    const res = surrender(room.state, c.seat, 'disconnect');
    room.state = res.state;
    send(other, { t: 'resolved', events: res.events, view: viewFor(room.state, other.seat) });
  }
  if (other) send(other, { t: 'oppLeft' });
  if (room.timer) clearTimeout(room.timer);
  if (!room.seats[0] && !room.seats[1]) rooms.delete(room.code);
  else if (other) {
    other.room = null;
    rooms.delete(room.code);
  }
}

function onMessage(c: Client, msg: ClientMsg) {
  const room = c.room;
  switch (msg.t) {
    case 'hello': {
      c.name = String(msg.name ?? '').trim().slice(0, 12) || 'Player';
      const presetOk = DECKS.some((d) => d.id === msg.deckId);
      const cards = Array.isArray(msg.cards) ? msg.cards.map(String).slice(0, 40) : null;
      if (cards && validateDeck(cards).ok) {
        c.deckId = 'custom';
        c.cards = cards;
      } else if (presetOk) {
        c.deckId = msg.deckId;
        c.cards = [...deckById(msg.deckId).cards];
      } else {
        c.deckId = DECKS[0].id;
        c.cards = [...DECKS[0].cards];
      }
      break;
    }
    case 'quick': {
      if (room) return;
      if (waiting && waiting !== c && waiting.ws.readyState === WebSocket.OPEN) {
        const r = newRoom();
        seat(r, waiting, 0);
        seat(r, c, 1);
        waiting = null;
        startGame(r);
      } else {
        waiting = c;
        send(c, { t: 'queued' });
      }
      break;
    }
    case 'create': {
      if (room) return;
      const r = newRoom();
      seat(r, c, 0);
      send(c, { t: 'room', code: r.code });
      break;
    }
    case 'join': {
      if (room) return;
      const r = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!r || r.state || r.seats[1] || !r.seats[0]) {
        send(c, { t: 'error', message: '繝ｫ繝ｼ繝縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ' });
        return;
      }
      seat(r, c, 1);
      startGame(r);
      break;
    }
    case 'cancel':
      if (waiting === c) waiting = null;
      if (room && !room.state) {
        rooms.delete(room.code);
        c.room = null;
      }
      break;
    case 'plan': {
      if (!room?.state || room.state.winner !== null) return;
      if (msg.turn !== room.state.turn || room.plans[c.seat]) return;
      room.plans[c.seat] = sanitizePlan(room, c.seat, msg.plan);
      send(room.seats[c.seat === 0 ? 1 : 0], { t: 'oppReady' });
      if (room.plans[0] && room.plans[1]) resolveRoom(room);
      break;
    }
    case 'emote': {
      if (!room || !EMOTES.some((e) => e.id === msg.id)) return;
      send(c, { t: 'emote', mine: true, id: msg.id });
      send(room.seats[c.seat === 0 ? 1 : 0], { t: 'emote', mine: false, id: msg.id });
      break;
    }
    case 'surrender': {
      if (!room?.state || room.state.winner !== null) return;
      const res = surrender(room.state, c.seat);
      room.state = res.state;
      if (room.timer) clearTimeout(room.timer);
      broadcastResult(room, res.events);
      break;
    }
    case 'rematch': {
      if (!room?.state || room.state.winner === null) return;
      room.rematch[c.seat] = true;
      if (room.rematch[0] && room.rematch[1]) startGame(room);
      else send(room.seats[c.seat === 0 ? 1 : 0], { t: 'rematchOffer' });
      break;
    }
  }
}

function log(s: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
};

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('DECKSHOT game server is running. (Run `npm run build` to serve the client from here.)');
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });

wss.on('connection', (ws) => {
  const c: Client = { ws, name: 'Player', deckId: DECKS[0].id, cards: [...DECKS[0].cards], room: null, seat: 0 };
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      onMessage(c, msg);
    } catch (e) {
      log(`error handling ${msg.t}: ${(e as Error).message}`);
    }
  });
  ws.on('close', () => leave(c));
});

http.listen(PORT, () => log(`DECKSHOT server listening on :${PORT}`));
