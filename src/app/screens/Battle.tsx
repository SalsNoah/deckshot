import { Bomb, ChevronRight, CircleHelp, Coins, Crosshair, Flag, Flame, Home, MessageCircle, Radiation, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  baseIncome, card, checkPlan, comebackBonus, deckById, legalTargets, NUKE_BLOCK_ZONES, RESUPPLY_COST, STREAK_ORDER, STREAKS,
  tryAdd, unitSnap, zoneValue, ZONE_LABELS, ZONE_MODS, ZONES,
  type Action, type BoardSnap, type DamageSource, type GameEvent, type GameView, type Plan, type PlayerId, type PublicPlay,
  type StreakId, type UnitRef, type UnitSnap, type Winner, type WinReason, type ZoneId,
} from '../../engine';
import { EMOTES, type EmoteId } from '../../net/protocol';
import type { MatchConnection } from '../match';
import { hasFlow, hasKira, hasSign } from '../profile';
import { setBgm, sfx, vibrate, type ShotKind } from '../sfx';
import {
  CalloutView, CutInView, FxView, HS_COLOR, REVEAL_FLIP_AT, REVEAL_FLIP_GAP, RevealStage, revealItems,
  type Callout, type CalloutVariant, type CutIn, type Fx, type FxInput, type PopTone, type RevealState, type ZoneEffect,
} from '../ui/battleFx';
import { CardDetail, CardStrip, HandCard, preloadCardArt, UnitTile } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { CardIcon, StreakIcon, WeaponIcon } from '../ui/icons';
import { REASON_TEXT, TARGET_HINT } from '../ui/text';
import { zoneVisual } from '../ui/zoneArt';
import { HowToContent } from './HowTo';

type Selection = { kind: 'hand'; hid: string } | { kind: 'streak'; id: StreakId };
type Phase = 'plan' | 'waiting' | 'anim' | 'over';

interface FeedItem {
  id: number;
  killer?: string;
  killerMine: boolean;
  victim: string;
  victimMine: boolean;
  hs: boolean;
  weapon?: string;
  source: string;
}

export interface MatchResult {
  winner: Winner;
  reason: WinReason;
  me: PlayerId;
  view: GameView;
  kills: number;
  headshots: number;
  nuked: boolean;
}

const ME_COLOR = '#19f0ff';
const OPP_COLOR = '#ff2d55';
/** Streak rail position (0–1): each streak owns an equal segment that SP fills toward its cost. */
function railPos(sp: number): number {
  const costs = STREAK_ORDER.map((id) => STREAKS[id].cost);
  let prev = 0;
  for (let i = 0; i < costs.length; i++) {
    if (sp <= costs[i]) return (i + (sp - prev) / (costs[i] - prev)) / costs.length;
    prev = costs[i];
  }
  return 1;
}

/** Rank units by AIM (ties share a tier): 1 fires first. */
function aimTiers(units: UnitSnap[]): Map<number, number> {
  const aims = [...new Set(units.map((u) => u.aim))].sort((a, b) => b - a);
  return new Map(aims.map((a, i) => [a, i + 1]));
}

const DAMAGE_COLOR: Record<DamageSource, string> = {
  tactic: '#ff5a5a', fire: '#ff9a3c', trap: '#7cc8ff', c4: '#ffb547', toxic: '#5dff9a', splash: '#ff7a5a', streak: '#ffb547', deploy: '#ff5a5a',
};

const REDUCED_MOTION = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let fxSeq = 1;

function snapFromView(v: GameView): BoardSnap {
  return {
    turn: v.turn,
    zones: v.zones.map((z) => ({
      id: z.id,
      modId: z.modId,
      units: [z.units[0].map((u) => unitSnap(v, u)), z.units[1].map((u) => unitSnap(v, u))],
      smoked: z.smoked,
      fire: [
        z.fires.filter((f) => f.owner === 0).reduce((s, f) => s + f.dmg, 0),
        z.fires.filter((f) => f.owner === 1).reduce((s, f) => s + f.dmg, 0),
      ],
      c4: z.c4,
      controller: z.controller,
    })),
    players: [0, 1].map((p) => {
      const pl = p === v.me ? v.self : v.opp;
      const handCount = p === v.me ? v.self.hand.length : v.opp.handCount;
      return { score: pl.score, credits: pl.credits, sp: pl.sp, kills: pl.kills, handCount };
    }) as BoardSnap['players'],
  };
}

function ghostUnit(cardId: string, uid: string, owner: PlayerId, zone: ZoneId): UnitSnap {
  const d = card(cardId);
  return {
    uid, cardId, owner, zone, atk: d.atk ?? 0, hp: d.hp ?? 1, maxHp: d.hp ?? 1, aim: d.aim ?? 0,
    flashed: false, stealth: false, fresh: true, kills: 0,
  };
}

function shotKind(weapon?: string): ShotKind {
  if (!weapon) return 'pistol';
  const w = card(weapon).weaponClass;
  return w && w !== 'armor' ? w : 'pistol';
}

function refKey(r: UnitRef): string {
  return 'uid' in r ? r.uid : `hid:${r.hid}`;
}

function findSnapUnit(snap: BoardSnap | null | undefined, uid: string): UnitSnap | undefined {
  if (!snap) return undefined;
  for (const z of snap.zones) for (const side of z.units) for (const u of side) if (u.uid === uid) return u;
  return undefined;
}

function playRarity(p: PublicPlay): 'common' | 'rare' | 'epic' | 'legend' {
  if (p.t === 'streak') return 'epic';
  if (p.t === 'deploy' || p.t === 'gear' || p.t === 'tactic') return card(p.cardId).rarity;
  return 'common';
}

function describeAction(view: GameView, a: Action): { icon: string; label: string } {
  const hand = view.self.hand;
  const unitName = (r: UnitRef) => {
    if ('hid' in r) {
      const h = hand.find((x) => x.hid === r.hid);
      return h ? card(h.cardId).en : '?';
    }
    for (const z of view.zones) for (const s of z.units) for (const u of s) if (u.uid === r.uid) return card(u.cardId).en;
    return '?';
  };
  switch (a.t) {
    case 'deploy': {
      const c = card(hand.find((h) => h.hid === a.hid)!.cardId);
      return { icon: c.id, label: `${c.en}→${ZONE_LABELS[a.zone]}` };
    }
    case 'gear': {
      const c = card(hand.find((h) => h.hid === a.hid)!.cardId);
      return { icon: c.id, label: `${c.en}→${unitName(a.target)}` };
    }
    case 'tactic': {
      const c = card(hand.find((h) => h.hid === a.hid)!.cardId);
      const tgt = a.zone !== undefined ? ZONE_LABELS[a.zone] : a.target ? unitName(a.target) : '';
      return { icon: c.id, label: tgt ? `${c.en}→${tgt}` : c.en };
    }
    case 'move':
      return { icon: '', label: `${unitName({ uid: a.uid })}⇢${ZONE_LABELS[a.zone]}` };
    case 'streak':
      return { icon: '', label: `${STREAKS[a.id].en}${a.zone !== undefined ? `→${ZONE_LABELS[a.zone]}` : ''}` };
    case 'resupply':
      return { icon: '', label: `補給（${RESUPPLY_COST}¢）` };
  }
}

