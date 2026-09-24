import type { GameEvent, GameView, Plan } from '../engine';

export const EMOTES = [
  { id: 'nice', text: 'ナイス！' },
  { id: 'gg', text: 'GG' },
  { id: 'read', text: '読み通り' },
  { id: 'wow', text: 'マジか…' },
  { id: 'notyet', text: 'まだまだ！' },
  { id: 'thanks', text: 'よろしく！' },
  { id: 'scream', text: '😱' },
  { id: 'fire', text: '🔥' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

export type ClientMsg =
  | { t: 'hello'; name: string; deckId: string; cards?: string[] }
  | { t: 'quick' }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'cancel' }
  | { t: 'plan'; turn: number; plan: Plan }
  | { t: 'uav'; turn: number }
  | { t: 'emote'; id: EmoteId }
  | { t: 'surrender' }
  | { t: 'rematch' };

export type ServerMsg =
  | { t: 'queued' }
  | { t: 'room'; code: string }
  | { t: 'start'; view: GameView; oppName: string; planSeconds: number }
  | { t: 'oppReady' }
  | { t: 'resolved'; events: GameEvent[]; view: GameView }
  | { t: 'view'; view: GameView }
  | { t: 'emote'; mine: boolean; id: EmoteId }
  | { t: 'oppLeft' }
  | { t: 'rematchOffer' }
  | { t: 'error'; message: string };

export const PLAN_SECONDS = 60;
export const DEFAULT_PORT = 8787;