export function Battle({ conn, onExit, onFinish, kiraOwned, signOwned, flowOwned }: {
  conn: MatchConnection;
  onExit: () => void;
  onFinish: (r: MatchResult) => number | null;
  /** Player's owned kira operators — cosmetic on hand / detail. */
  kiraOwned?: Record<string, number>;
  /** Player's owned signed operators — neon signature overlay. */
  signOwned?: Record<string, number>;
  /** Player's owned motion-anim operators — portrait GIF swap. */
  flowOwned?: Record<string, number>;
}) {
  const me = conn.initialView.me;
  const opp: PlayerId = me === 0 ? 1 : 0;
  const [view, setView] = useState<GameView>(conn.initialView);
  const [plan, setPlan] = useState<Plan>({ actions: [] });
  const [sel, setSel] = useState<Selection | null>(null);
  const [phase, setPhase] = useState<Phase>('plan');
  const [oppReady, setOppReady] = useState(false);
  const [animSnap, setAnimSnap] = useState<BoardSnap | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [cutin, setCutin] = useState<CutIn | null>(null);
  const [combat, setCombat] = useState(false);
  const [aimTier, setAimTier] = useState<{ key: number; aim: number } | null>(null);
  const [detail, setDetail] = useState<{ cardId: string; unit?: UnitSnap; movable?: boolean } | null>(null);
  const [emotes, setEmotes] = useState<{ key: number; mine: boolean; id: EmoteId }[]>([]);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(conn.planSeconds);
  const [result, setResult] = useState<(MatchResult & { rp: number | null }) | null>(null);
  const [oppLeft, setOppLeft] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const passHoldRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const speedRef = useRef(1);
  const aliveRef = useRef(true);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const planRef = useRef(plan);
  planRef.current = plan;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const statsRef = useRef({ nuked: false });
  const pendingViewRef = useRef<GameView | null>(null);
  /** Real-time deadline the next beat waits for, so a banner isn't trampled by the next volley. */
  const holdRef = useRef(0);

  const planCheck = useMemo(() => checkPlan(view, plan), [view, plan]);
  const board = animSnap ?? snapFromView(view);
  const uavOn = view.self.uavTurn === view.turn;
  const nukeLanding = view.self.nukeTurn === view.turn ? me : view.opp.nukeTurn === view.turn ? opp : null;

  // ---------- helpers ----------
  /** True while SKIP is fast-forwarding: cinematic extras are dropped. */
  const fast = () => speedRef.current < 0.5;

  /** Playback-time sleep. Re-reads the speed while waiting so SKIP takes effect immediately. */
  const wait = (ms: number) => new Promise<void>((resolve) => {
    let left = ms;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      left -= (now - last) / speedRef.current;
      last = now;
      if (left <= 0 || !aliveRef.current) resolve();
      else setTimeout(step, Math.min(40, left * speedRef.current));
    };
    setTimeout(step, Math.min(40, ms * speedRef.current));
  });

  const later = (ms: number, fn: () => void) => {
    setTimeout(() => { if (aliveRef.current && !fast()) fn(); }, ms);
  };

  const hold = (ms: number) => {
    holdRef.current = Math.max(holdRef.current, performance.now() + ms * speedRef.current);
  };

  const settle = async () => {
    while (aliveRef.current && !fast() && performance.now() < holdRef.current) {
      await new Promise((r) => setTimeout(r, 30));
    }
    holdRef.current = 0;
  };

  const showToast = useCallback((text: string) => setToast({ key: Date.now(), text }), []);

  const addFx = useCallback((f: FxInput, life = 900) => {
    const id = fxSeq++;
    setFx((list) => [...list, { ...f, id } as Fx]);
    setTimeout(() => aliveRef.current && setFx((list) => list.filter((x) => x.id !== id)), life);
  }, []);

  const center = (el: Element | null | undefined) => {
    const root = rootRef.current?.getBoundingClientRect();
    if (!el || !root) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - root.left + r.width / 2, y: r.top - root.top + r.height / 2, w: r.width, h: r.height, left: r.left - root.left, top: r.top - root.top };
  };

  const unitPos = (uid: string) => center(tileRefs.current.get(uid));

  const zoneFx = (zone: ZoneId, effect: ZoneEffect, opts: { color?: string; label?: string; from?: 'top' | 'bottom' } = {}, life = 1000) => {
    const c = center(zoneRefs.current[zone]);
    if (c) addFx({ kind: 'zone', x: c.left, y: c.top, w: c.w, h: c.h, effect, ...opts }, life);
  };

  const pop = (uid: string, text: string, color: string, tone: PopTone = 'dmg') => {
    const c = unitPos(uid);
    if (c) addFx({ kind: 'pop', x: c.x, y: c.y - 4, text, color, tone }, tone === 'hs' ? 1150 : 1000);
  };

  const shout = (
    text: string, color: string, size: Callout['size'] = 'lg', sub?: string, life = 1200,
    variant: CalloutVariant = 'default', count?: number,
  ) => {
    const key = fxSeq++;
    const ms = Math.round(life * Math.max(0.35, speedRef.current));
    setCallout({ key, text, color, size, sub, variant, life: ms, count });
    setTimeout(() => aliveRef.current && setCallout((c) => (c?.key === key ? null : c)), ms);
  };

  const showCutin = (c: Omit<CutIn, 'key'>, life = 1050) => {
    const key = fxSeq++;
    setCutin({ ...c, key });
    setTimeout(() => aliveRef.current && setCutin((cur) => (cur?.key === key ? null : cur)), life);
  };

  const sideColor = (p: PlayerId) => (p === me ? ME_COLOR : OPP_COLOR);

  const shake = (level: 's' | 'm' | 'l') => {
    const el = rootRef.current;
    if (!el || REDUCED_MOTION || fast()) return;
    const a = level === 'l' ? 7 : level === 'm' ? 4.5 : 2.5;
    el.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-a}px, ${a * 0.6}px)` },
        { transform: `translate(${a * 0.8}px, ${-a * 0.5}px)` },
        { transform: `translate(${-a * 0.5}px, ${-a * 0.3}px)` },
        { transform: `translate(${a * 0.3}px, ${a * 0.2}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: level === 'l' ? 520 : level === 'm' ? 380 : 260, easing: 'ease-out' },
    );
  };

  const animTile = (uid: string, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    if (fast()) return;
    tileRefs.current.get(uid)?.animate(frames, opts);
  };

  /** Shooter lunges toward the target and kicks back. */
  const recoil = (uid: string, ux: number, uy: number, color: string) => animTile(uid, [
    { transform: 'translate(0, 0)', boxShadow: `0 0 0 1px ${color}, 0 0 16px ${color}` },
    { transform: `translate(${ux * 5}px, ${uy * 5}px)`, offset: 0.25 },
    { transform: `translate(${-ux * 2}px, ${-uy * 2}px)`, offset: 0.55 },
    { transform: 'translate(0, 0)', boxShadow: '0 3px 10px rgba(0, 0, 0, 0.55)' },
  ], { duration: 260, easing: 'ease-out' });

  const hitReact = (uid: string, strong: boolean) => {
    const a = strong ? 4 : 2.5;
    // Strong hits hold the white flash (~70ms of 380ms) before the shake: a tile-level hit-stop.
    const hold: Keyframe[] = strong ? [{ transform: 'translate(0, 0)', filter: 'brightness(2.4) saturate(0.4)', offset: 0.18 }] : [];
    const o = strong ? 0.18 : 0;
    const at = (t: number) => o + (1 - o) * t;
    animTile(uid, [
      { transform: 'translate(0, 0)', filter: 'brightness(2.4) saturate(0.4)' },
      ...hold,
      { transform: `translate(${-a}px, 1px)`, filter: 'brightness(1.5) saturate(0.8)', offset: at(0.2) },
      { transform: `translate(${a}px, -1px)`, offset: at(0.45) },
      { transform: `translate(${-a * 0.4}px, 0)`, offset: at(0.7) },
      { transform: 'translate(0, 0)', filter: 'brightness(1) saturate(1)' },
    ], { duration: strong ? 380 : 300, easing: 'ease-out' });
  };

  const glowTile = (uid: string, color: string) => animTile(uid, [
    { boxShadow: `0 0 0 2px ${color}, 0 0 18px ${color}`, filter: 'brightness(1.45)' },
    { boxShadow: '0 3px 10px rgba(0, 0, 0, 0.55)', filter: 'brightness(1)' },
  ], { duration: 650, easing: 'ease-out' });

  const land = (uid: string, color: string) => {
    const b = unitPos(uid);
    if (b && !fast()) addFx({ kind: 'land', x: b.left, y: b.top, w: b.w, h: b.h, color }, 700);
  };

  /** Precision-shot tracer from the caster's side of the screen. */
  const snipeLine = (p: PlayerId, uid: string) => {
    const b = unitPos(uid);
    const root = rootRef.current?.getBoundingClientRect();
    if (!b || !root) return;
    const ax = root.width / 2;
    const ay = p === me ? root.height + 10 : -10;
    const dx = b.x - ax;
    const dy = b.y - ay;
    addFx({ kind: 'tracer', x: ax, y: ay, len: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI, color: sideColor(p) }, 420);
    addFx({ kind: 'impact', x: b.x, y: b.y, color: sideColor(p), big: true }, 500);
  };

  /** Send the revealed cards flying to the zones they target. */
  const flyRevealCards = () => {
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    root.querySelectorAll<HTMLElement>('.rv-card').forEach((el, k) => {
      const r = el.getBoundingClientRect();
      const mineCard = !!el.closest('.rv-me');
      const z = el.dataset.zone ? Number(el.dataset.zone) : null;
      const zr = z !== null ? zoneRefs.current[z]?.getBoundingClientRect() : undefined;
      const tx = zr ? zr.left + zr.width / 2 : rr.left + rr.width / 2;
      const ty = zr ? zr.top + zr.height * (mineCard ? 0.72 : 0.3) : mineCard ? rr.bottom : rr.top;
      const dx = tx - (r.left + r.width / 2);
      const dy = ty - (r.top + r.height / 2);
      el.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.08}px, ${dy * 0.08 - 10}px) scale(1.08)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0 },
        ],
        { duration: 420, delay: k * 25, easing: 'cubic-bezier(0.55, 0, 0.75, 0.25)', fill: 'forwards' },
      );
    });
  };

  // ---------- playback ----------
  const play = useCallback(async (events: GameEvent[], finalView: GameView) => {
    setPhase('anim');
    setSel(null);
    setDetail(null);
    speedRef.current = 1;
    holdRef.current = 0;
    const lastShot = events.reduce((acc, e, k) => (e.e === 'shot' ? k : acc), -1);
    let inCombat = false;
    let prev: BoardSnap | null = null;
    for (let i = 0; i < events.length; i++) {
      if (!aliveRef.current) return;
      const ev = events[i];
      // Kills / splash / on-kill buffs belong to the volley that caused them and play without a pause.
      const aftermath = ev.e === 'kill' || ev.e === 'buff' || ev.e === 'heal' || (ev.e === 'damage' && ev.source === 'splash');
      if (!aftermath) await settle();
      if (inCombat && i > lastShot && !aftermath) {
        inCombat = false;
        setCombat(false);
        setAimTier(null);
      }
      switch (ev.e) {
        case 'reveal': {
          setAnimSnap(ev.snap);
          const enemy = ev.plays[opp];
          const mine = ev.plays[me];
          if (fast() || (enemy.length === 0 && mine.length === 0)) {
            sfx.callout();
            shout('REVEAL', '#fff', 'md', enemy.length ? `相手は${enemy.length}アクション` : '相手は動かなかった', 900);
            await wait(enemy.length ? 700 : 650);
            break;
          }
          const all = [...ev.plays[0], ...ev.plays[1]];
          sfx.reveal();
          setReveal({ key: fxSeq++, enemy: revealItems(enemy, all, ev.snap), mine: revealItems(mine, all, ev.snap), leaving: false });
          enemy.forEach((p, k) => later(REVEAL_FLIP_AT + k * REVEAL_FLIP_GAP + 140, () => sfx.cardFlip(playRarity(p))));
          await wait(REVEAL_FLIP_AT + enemy.length * REVEAL_FLIP_GAP + (enemy.length ? 1000 : 650));
          if (!fast()) {
            flyRevealCards();
            setReveal((r) => (r ? { ...r, leaving: true } : r));
            sfx.whoosh();
            await wait(440);
          }
          setReveal(null);
          break;
        }
        case 'move': {
          const from = unitPos(ev.uid);
          flushSync(() => setAnimSnap(ev.snap));
          const to = unitPos(ev.uid);
          if (from && to && !fast()) {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            addFx({ kind: 'trail', x: from.x, y: from.y, len: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI, color: sideColor(ev.p) }, 520);
            land(ev.uid, sideColor(ev.p));
          }
          sfx.select();
          await wait(340);
          break;
        }
        case 'deploy':
          flushSync(() => setAnimSnap(ev.snap));
          land(ev.uid, sideColor(ev.p));
          sfx.deploy();
          await wait(ev.p === me ? 200 : 320);
          break;
        case 'equip':
          setAnimSnap(ev.snap);
          sfx.place();
          await wait(40);
          pop(ev.uid, `+${card(ev.cardId).en}`, '#cfe3ff', 'info');
          glowTile(ev.uid, '#cfe3ff');
          await wait(280);
          break;
        case 'tactic': {
          setAnimSnap(ev.snap);
          const def = card(ev.cardId);
          const tu = ev.uid ? findSnapUnit(ev.snap, ev.uid) : undefined;
          const tgt = ev.zone !== undefined ? ZONE_LABELS[ev.zone] : tu ? card(tu.cardId).en : '';
          if (fast()) {
            shout(def.en + (tgt ? ` → ${tgt}` : ''), sideColor(ev.p), 'md', ev.fizzle ? '不発…' : def.name, 700);
          } else {
            showCutin({
              side: ev.p === me ? 'me' : 'opp', color: sideColor(ev.p), label: ev.p === me ? 'YOUR TACTIC' : 'ENEMY TACTIC',
              title: def.en, sub: tgt ? `${def.name} → ${tgt}` : def.name, cardId: def.id, fizzle: ev.fizzle,
            });
            sfx.cutin();
            await wait(ev.fizzle ? 700 : 520);
          }
          if (ev.fizzle) {
            sfx.deny();
            await wait(250);
            break;
          }
          if (ev.cardId === 'frag') {
            sfx.explosion();
            if (ev.zone !== undefined) zoneFx(ev.zone, 'explosion', {}, 950);
            shake('s');
            await wait(560);
          } else if (ev.cardId === 'precision' && ev.uid) {
            const b = unitPos(ev.uid);
            if (b && !fast()) {
              addFx({ kind: 'reticle', x: b.left, y: b.top, w: b.w, h: b.h }, 620);
              sfx.lockOn();
              await wait(360);
            }
            snipeLine(ev.p, ev.uid);
            sfx.shot('sr');
            await wait(260);
          } else {
            sfx.select();
            await wait(300);
          }
          break;
        }
        case 'streak': {
          setAnimSnap(ev.snap);
          if (ev.id === 'airstrike') {
            const where = ZONE_LABELS[ev.zone ?? 0];
            if (fast()) shout('AIRSTRIKE', sideColor(ev.p), 'lg', `空爆 → ${where}`, 900);
            else {
              showCutin({
                side: ev.p === me ? 'me' : 'opp', color: sideColor(ev.p), label: 'KILLSTREAK',
                title: 'AIRSTRIKE', sub: `空爆 → ${where}`, streak: 'airstrike',
              }, 1200);
            }
            sfx.siren();
            await wait(800);
            if (ev.zone !== undefined) zoneFx(ev.zone, 'airstrike', {}, 1300);
            sfx.explosion(true);
            shake('l');
            vibrate([60, 40, 120]);
          }
          await wait(800);
          break;
        }
        case 'nukeArmed':
          setAnimSnap(ev.snap);
          sfx.siren();
          vibrate([120, 60, 120]);
          shout(
            'NUKE INCOMING', sideColor(ev.p), 'xl',
            ev.p === me ? `次のターン終了時に着弾。敵の確保を${NUKE_BLOCK_ZONES - 1}ゾーン以下に抑えろ` : `次のターン終了時に着弾。${NUKE_BLOCK_ZONES}ゾーン確保で阻止！`,
            2200, 'alert',
          );
          await wait(1800);
          break;
        case 'nukeFizzle':
          setAnimSnap(ev.snap);
          sfx.defuse();
          shout('NUKE STOPPED', sideColor(ev.p === me ? opp : me), 'xl', ev.p === me ? '戦術核を阻止された…' : '戦術核を阻止した！', 1800);
          await wait(1500);
          break;
        case 'nuke':
          setAnimSnap(ev.snap);
          sfx.siren();
          shout('TACTICAL NUKE', sideColor(ev.p), 'xl', ev.p === me ? '戦術核、着弾' : '阻止できなかった…', 2600, 'alert');
          await wait(1800);
          addFx({ kind: 'screen', effect: 'nuke' }, 2200);
          sfx.explosion(true);
          shake('l');
          vibrate([200, 80, 400]);
          if (ev.p === me) statsRef.current.nuked = true;
          await wait(1600);
          break;
        case 'flash':
          setAnimSnap(ev.snap);
          sfx.flash();
          if (ev.zone !== undefined) zoneFx(ev.zone, 'flash', {}, 750);
          await wait(440);
          break;
        case 'smoke':
          setAnimSnap(ev.snap);
          sfx.smoke();
          zoneFx(ev.zone, 'smoke', {}, 1000);
          await wait(460);
          break;
        case 'fire':
          setAnimSnap(ev.snap);
          sfx.fire();
          zoneFx(ev.zone, 'fire', {}, 900);
          await wait(380);
          break;
        case 'damage': {
          const group = [ev];
          while (events[i + 1]?.e === 'damage') group.push(events[++i] as typeof ev);
          for (const d of group) {
            const color = DAMAGE_COLOR[d.source];
            const b = unitPos(d.uid);
            if (b && !fast()) addFx({ kind: 'impact', x: b.x, y: b.y, color, big: d.amount >= 3 }, 480);
            pop(d.uid, `-${d.amount}`, color, 'dmg');
            hitReact(d.uid, d.amount >= 3);
          }
          sfx.hit();
          setAnimSnap(group[group.length - 1].snap);
          await wait(420);
          break;
        }
        case 'heal':
          setAnimSnap(ev.snap);
          pop(ev.uid, `+${ev.amount}`, '#46d98a', 'heal');
          glowTile(ev.uid, '#46d98a');
          await wait(260);
          break;
        case 'buff':
          setAnimSnap(ev.snap);
          ev.uids.forEach((u) => {
            pop(u, ev.label, '#ffe28a', 'buff');
            glowTile(u, HS_COLOR);
          });
          await wait(360);
          break;
        case 'combatStart':
          setAnimSnap(ev.snap);
          inCombat = true;
          setCombat(true);
          if (fast()) {
            await wait(200);
            break;
          }
          sfx.engage();
          addFx({ kind: 'screen', effect: 'engage' }, 950);
          shout('ENGAGE', '#fff', 'lg', 'AIMの高い順に射撃', 1050, 'engage');
          await wait(1000);
          break;
        case 'shot': {
          const group = [ev];
          while (events[i + 1]?.e === 'shot' && (events[i + 1] as typeof ev).tier === ev.tier) group.push(events[++i] as typeof ev);
          const quick = fast();
          const lead = findSnapUnit(prev, ev.from) ?? findSnapUnit(ev.snap, ev.from);
          if (lead) setAimTier({ key: fxSeq++, aim: lead.aim });
          const hsShots = group.filter((s) => s.hs);
          // Headshot: scope locks onto the target before the trigger is pulled.
          if (hsShots.length && !quick) {
            for (const s of hsShots) {
              const b = unitPos(s.to);
              if (!b) continue;
              addFx({ kind: 'spot', x: b.x, y: b.y }, 1000);
              addFx({ kind: 'reticle', x: b.left, y: b.top, w: b.w, h: b.h }, 760);
            }
            sfx.lockOn();
            await wait(480);
          }
          for (const s of group) {
            const a = unitPos(s.from);
            const b = unitPos(s.to);
            const color = s.hs ? HS_COLOR : sideColor(s.p);
            if (a && b) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.max(1, Math.hypot(dx, dy));
              const ux = dx / len;
              const uy = dy / len;
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              const off = Math.min(a.h / 2, 22);
              const x0 = a.x + ux * off;
              const y0 = a.y + uy * off;
              if (!quick) addFx({ kind: 'muzzle', x: x0, y: y0, angle, color }, 200);
              addFx({ kind: 'tracer', x: x0, y: y0, len: Math.max(8, len - off - Math.min(b.h / 2, 18)), angle, color, hs: s.hs }, 420);
              recoil(s.from, ux, uy, color);
            }
            if (s.extra) pop(s.from, 'CHAIN', HS_COLOR, 'buff');
            const shooter = findSnapUnit(s.snap, s.from) ?? findSnapUnit(prev, s.from);
            sfx.shot(shotKind(shooter?.weapon));
          }
          await wait(quick ? 30 : 100);
          for (const s of group) {
            const b = unitPos(s.to);
            if (b && !quick) addFx({ kind: 'impact', x: b.x, y: b.y, color: s.hs ? HS_COLOR : '#ff5a5a', hs: s.hs, big: s.dmg >= 4 }, 520);
            pop(s.to, `-${s.dmg}`, s.hs ? HS_COLOR : '#ff5a5a', s.hs ? 'hs' : 'dmg');
            hitReact(s.to, s.hs || s.dmg >= 4);
          }
          setAnimSnap(group[group.length - 1].snap);
          if (hsShots.length) {
            if (!quick) {
              for (const s of hsShots) {
                const b = unitPos(s.to);
                if (b) addFx({ kind: 'hsburst', x: b.x, y: b.y }, 850);
              }
              addFx({ kind: 'screen', effect: 'hs' }, 650);
              shake('m');
            }
            sfx.headshot();
            vibrate([30, 30, 70]);
            shout(
              'HEADSHOT', HS_COLOR, 'xl',
              hsShots.length > 1 ? `×${hsShots.length}  ·  +${hsShots.length}¢ BONUS` : '+1¢ BONUS', 1300, 'hs',
            );
            hold(1000);
            await wait(quick ? 120 : 260);
          } else {
            if (group.some((s) => s.kill || s.dmg >= 4)) shake('s');
            await wait(quick ? 120 : 440);
          }
          break;
        }
        case 'kill': {
          const b = unitPos(ev.uid);
          if (b) {
            addFx({
              kind: 'shatter', x: b.left, y: b.top, w: b.w, h: b.h, cardId: ev.cardId,
              color: ev.victimOwner === me ? ME_COLOR : OPP_COLOR, hs: ev.hs,
            }, 950);
          }
          sfx.kill();
          if (!fast()) sfx.shatter();
          if (b && ev.byPlayer === me && !fast()) {
            const bar = center(trackRef.current?.querySelector('.st-bar'));
            if (bar) {
              const fill = railPos(ev.snap.players[me].sp);
              addFx({ kind: 'orb', x: b.x, y: b.y, dx: bar.left + bar.w * fill - b.x, dy: bar.y - b.y }, 600);
            }
          }
          setAnimSnap(ev.snap);
          setFeed((f) => [
            {
              id: fxSeq++, killer: ev.byCardId ? card(ev.byCardId).en : undefined,
              killerMine: ev.byPlayer === me, victim: card(ev.cardId).en, victimMine: ev.victimOwner === me,
              hs: ev.hs, weapon: ev.weapon, source: ev.source,
            },
            ...f,
          ].slice(0, 5));
          await wait(ev.hs ? 200 : 170);
          break;
        }
        case 'multikill': {
          const label = ev.ace ? 'ACE' : ev.count >= 4 ? 'QUAD KILL' : ev.count === 3 ? 'TRIPLE KILL' : 'DOUBLE KILL';
          shout(
            label, ev.ace ? HS_COLOR : sideColor(ev.p), 'xl', ev.p === me ? 'ナイス！' : '敵の連続キル', 1400,
            ev.ace ? 'ace' : 'multi', ev.count,
          );
          sfx.callout();
          if (ev.ace) sfx.headshot();
          shake(ev.ace ? 'l' : 'm');
          vibrate(ev.ace ? [80, 50, 80, 50, 160] : [60, 40, 60]);
          await wait(1200);
          break;
        }
        case 'recall': {
          const b = unitPos(ev.uid);
          if (b && !fast()) addFx({ kind: 'land', x: b.left, y: b.top, w: b.w, h: b.h, color: sideColor(ev.p) }, 700);
          setAnimSnap(ev.snap);
          sfx.select();
          await wait(320);
          break;
        }
        case 'draw':
          setAnimSnap(ev.snap);
          if (ev.p === me && ev.count > 0) showToast(`カードを${ev.count}枚引いた`);
          await wait(150);
          break;
        case 'c4Plant':
          setAnimSnap(ev.snap);
          sfx.plant();
          shout('C4 PLANTED', sideColor(ev.p), 'lg', `${ZONE_LABELS[ev.zone]}：次のターン終了時に爆発`, 1400, 'alert');
          await wait(1100);
          break;
        case 'c4Defuse':
          setAnimSnap(ev.snap);
          sfx.defuse();
          shout('DEFUSED', sideColor(ev.p), 'lg', `${ZONE_LABELS[ev.zone]}のC4を解除`, 1200);
          await wait(1000);
          break;
        case 'c4Explode':
          sfx.plant();
          await wait(350);
          zoneFx(ev.zone, 'explosion', {}, 1100);
          sfx.explosion(true);
          shake('l');
          vibrate([100, 50, 200]);
          setAnimSnap(ev.snap);
          shout('DETONATED', sideColor(ev.p), 'xl', '+2pt', 1300, 'alert');
          await wait(1100);
          break;
        case 'score': {
          setAnimSnap(ev.snap);
          zoneFx(ev.zone, 'capture', { color: sideColor(ev.p), label: 'SECURED', from: ev.p === me ? 'bottom' : 'top' }, 1050);
          const c = center(zoneRefs.current[ev.zone]);
          if (c) addFx({ kind: 'pop', x: c.x, y: c.y + 36, text: `+${ev.pts}pt`, color: sideColor(ev.p), tone: 'pts' }, 1100);
          sfx.score();
          await wait(420);
          break;
        }
        case 'turnStart': {
          const gained = prev ? ev.snap.players[me].credits - prev.players[me].credits : 0;
          const final = ev.turn === conn.initialView.config.maxTurns;
          setAnimSnap(ev.snap);
          sfx.turn();
          shout(
            final ? 'FINAL TURN' : `TURN ${ev.turn}`, final ? OPP_COLOR : ME_COLOR, 'lg',
            gained > 0 ? `+${gained}¢ 収入  ·  作戦フェーズ` : '作戦フェーズ', 1000, 'turn',
          );
          await wait(800);
          break;
        }
        case 'gameOver': {
          setAnimSnap(ev.snap);
          await wait(500);
          const won = ev.winner === me;
          if (ev.winner === 'draw') {
            sfx.turn();
            setBgm('menu');
          } else if (won) {
            sfx.victory();
            setBgm('win');
          } else {
            sfx.defeat();
            setBgm('lose');
          }
          const r: MatchResult = {
            winner: ev.winner, reason: ev.reason, me, view: finalView,
            kills: finalView.self.kills, headshots: finalView.self.headshots, nuked: statsRef.current.nuked,
          };
          const rp = onFinish(r);
          setResult({ ...r, rp });
          break;
        }
      }
      prev = events[i].snap;
    }
    if (!aliveRef.current) return;
    setCombat(false);
    setAimTier(null);
    setReveal(null);
    setCutin(null);
    setAnimSnap(null);
    const pending = pendingViewRef.current;
    pendingViewRef.current = null;
    setView(pending && pending.turn === finalView.turn ? pending : finalView);
    setPlan({ actions: [] });
    setOppReady(false);
    speedRef.current = 1;
    if (finalView.winner !== null) {
      setPhase('over');
    } else {
      setPhase('plan');
      setTimeLeft(conn.planSeconds);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    conn.setHandlers({
      onOpponentReady: () => setOppReady(true),
      onResolved: (events, v) => {
        queueRef.current = queueRef.current.then(() => play(events, v));
      },
      onView: (v) => {
        if (phaseRef.current === 'anim') {
          pendingViewRef.current = v;
          return;
        }
        setView(v);
      },
      onEmote: (mine, id) => {
        const key = Date.now() + Math.random();
        setEmotes((list) => [...list.filter((e) => e.mine !== mine), { key, mine, id }]);
        setTimeout(() => aliveRef.current && setEmotes((list) => list.filter((e) => e.key !== key)), 2600);
        if (!mine) sfx.select();
      },
      onOpponentLeft: () => setOppLeft(true),
      onRematch: (v) => {
        setResult(null);
        setFeed([]);
        setView(v);
        setPlan({ actions: [] });
        setPhase('plan');
        setOppReady(false);
        setTimeLeft(conn.planSeconds);
        statsRef.current.nuked = false;
        setBgm('battle');
      },
    });
    return () => {
      aliveRef.current = false;
      if (passHoldRef.current !== null) window.clearTimeout(passHoldRef.current);
    };
  }, [conn, play]);

  useEffect(() => {
    const t = window.setTimeout(() => preloadCardArt(conn.initialView.opp.deckList), 1500);
    return () => window.clearTimeout(t);
  }, [conn]);

  const spottedByUav = phase === 'plan' && view.opp.uavActive;
  useEffect(() => {
    if (spottedByUav) showToast('敵のUAV：こちらの手札が見られている');
  }, [spottedByUav, showToast]);

  // Plan timer (online only)
  useEffect(() => {
    if (phase !== 'plan' || timeLeft === null) return;
    if (timeLeft <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  // ---------- planning ----------
  const selectedCard = sel?.kind === 'hand' ? view.self.hand.find((h) => h.hid === sel.hid) : undefined;
  const selectedDef = selectedCard ? card(selectedCard.cardId) : undefined;
  const targets = useMemo(() => {
    if (phase !== 'plan' || !sel) return null;
    if (sel.kind === 'streak') return { zones: [...ZONES], units: [] as UnitRef[] };
    return legalTargets(view, plan, sel.hid);
  }, [sel, view, plan, phase]);
  const legalUnitKeys = useMemo(() => new Set(targets?.units.map(refKey) ?? []), [targets]);

  const addAction = (a: Action) => {
    const err = tryAdd(view, plan, a);
    if (err) {
      sfx.deny();
      showToast(err);
      return false;
    }
    setPlan({ actions: [...plan.actions, a] });
    setSel(null);
    sfx.place();
    return true;
  };

  const removeAction = (index: number) => {
    const rest = plan.actions.filter((_, i) => i !== index);
    setPlan({ actions: checkPlan(view, { actions: rest }).valid });
    sfx.select();
  };

  const onHandClick = (hid: string) => {
    if (phase !== 'plan') return;
    const idx = plan.actions.findIndex((a) => 'hid' in a && a.hid === hid);
    if (idx >= 0) {
      removeAction(idx);
      return;
    }
    if (sel?.kind === 'hand' && sel.hid === hid) {
      setSel(null);
      return;
    }
    sfx.select();
    setSel({ kind: 'hand', hid });
  };

  const onZoneClick = (zone: ZoneId) => {
    if (phase !== 'plan' || !sel) return;
    if (sel.kind === 'streak') {
      addAction({ t: 'streak', id: sel.id, zone });
      return;
    }
    if (!selectedDef) return;
    if (selectedDef.type === 'operator') addAction({ t: 'deploy', hid: sel.hid, zone });
    else if (selectedDef.type === 'tactic' && selectedDef.target === 'zone') addAction({ t: 'tactic', hid: sel.hid, zone });
  };

  const onUnitClick = (ref: UnitRef, u: UnitSnap, e: ReactMouseEvent) => {
    e.stopPropagation();
    if (phase !== 'plan') {
      if (!('hid' in ref)) setDetail({ cardId: u.cardId, unit: u });
      return;
    }
    if (sel?.kind === 'hand' && selectedDef) {
      if (selectedDef.type === 'operator' || selectedDef.target === 'zone') {
        onZoneClick(u.zone);
        return;
      }
      if (selectedDef.type === 'gear') {
        addAction({ t: 'gear', hid: sel.hid, target: ref });
        return;
      }
      if (selectedDef.target === 'enemyUnit' || selectedDef.target === 'allyUnit') {
        addAction({ t: 'tactic', hid: sel.hid, target: ref });
        return;
      }
    }
    if (sel?.kind === 'streak') {
      onZoneClick(u.zone);
      return;
    }
    if ('hid' in ref) {
      const idx = plan.actions.findIndex((a) => a.t === 'deploy' && a.hid === ref.hid);
      if (idx >= 0) removeAction(idx);
      return;
    }
    if (u.uid.startsWith('mv:')) {
      const idx = plan.actions.findIndex((a) => a.t === 'move' && a.uid === u.uid.slice(3));
      if (idx >= 0) removeAction(idx);
      return;
    }
    setDetail({ cardId: u.cardId, unit: u, movable: u.owner === me });
  };

  const onStreakClick = (id: StreakId) => {
    if (phase !== 'plan') return;
    if (id === 'uav') {
      if (uavOn) {
        showToast('UAV稼働中：相手の手札を表示している');
        return;
      }
      if (planCheck.sp < STREAKS.uav.cost) {
        sfx.deny();
        showToast(`SPが足りない（必要 ${STREAKS.uav.cost}）`);
        return;
      }
      sfx.turn();
      conn.uav();
      return;
    }
    const idx = plan.actions.findIndex((a) => a.t === 'streak' && a.id === id);
    if (idx >= 0) {
      removeAction(idx);
      return;
    }
    if (planCheck.sp < STREAKS[id].cost) {
      sfx.deny();
      showToast(`SPが足りない（必要 ${STREAKS[id].cost}）`);
      return;
    }
    if (STREAKS[id].target === 'zone') {
      sfx.select();
      setSel({ kind: 'streak', id });
    } else {
      addAction({ t: 'streak', id });
    }
  };

  const submit = () => {
    if (phaseRef.current !== 'plan') return;
    const p = { actions: checkPlan(view, planRef.current).valid };
    setSel(null);
    setDetail(null);
    setPhase('waiting');
    sfx.ready();
    conn.submit(p);
  };

  /** Passing a whole turn needs a 0.4s hold so a stray tap can't throw it away. */
  const startPassHold = () => {
    if (phaseRef.current !== 'plan' || planRef.current.actions.length > 0) return;
    setHolding(true);
    passHoldRef.current = window.setTimeout(() => {
      passHoldRef.current = null;
      setHolding(false);
      submit();
    }, 400);
  };

  const endPassHold = (tapped: boolean) => {
    if (passHoldRef.current !== null) {
      window.clearTimeout(passHoldRef.current);
      passHoldRef.current = null;
      if (tapped) showToast('パスするには長押し（0.4秒）');
    }
    setHolding(false);
  };

  const toggleResupply = () => {
    if (phase !== 'plan') return;
    const idx = plan.actions.findIndex((a) => a.t === 'resupply');
    if (idx >= 0) removeAction(idx);
    else addAction({ t: 'resupply' });
  };

  const moveUnit = (uid: string, zone: ZoneId) => {
    if (addAction({ t: 'move', uid, zone })) setDetail(null);
  };

  const sendEmote = (id: EmoteId) => {
    setEmoteOpen(false);
    conn.emote(id);
  };

  const skip = () => {
    speedRef.current = 0.08;
    setReveal(null);
    setCutin(null);
    setCallout(null);
  };

  // ---------- derived rendering data ----------
  const pendingByUnit = new Map<string, string[]>();
  const pendingByZone: string[][] = [[], [], []];
  const movingOut = new Set<string>();
  const ghosts: UnitSnap[][] = [[], [], []];
  if (!animSnap) {
    for (const a of planCheck.valid) {
      if (a.t === 'deploy') {
        const h = view.self.hand.find((x) => x.hid === a.hid)!;
        ghosts[a.zone].push(ghostUnit(h.cardId, `hid:${a.hid}`, me, a.zone));
      } else if (a.t === 'gear' || (a.t === 'tactic' && a.target)) {
        const h = view.self.hand.find((x) => x.hid === a.hid)!;
        const key = refKey(a.target!);
        pendingByUnit.set(key, [...(pendingByUnit.get(key) ?? []), card(h.cardId).en]);
      } else if (a.t === 'tactic' && a.zone !== undefined) {
        const h = view.self.hand.find((x) => x.hid === a.hid)!;
        pendingByZone[a.zone].push(card(h.cardId).en);
      } else if (a.t === 'move') {
        movingOut.add(a.uid);
        const u = board.zones.flatMap((z) => z.units[me]).find((x) => x.uid === a.uid);
        if (u) ghosts[a.zone].push({ ...u, uid: `mv:${u.uid}`, zone: a.zone });
      } else if (a.t === 'streak' && a.zone !== undefined) {
        pendingByZone[a.zone].push(STREAKS[a.id].en);
      }
    }
  }

  const players = board.players;
  const myScore = players[me].score;
  const oppScore = players[opp].score;
  const target = view.config.targetScore;
  const matchPoint = comebackBonus(myScore, oppScore, target) > 0 ? me
    : comebackBonus(oppScore, myScore, target) > 0 ? opp : null;
  const credits = animSnap ? players[me].credits : planCheck.credits;
  const sp = animSnap ? players[me].sp : planCheck.sp;
  const usedHids = new Set(plan.actions.filter((a) => 'hid' in a).map((a) => (a as { hid: string }).hid));
  const hint = sel
    ? sel.kind === 'streak'
      ? '空爆するゾーンをタップ'
      : selectedDef
        ? selectedDef.type === 'operator' ? TARGET_HINT.operator : selectedDef.type === 'gear' ? TARGET_HINT.gear : TARGET_HINT[selectedDef.target ?? 'none']
        : ''
    : '';

  const renderUnit = (u: UnitSnap, side: PlayerId, order?: number) => {
    const isGhost = u.uid.startsWith('hid:') || u.uid.startsWith('mv:');
    const ref: UnitRef = u.uid.startsWith('hid:') ? { hid: u.uid.slice(4) } : { uid: u.uid };
    const key = refKey(ref);
    let state: 'legal' | 'moving' | 'ghost' | 'dim' | undefined;
    if (isGhost) state = 'ghost';
    if (movingOut.has(u.uid)) state = 'moving';
    if (targets) state = legalUnitKeys.has(key) ? 'legal' : targets.units.length ? 'dim' : state;
    return (
      <UnitTile
        key={u.uid}
        u={u}
        mine={side === me}
        state={state}
        badges={pendingByUnit.get(key)}
        order={order}
        flow={side === me ? hasFlow({ flowOwned }, u.cardId) : false}
        ref={(el) => {
          if (isGhost) return;
          if (el) tileRefs.current.set(u.uid, el);
          else tileRefs.current.delete(u.uid);
        }}
        onClick={(e) => onUnitClick(ref, u, e)}
      />
    );
  };

  const oppDeck = deckById(view.opp.deckId);
  const doubled = zoneValue('open', board.turn) > zoneValue('open', 1);
  const finalTurn = board.turn >= view.config.maxTurns;
  // `matchPoint` is the trailing side that earns the comeback bonus; the other side is on match point.
  const onMatchPoint = matchPoint === null ? null : matchPoint === me ? opp : me;
  const myBonus = comebackBonus(myScore, oppScore, target);
  const planning = phase === 'plan' || phase === 'waiting';
  const hasActions = plan.actions.length > 0;
  const nextIncome = board.turn < view.config.maxTurns ? baseIncome(board.turn + 1) : 0;
  const timeWarn = phase === 'plan' && timeLeft !== null && timeLeft <= 10;
  const timeCrit = phase === 'plan' && timeLeft !== null && timeLeft <= 3;

  return (
    <div
      className={`battle phase-${phase} has-art-bg ${combat ? 'in-combat' : ''} ${sel ? 'selecting' : ''} ${timeCrit ? 'time-crit' : ''}`}
      style={{ '--screen-bg': cssUrl('bgs/bg-battle.webp') } as CSSProperties}
      ref={rootRef}
    >
      {/* Scoreboard: both scores side by side around the turn, like an FPS round HUD. */}
      <div className="sb">
        <div className="sb-row">
          <ScorePips score={myScore} target={target} side="me" hot={onMatchPoint === me} />
          <div className="sb-score me">
            <b key={myScore}>{myScore}</b>
            {onMatchPoint === me && <i className="sb-mp">MP</i>}
          </div>
          <div className={`sb-turn ${finalTurn ? 'final' : ''}`}>
            <small>{finalTurn ? 'FINAL' : 'TURN'}</small>
            <b>{board.turn}<span>/{view.config.maxTurns}</span></b>
            {doubled && <i className="sb-x2" title="7ターン目以降は得点2倍">×2</i>}
          </div>
          <div className="sb-score opp">
            {onMatchPoint === opp && <i className="sb-mp">MP</i>}
            <b key={oppScore}>{oppScore}</b>
          </div>
          <ScorePips score={oppScore} target={target} side="opp" hot={onMatchPoint === opp} />
        </div>
        <div className="sb-sub">
          <div className="sb-tools">
            <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="ヘルプ"><CircleHelp size={15} /></button>
            <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="メニュー"><Flag size={15} /></button>
            <button className="icon-btn" onClick={() => setEmoteOpen((o) => !o)} aria-label="エモート"><MessageCircle size={15} /></button>
            {aimTier && (
              <span key={aimTier.key} className="aim-tier"><Crosshair size={11} strokeWidth={2.6} />AIM<b>{aimTier.aim}</b></span>
            )}
          </div>
          <div className="sb-opp">
            <b className="sb-opp-name">{conn.oppName}</b>
            <span className="deck-tag" style={{ color: oppDeck.color }}>{oppDeck.en}</span>
            <span className="sb-stat gold" title="クレジット"><Coins size={11} />{players[opp].credits}</span>
            <span className="sb-stat sp" title="SP">SP{players[opp].sp}</span>
            <span className="sb-stat" title="手札">✋{players[opp].handCount}</span>
            {planning && <span className={`ready ${oppReady ? 'on' : ''}`}>{oppReady ? 'READY' : '作戦中'}</span>}
          </div>
        </div>
        {emotes.filter((e) => !e.mine).map((e) => (
          <div key={e.key} className="emote-bubble opp">{EMOTES.find((x) => x.id === e.id)?.text}</div>
        ))}
        {emoteOpen && (
          <div className="emote-menu">
            {EMOTES.map((e) => <button key={e.id} onClick={() => sendEmote(e.id)}>{e.text}</button>)}
          </div>
        )}
      </div>

      {/* Board */}
      <div className="board">
        {ZONES.map((zi) => {
          const z = board.zones[zi];
          const mod = ZONE_MODS[z.modId];
          const vis = zoneVisual(z.modId);
          const ZoneIcon = vis.Icon;
          const zoneLegal = targets?.zones.includes(zi);
          const ctrl = z.controller;
          const oppUnits = z.units[opp];
          const myUnits = [...z.units[me], ...ghosts[zi]];
          const contest = oppUnits.length > 0 && myUnits.length > 0;
          const line = contest ? 'contest' : ctrl === me ? 'me' : ctrl === opp ? 'opp' : '';
          const contested = combat && contest && !z.smoked;
          const tiers = contest && !z.smoked && planning ? aimTiers([...oppUnits, ...myUnits]) : null;
          const pts = zoneValue(z.modId, board.turn) + myBonus;
          return (
            <div
              key={zi}
              className={`zone has-art ${zoneLegal ? 'legal' : ''} ${targets && !zoneLegal && targets.zones.length ? 'dim' : ''} ${z.smoked ? 'smoked' : ''} ${contested ? 'contested' : ''}`}
              style={{
                '--zone-art': cssUrl(`zones/${z.modId}.webp`),
                '--zone-c': vis.accent,
              } as CSSProperties}
              ref={(el) => { zoneRefs.current[zi] = el; }}
              onClick={() => onZoneClick(zi)}
            >
              <div className={`zone-head ${ctrl === me ? 'ctrl-me' : ctrl === opp ? 'ctrl-opp' : ''}`}>
                <div className="zone-label">{ZONE_LABELS[zi]}</div>
                <button
                  type="button"
                  className="zone-mod"
                  onClick={(e) => { e.stopPropagation(); showToast(`${mod.name}：${mod.text}`); }}
                >
                  <span className="zone-tip">{vis.tip}</span>
                </button>
              </div>
              <div className="zone-flags">
                {z.c4 && <span className="c4" style={{ color: sideColor(z.c4.owner) }}><Bomb size={12} />{z.c4.explodeTurn === board.turn ? '!' : ''}</span>}
                {z.fire[me] > 0 && <span style={{ color: ME_COLOR }}><Flame size={12} /></span>}
                {z.fire[opp] > 0 && <span style={{ color: OPP_COLOR }}><Flame size={12} /></span>}
              </div>
              {pendingByZone[zi].length > 0 && <div className="zone-pending">{pendingByZone[zi].join(' / ')}</div>}
              {oppUnits.length + myUnits.length === 0 && (
                <div className="zone-mark" aria-hidden>
                  <ZoneIcon size={44} strokeWidth={1.75} />
                </div>
              )}
              <div className="side side-opp">{oppUnits.map((u) => renderUnit(u, opp, tiers?.get(u.aim)))}</div>
              {/* Keyed by controller so the tube re-ignites only when the zone actually changes hands. */}
              <div key={String(ctrl)} className={`zone-line ${line} ${ctrl !== null ? 'ignite' : ''}`}>
                {line && <span className="zl-state">{line === 'contest' ? '交戦' : line === 'me' ? '確保' : '敵確保'}</span>}
                <b className="zl-pts" title="自分が確保したときの獲得pt">+{pts}</b>
              </div>
              <div className="side side-me">{myUnits.map((u) => renderUnit(u, me, tiers?.get(u.aim)))}</div>
              {z.smoked && <div className="smoke-cloud" />}
            </div>
          );
        })}

        {/* Alerts overlay the (usually empty) bottom edge of the board so the layout never shifts. */}
        {planning && (view.opp.hand || spottedByUav || nukeLanding !== null || matchPoint !== null) && (
          <div className="alerts">
            {view.opp.hand && phase === 'plan' && (
              <div className="uav-hand">
                <span>UAV：相手の手札</span>
                {view.opp.hand.map((h) => <span key={h.hid} className="uav-card"><CardIcon cardId={h.cardId} size={12} />{card(h.cardId).en}</span>)}
              </div>
            )}
            {spottedByUav && <div className="uav-hand spotted"><span>敵のUAV：こちらの手札が見られている</span></div>}
            {nukeLanding !== null && (
              <div className={`nuke-banner ${nukeLanding === me ? 'mine' : 'theirs'}`}>
                <Radiation size={14} />
                {nukeLanding === me
                  ? `戦術核：このターン終了時に着弾。敵の確保を${NUKE_BLOCK_ZONES - 1}ゾーン以下に抑えろ`
                  : `敵の戦術核：このターン終了時に着弾。${NUKE_BLOCK_ZONES}ゾーン確保で阻止！`}
              </div>
            )}
            {matchPoint !== null && (
              <div className={`matchpoint-banner ${matchPoint === me ? 'mine' : 'theirs'}`}>
                MATCH POINT
                <span>{matchPoint === me ? '逆転のチャンス：確保したゾーン1つにつき+1pt' : 'あと一押し：ただし相手は確保ゾーン1つにつき+1pt'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kill feed */}
      <div className="killfeed">
        {feed.map((f) => (
          <div key={f.id} className={`kf ${f.hs ? 'hs' : ''}`}>
            {f.killer && <span className={f.killerMine ? 'me' : 'opp'}>{f.killer}</span>}
            {f.weapon ? <WeaponIcon kind={card(f.weapon).weaponClass!} size={10} /> : <span className="kf-src">{f.source === 'shot' ? '•' : f.source === 'c4' ? '💥' : f.source === 'fire' ? '🔥' : f.source === 'trap' ? '⚡' : '✱'}</span>}
            {f.hs && <span className="kf-hs"><Crosshair size={9} strokeWidth={3} />HS</span>}
            <span className={f.victimMine ? 'me' : 'opp'}>{f.victim}</span>
          </div>
        ))}
      </div>

      {reveal && <RevealStage key={reveal.key} r={reveal} />}
      {cutin && <CutInView key={cutin.key} c={cutin} />}

      <div className="dock">
        {emotes.filter((e) => e.mine).map((e) => (
          <div key={e.key} className="emote-bubble mine">{EMOTES.find((x) => x.id === e.id)?.text}</div>
        ))}

        {/* Killstreak track: one segment per streak; each button ends at the notch where it unlocks. */}
        <div className="streak-track" ref={trackRef}>
          <span className="sp-label">SP<b key={sp}>{sp}</b></span>
          <div className="st-rail">
            <div className="st-bar">
              <i style={{ width: `${railPos(sp) * 100}%` }} />
              {STREAK_ORDER.map((id, i) => (
                <span key={id} className={`st-notch ${sp >= STREAKS[id].cost ? 'on' : ''}`} style={{ left: `${((i + 1) / STREAK_ORDER.length) * 100}%` }} />
              ))}
            </div>
            {STREAK_ORDER.map((id, i) => {
              const s = STREAKS[id];
              const queued = plan.actions.some((a) => a.t === 'streak' && a.id === id)
                || (id === 'uav' && uavOn)
                || (id === 'nuke' && view.self.nukeTurn >= view.turn);
              const can = sp >= s.cost || queued;
              return (
                <button
                  key={id}
                  className={`streak ${can ? 'can' : ''} ${queued ? 'queued' : ''} ${sel?.kind === 'streak' && sel.id === id ? 'selected' : ''} streak-${id}`}
                  style={{ '--pos': (i + 1) / STREAK_ORDER.length } as CSSProperties}
                  onClick={() => onStreakClick(id)}
                  disabled={phase !== 'plan'}
                >
                  <StreakIcon id={id} size={13} />
                  <span>{s.name}</span>
                  <small>{s.cost}</small>
                </button>
              );
            })}
          </div>
        </div>

        {/* Planned actions */}
        <div className="plan-chips">
          {phase === 'plan' && plan.actions.length === 0 && !sel && <span className="plan-empty">カードをタップして作戦を立てよう</span>}
          {phase === 'plan' && sel?.kind === 'streak' && <span className="plan-hint">{hint}<button onClick={() => setSel(null)} aria-label="取り消し"><X size={12} /></button></span>}
          {phase === 'plan' && !sel && plan.actions.map((a, i) => {
            const d = describeAction(view, a);
            return (
              <button key={i} className="chip" onClick={() => removeAction(i)}>
                {d.label}<X size={10} />
              </button>
            );
          })}
          {phase === 'waiting' && <span className="plan-empty">相手の作戦を待っています…</span>}
          {phase === 'anim' && <button className="chip skip" onClick={skip}>SKIP ▶▶</button>}
        </div>

        <div className="dock-hand">
          {/* Compact preview sits over the streak/chip rows, so the board and its zone headers stay visible. */}
          {phase === 'plan' && selectedCard && (
            <div className="preview">
              <CardStrip cardId={selectedCard.cardId} />
              <div className="preview-actions">
                {selectedDef?.type === 'tactic' && selectedDef.target === 'none' ? (
                  <button className="btn primary small" onClick={() => addAction({ t: 'tactic', hid: selectedCard.hid })}>使用する</button>
                ) : (
                  <span className="preview-hint">{hint}</span>
                )}
                <button className="btn ghost small" onClick={() => setSel(null)}>キャンセル</button>
              </div>
            </div>
          )}

          <div className="hand" style={{ '--n': Math.max(1, view.self.hand.length) } as CSSProperties}>
            {view.self.hand.map((h) => {
              const def = card(h.cardId);
              const used = usedHids.has(h.hid);
              return (
                <HandCard
                  key={h.hid}
                  cardId={h.cardId}
                  cost={def.cost}
                  used={used}
                  kira={hasKira({ kiraOwned }, h.cardId)}
                  sign={hasSign({ signOwned }, h.cardId)}
                  flow={hasFlow({ flowOwned }, h.cardId)}
                  selected={sel?.kind === 'hand' && sel.hid === h.hid}
                  disabled={!used && def.cost > credits}
                  onClick={() => onHandClick(h.hid)}
                />
              );
            })}
            {view.self.hand.length === 0 && <div className="hand-empty">手札なし</div>}
          </div>

          <div className="action-bar">
            <div className="credits" title="クレジット">
              <Coins size={16} />
              <b key={credits}>{credits}</b>
              <span>¢</span>
              {nextIncome > 0 && <small title="次ターンの基本収入">+{nextIncome}</small>}
            </div>
            <div className="deck-info">山札<b>{view.self.deckCount}</b></div>
            <button
              className={`btn small resupply-btn ${plan.actions.some((a) => a.t === 'resupply') ? 'queued' : ''}`}
              disabled={phase !== 'plan'}
              onClick={toggleResupply}
              title="クレジットを払ってカードを1枚引く（使えるのは次のターンから・1ターン1回）"
            >
              補給<small>{RESUPPLY_COST}¢</small>
            </button>
            <button
              key={hasActions ? 'go' : 'pass'}
              className={`btn ready-btn ${hasActions ? 'primary go' : 'pass'} ${holding ? 'holding' : ''} ${timeWarn ? 'warn' : ''}`}
              disabled={phase !== 'plan'}
              onClick={(e) => { if (hasActions || e.detail === 0) submit(); }}
              onPointerDown={startPassHold}
              onPointerUp={() => endPassHold(true)}
              onPointerLeave={() => endPassHold(false)}
              onPointerCancel={() => endPassHold(false)}
            >
              {phase === 'plan' ? (
                hasActions ? <><b>READY</b><span className="rb-count">▶ {plan.actions.length}</span></> : <><b>PASS</b><span className="rb-note">長押し</span></>
              ) : (
                <b className="rb-status">{phase === 'waiting' ? '待機中…' : phase === 'anim' ? '交戦中' : '試合終了'}</b>
              )}
              {phase === 'plan' && timeLeft !== null && (
                <>
                  <span className="timer">{timeLeft}</span>
                  {conn.planSeconds && <i className="rb-timer" style={{ transform: `scaleX(${Math.max(0, timeLeft / conn.planSeconds)})` }} />}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* FX layer */}
      <div className="fx-layer">
        {fx.map((f) => <FxView key={f.id} f={f} />)}
      </div>

      {callout && <CalloutView key={callout.key} c={callout} />}

      {toast && <div key={toast.key} className="toast" onAnimationEnd={() => setToast(null)}>{toast.text}</div>}

      {/* Unit detail */}
      {detail && (
        <div className="modal-bg" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={detail.cardId} unit={detail.unit} kira={hasKira({ kiraOwned }, detail.cardId)} sign={hasSign({ signOwned }, detail.cardId)} flow={hasFlow({ flowOwned }, detail.cardId)} />
            {detail.movable && detail.unit && phase === 'plan' && (
              <div className="move-btns">
                {[detail.unit.zone - 1, detail.unit.zone + 1].filter((z) => z >= 0 && z <= 2).map((z) => (
                  <button key={z} className="btn small" onClick={() => moveUnit(detail.unit!.uid, z as ZoneId)}>
                    {ZONE_LABELS[z]}へローテ（1¢）
                  </button>
                ))}
              </div>
            )}
            <button className="btn ghost small" onClick={() => setDetail(null)}>閉じる</button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="modal-bg" onClick={() => setMenuOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>メニュー</h3>
            <button className="btn danger" onClick={() => { setMenuOpen(false); conn.surrender(); }} disabled={phase === 'over'}>降参する</button>
            <button className="btn ghost" onClick={() => setMenuOpen(false)}>戻る</button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="modal-bg" onClick={() => setHelpOpen(false)}>
          <div className="modal modal-tall" onClick={(e) => e.stopPropagation()}>
            <HowToContent compact />
            <button className="btn ghost small" onClick={() => setHelpOpen(false)}>閉じる</button>
          </div>
        </div>
      )}

      {oppLeft && !result && (
        <div className="modal-bg">
          <div className="modal">
            <h3>相手が切断しました</h3>
            <button className="hud-btn hud-main hud-primary" style={{ '--a': '#ff4655' } as CSSProperties} onClick={onExit}>
              <span className="hud-ico"><Home size={22} /></span>
              <span className="hud-txt"><b>TITLE</b><small>タイトルへ</small></span>
              <ChevronRight className="hud-go" size={22} />
            </button>
          </div>
        </div>
      )}

      {result && (
        <ResultOverlay
          result={result}
          oppName={conn.oppName}
          onRematch={() => conn.rematch()}
          onExit={onExit}
          canRematch={!oppLeft}
        />
      )}
    </div>
  );
}

/** Counts from 0 to `target` with an ease-out-expo curve after `delay` ms. */
function useCountUp(target: number, ms: number, delay = 0): number {
  const [value, setValue] = useState(REDUCED_MOTION ? target : 0);
  useEffect(() => {
    if (REDUCED_MOTION) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = window.setTimeout(() => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        setValue(Math.round(target * (p >= 1 ? 1 : 1 - 2 ** (-10 * p))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, [target, ms, delay]);
  return value;
}

/** Score pips grow outward from the turn display in the middle. `hot` = this side is on match point. */
function ScorePips({ score, target, side, hot }: { score: number; target: number; side: 'me' | 'opp'; hot: boolean }) {
  return (
    <div className={`sb-pips ${side} ${hot ? 'hot' : ''}`} aria-label={`${score} / ${target}`}>
      {Array.from({ length: target }, (_, i) => <span key={i} className={i < score ? 'on' : ''} />)}
    </div>
  );
}

function ResultOverlay({ result, oppName, onRematch, onExit, canRematch }: {
  result: MatchResult & { rp: number | null };
  oppName: string;
  onRematch: () => void;
  onExit: () => void;
  canRematch: boolean;
}) {
  const { winner, me, view, reason } = result;
  const outcome = winner === 'draw' ? 'DRAW' : winner === me ? 'VICTORY' : 'DEFEAT';
  const color = winner === 'draw' ? '#c7d2de' : winner === me ? ME_COLOR : OPP_COLOR;
  const rpShown = useCountUp(result.rp ?? 0, 800, 450);
  return (
    <div className="result-bg">
      <div className="result" style={{ '--c': color } as CSSProperties}>
        <div className="result-title" data-text={outcome} aria-label={outcome}>
          {[...outcome].map((ch, i) => <span key={i} style={{ '--i': i } as CSSProperties} aria-hidden>{ch}</span>)}
        </div>
        <i className="result-rule" aria-hidden />
        <div className="result-reason">{REASON_TEXT[reason] ?? reason}</div>
        <div className="result-score">
          <div><span>YOU</span><b>{view.self.score}</b></div>
          <div className="vs">-</div>
          <div><span>{oppName}</span><b>{view.opp.score}</b></div>
        </div>
        <div className="result-stats">
          <div><span>キル</span><b>{view.self.kills}</b></div>
          <div><span>HEADSHOT</span><b>{view.self.headshots}</b></div>
          <div><span>被キル</span><b>{view.opp.kills}</b></div>
        </div>
        {result.rp !== null && (
          <div className={`result-rp ${result.rp > 0 ? 'up' : result.rp < 0 ? 'down' : ''}`}>{rpShown > 0 ? '+' : ''}{rpShown} RP</div>
        )}
        <div className="result-btns">
          {canRematch && (
            <button className="hud-btn hud-main hud-primary" style={{ '--a': '#ff4655' } as CSSProperties} onClick={onRematch}>
              <span className="hud-ico"><Flame size={22} /></span>
              <span className="hud-txt"><b>REMATCH</b><small>もう一戦</small></span>
              <ChevronRight className="hud-go" size={22} />
            </button>
          )}
          <button className="hud-btn hud-main" style={{ '--a': '#2ee6d6' } as CSSProperties} onClick={onExit}>
            <span className="hud-ico"><Home size={22} /></span>
            <span className="hud-txt"><b>TITLE</b><small>タイトルへ</small></span>
            <ChevronRight className="hud-go" size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
