import { Bomb, CircleHelp, Coins, Flag, Flame, MessageCircle, Radiation, Skull, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import {
  card, checkPlan, deckById, legalTargets, STREAK_ORDER, STREAKS, tryAdd, unitSnap, ZONE_LABELS, ZONE_MODS, ZONES,
  type Action, type BoardSnap, type GameEvent, type GameView, type Plan, type PlayerId, type PublicPlay,
  type StreakId, type UnitRef, type UnitSnap, type Winner, type WinReason, type ZoneId,
} from '../../engine';
import { EMOTES, type EmoteId } from '../../net/protocol';
import type { MatchConnection } from '../match';
import { sfx, vibrate, type ShotKind } from '../sfx';
import { CardDetail, HandCard, UnitTile } from '../ui/cards';
import { CardIcon, StreakIcon, WeaponIcon } from '../ui/icons';
import { REASON_TEXT, TARGET_HINT } from '../ui/text';
import { zoneVisual } from '../ui/zoneArt';
import { HowToContent } from './HowTo';

type Selection = { kind: 'hand'; hid: string } | { kind: 'streak'; id: StreakId };
type Phase = 'plan' | 'waiting' | 'anim' | 'over';

type Fx =
  | { id: number; kind: 'tracer'; x: number; y: number; len: number; angle: number; color: string; hs: boolean }
  | { id: number; kind: 'pop'; x: number; y: number; text: string; color: string; big?: boolean }
  | { id: number; kind: 'zone'; x: number; y: number; w: number; h: number; effect: 'flash' | 'explosion' | 'airstrike' | 'capture' | 'smoke' | 'fire'; color?: string }
  | { id: number; kind: 'skull'; x: number; y: number }
  | { id: number; kind: 'screen'; effect: 'nuke' | 'hs' };

type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, 'id'> : never) : never;

interface Callout {
  key: number;
  text: string;
  sub?: string;
  color: string;
  size: 'xl' | 'lg' | 'md';
}

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

const ME_COLOR = '#2ee6d6';
const OPP_COLOR = '#ff4655';

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
  }
}

export function Battle({ conn, onExit, onFinish }: {
  conn: MatchConnection;
  onExit: () => void;
  onFinish: (r: MatchResult) => number | null;
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
  const [revealPlays, setRevealPlays] = useState<PublicPlay[] | null>(null);
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

  const planCheck = useMemo(() => checkPlan(view, plan), [view, plan]);
  const board = animSnap ?? snapFromView(view);

  // ---------- helpers ----------
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * speedRef.current));

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

  const zoneFx = (zone: ZoneId, effect: Extract<Fx, { kind: 'zone' }>['effect'], color?: string, life = 1000) => {
    const c = center(zoneRefs.current[zone]);
    if (c) addFx({ kind: 'zone', x: c.left, y: c.top, w: c.w, h: c.h, effect, color }, life);
  };

  const pop = (uid: string, text: string, color: string, big = false) => {
    const c = unitPos(uid);
    if (c) addFx({ kind: 'pop', x: c.x, y: c.y - 6, text, color, big }, 1000);
  };

  const shout = (text: string, color: string, size: Callout['size'] = 'lg', sub?: string, life = 1200) => {
    const key = Date.now() + Math.random();
    setCallout({ key, text, color, size, sub });
    setTimeout(() => aliveRef.current && setCallout((c) => (c?.key === key ? null : c)), life * Math.max(0.35, speedRef.current));
  };

  const sideColor = (p: PlayerId) => (p === me ? ME_COLOR : OPP_COLOR);

  // ---------- playback ----------
  const play = useCallback(async (events: GameEvent[], finalView: GameView) => {
    setPhase('anim');
    setSel(null);
    setDetail(null);
    speedRef.current = 1;
    let prev: BoardSnap | null = null;
    for (let i = 0; i < events.length; i++) {
      if (!aliveRef.current) return;
      const ev = events[i];
      switch (ev.e) {
        case 'reveal': {
          const enemy = ev.plays[opp];
          setRevealPlays(enemy);
          shout('REVEAL', '#fff', 'md', enemy.length ? `相手は${enemy.length}アクション` : '相手は動かなかった', 900);
          sfx.callout();
          setAnimSnap(ev.snap);
          await wait(enemy.length ? 1300 : 800);
          break;
        }
        case 'move':
          setAnimSnap(ev.snap);
          sfx.select();
          await wait(280);
          break;
        case 'deploy':
          setAnimSnap(ev.snap);
          sfx.deploy();
          await wait(ev.p === me ? 160 : 300);
          break;
        case 'equip':
          setAnimSnap(ev.snap);
          sfx.place();
          await wait(40);
          pop(ev.uid, `+${card(ev.cardId).en}`, '#cfe3ff');
          await wait(260);
          break;
        case 'tactic': {
          setAnimSnap(ev.snap);
          const def = card(ev.cardId);
          const where = ev.zone !== undefined ? ` → ${ZONE_LABELS[ev.zone]}` : '';
          shout(def.en + where, sideColor(ev.p), 'md', ev.fizzle ? '不発…' : def.name, 800);
          if (ev.cardId === 'frag') sfx.explosion();
          else if (ev.cardId === 'precision') sfx.shot('sr');
          else sfx.select();
          if (ev.cardId === 'frag' && ev.zone !== undefined) zoneFx(ev.zone, 'explosion', undefined, 800);
          await wait(620);
          break;
        }
        case 'streak': {
          setAnimSnap(ev.snap);
          if (ev.id === 'uav') {
            shout('UAV ONLINE', sideColor(ev.p), 'lg', '敵の位置を捕捉', 1200);
            sfx.turn();
          } else if (ev.id === 'airstrike') {
            shout('AIRSTRIKE', sideColor(ev.p), 'lg', `空爆 → ${ZONE_LABELS[ev.zone ?? 0]}`, 1200);
            sfx.siren();
            await wait(700);
            if (ev.zone !== undefined) zoneFx(ev.zone, 'airstrike', undefined, 1200);
            sfx.explosion(true);
            vibrate([60, 40, 120]);
          }
          await wait(800);
          break;
        }
        case 'nuke':
          setAnimSnap(ev.snap);
          sfx.siren();
          shout('TACTICAL NUKE', sideColor(ev.p), 'xl', ev.p === me ? '戦術核、投下' : '戦術核が来る…！', 2600);
          await wait(1800);
          addFx({ kind: 'screen', effect: 'nuke' }, 2200);
          sfx.explosion(true);
          vibrate([200, 80, 400]);
          if (ev.p === me) statsRef.current.nuked = true;
          await wait(1600);
          break;
        case 'flash':
          setAnimSnap(ev.snap);
          sfx.flash();
          if (ev.zone !== undefined) zoneFx(ev.zone, 'flash', undefined, 700);
          await wait(420);
          break;
        case 'smoke':
          setAnimSnap(ev.snap);
          sfx.smoke();
          await wait(420);
          break;
        case 'fire':
          setAnimSnap(ev.snap);
          sfx.fire();
          zoneFx(ev.zone, 'fire', undefined, 900);
          await wait(380);
          break;
        case 'damage': {
          const group = [ev];
          while (events[i + 1]?.e === 'damage') group.push(events[++i] as typeof ev);
          for (const d of group) pop(d.uid, `-${d.amount}`, d.source === 'fire' ? '#ff9a3c' : '#ff5a5a');
          sfx.hit();
          setAnimSnap(group[group.length - 1].snap);
          await wait(420);
          break;
        }
        case 'heal':
          setAnimSnap(ev.snap);
          pop(ev.uid, `+${ev.amount}`, '#46d98a');
          await wait(250);
          break;
        case 'buff':
          setAnimSnap(ev.snap);
          ev.uids.forEach((u) => pop(u, ev.label, '#ffe28a'));
          await wait(350);
          break;
        case 'combatStart':
          setRevealPlays(null);
          setAnimSnap(ev.snap);
          shout('ENGAGE', '#fff', 'md', 'AIMの高い順に射撃', 700);
          sfx.callout();
          await wait(650);
          break;
        case 'shot': {
          const group = [ev];
          while (events[i + 1]?.e === 'shot' && (events[i + 1] as typeof ev).tier === ev.tier) group.push(events[++i] as typeof ev);
          let hs = false;
          for (const s of group) {
            const a = unitPos(s.from);
            const b = unitPos(s.to);
            if (a && b) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              addFx({ kind: 'tracer', x: a.x, y: a.y, len: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI, color: sideColor(s.p), hs: s.hs }, 420);
            }
            const from = s.snap.zones.flatMap((z) => [...z.units[0], ...z.units[1]]).find((u) => u.uid === s.from)
              ?? prev?.zones.flatMap((z) => [...z.units[0], ...z.units[1]]).find((u) => u.uid === s.from);
            sfx.shot(shotKind(from?.weapon));
            pop(s.to, s.hs ? `-${s.dmg}` : `-${s.dmg}`, s.hs ? '#ffe14d' : '#ff5a5a', s.hs);
            if (s.hs) hs = true;
          }
          setAnimSnap(group[group.length - 1].snap);
          if (hs) {
            await wait(90);
            sfx.headshot();
            vibrate(40);
            addFx({ kind: 'screen', effect: 'hs' }, 500);
            shout('HEADSHOT', '#ffe14d', 'lg', undefined, 900);
            await wait(700);
          } else {
            await wait(430);
          }
          break;
        }
        case 'kill': {
          const pos = unitPos(ev.uid);
          if (pos) addFx({ kind: 'skull', x: pos.x, y: pos.y }, 900);
          sfx.kill();
          setAnimSnap(ev.snap);
          setFeed((f) => [
            {
              id: fxSeq++, killer: ev.byCardId ? card(ev.byCardId).en : undefined,
              killerMine: ev.byPlayer === me, victim: card(ev.cardId).en, victimMine: ev.victimOwner === me,
              hs: ev.hs, weapon: ev.weapon, source: ev.source,
            },
            ...f,
          ].slice(0, 5));
          await wait(160);
          break;
        }
        case 'multikill': {
          const label = ev.ace ? 'ACE' : ev.count >= 4 ? 'QUAD KILL' : ev.count === 3 ? 'TRIPLE KILL' : 'DOUBLE KILL';
          shout(label, sideColor(ev.p), 'xl', ev.p === me ? 'ナイス！' : undefined, 1300);
          sfx.callout();
          vibrate(ev.ace ? [80, 50, 80, 50, 160] : [60, 40, 60]);
          await wait(1100);
          break;
        }
        case 'recall':
          setAnimSnap(ev.snap);
          sfx.select();
          await wait(300);
          break;
        case 'draw':
          setAnimSnap(ev.snap);
          if (ev.p === me && ev.count > 0) showToast(`カードを${ev.count}枚引いた`);
          await wait(150);
          break;
        case 'c4Plant':
          setAnimSnap(ev.snap);
          sfx.plant();
          shout('C4 PLANTED', sideColor(ev.p), 'lg', `${ZONE_LABELS[ev.zone]}：次のターン終了時に爆発`, 1400);
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
          zoneFx(ev.zone, 'explosion', undefined, 1100);
          sfx.explosion(true);
          vibrate([100, 50, 200]);
          setAnimSnap(ev.snap);
          shout('DETONATED', sideColor(ev.p), 'xl', '+2pt', 1300);
          await wait(1100);
          break;
        case 'score': {
          setAnimSnap(ev.snap);
          zoneFx(ev.zone, 'capture', sideColor(ev.p), 800);
          const c = center(zoneRefs.current[ev.zone]);
          if (c) addFx({ kind: 'pop', x: c.x, y: c.y, text: `+${ev.pts}pt`, color: sideColor(ev.p), big: true }, 1000);
          sfx.score();
          await wait(380);
          break;
        }
        case 'turnStart': {
          const gained = prev ? ev.snap.players[me].credits - prev.players[me].credits : 0;
          setAnimSnap(ev.snap);
          sfx.turn();
          shout(`TURN ${ev.turn}`, '#fff', 'md', gained > 0 ? `+${gained}¢ 収入` : undefined, 900);
          await wait(750);
          break;
        }
        case 'gameOver': {
          setAnimSnap(ev.snap);
          await wait(500);
          const won = ev.winner === me;
          if (ev.winner === 'draw') sfx.turn();
          else if (won) sfx.victory();
          else sfx.defeat();
          const r: MatchResult = {
            winner: ev.winner, reason: ev.reason, me, view: finalView,
            kills: finalView.self.kills, headshots: finalView.self.headshots, nuked: statsRef.current.nuked,
          };
          const rp = onFinish(r);
          setResult({ ...r, rp });
          break;
        }
      }
      prev = ev.snap;
    }
    if (!aliveRef.current) return;
    setRevealPlays(null);
    setAnimSnap(null);
    setView(finalView);
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
      },
    });
    return () => {
      aliveRef.current = false;
    };
  }, [conn, play]);

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

  const moveUnit = (uid: string, zone: ZoneId) => {
    if (addAction({ t: 'move', uid, zone })) setDetail(null);
  };

  const sendEmote = (id: EmoteId) => {
    setEmoteOpen(false);
    conn.emote(id);
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

  const renderUnit = (u: UnitSnap, side: PlayerId) => {
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

  return (
    <div
      className={`battle phase-${phase} has-art-bg`}
      style={{ '--screen-bg': 'url(./bgs/bg-battle.webp)' } as CSSProperties}
      ref={rootRef}
    >
      {/* Opponent HUD */}
      <div className="hud hud-opp">
        <div className="hud-name">
          <span className="dot" style={{ background: OPP_COLOR }} />
          <b>{conn.oppName}</b>
          <span className="deck-tag" style={{ color: oppDeck.color }}>{oppDeck.en}</span>
        </div>
        <div className="hud-stats">
          <span title="クレジット"><Coins size={12} />{players[opp].credits}</span>
          <span title="SP" className="sp">SP {players[opp].sp}</span>
          <span title="手札">✋{players[opp].handCount}</span>
          <span className={`ready ${oppReady ? 'on' : ''}`}>{oppReady ? 'READY' : phase === 'plan' || phase === 'waiting' ? '作戦中…' : ''}</span>
        </div>
        <ScoreBar score={oppScore} target={target} color={OPP_COLOR} />
        {emotes.filter((e) => !e.mine).map((e) => (
          <div key={e.key} className="emote-bubble opp">{EMOTES.find((x) => x.id === e.id)?.text}</div>
        ))}
      </div>
      {view.opp.hand && phase === 'plan' && (
        <div className="uav-hand">
          <span>UAV：相手の手札</span>
          {view.opp.hand.map((h) => <span key={h.hid} className="uav-card"><CardIcon cardId={h.cardId} size={12} />{card(h.cardId).en}</span>)}
        </div>
      )}

      <div className="turn-bar">
        <span>TURN <b>{board.turn}</b>/{view.config.maxTurns}</span>
        <span className="menu-btns">
          <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="ヘルプ"><CircleHelp size={16} /></button>
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="メニュー"><Flag size={16} /></button>
        </span>
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
          return (
            <div
              key={zi}
              className={`zone has-art ${zoneLegal ? 'legal' : ''} ${targets && !zoneLegal && targets.zones.length ? 'dim' : ''} ${z.smoked ? 'smoked' : ''}`}
              style={{
                '--zone-art': `url(./zones/${z.modId}.webp)`,
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
                <div className="zone-flags">
                  {z.c4 && <span className="c4" style={{ color: sideColor(z.c4.owner) }}><Bomb size={12} />{z.c4.explodeTurn === board.turn ? '!' : ''}</span>}
                  {z.fire[me] > 0 && <span style={{ color: ME_COLOR }}><Flame size={12} /></span>}
                  {z.fire[opp] > 0 && <span style={{ color: OPP_COLOR }}><Flame size={12} /></span>}
                </div>
                {pendingByZone[zi].length > 0 && <div className="zone-pending">{pendingByZone[zi].join(' / ')}</div>}
              </div>
              <div className="zone-mark" aria-hidden>
                <ZoneIcon size={44} strokeWidth={1.75} />
              </div>
              <div className="side side-opp">{oppUnits.map((u) => renderUnit(u, opp))}</div>
              <div className={`zone-line ${ctrl === me ? 'me' : ctrl === opp ? 'opp' : ''}`}>
                {ctrl === me ? '確保' : ctrl === opp ? '敵確保' : oppUnits.length && myUnits.length ? '交戦' : '—'}
              </div>
              <div className="side side-me">{myUnits.map((u) => renderUnit(u, me))}</div>
              {z.smoked && <div className="smoke-cloud" />}
            </div>
          );
        })}
      </div>

      {/* Kill feed */}
      <div className="killfeed">
        {feed.map((f) => (
          <div key={f.id} className="kf">
            {f.killer && <span className={f.killerMine ? 'me' : 'opp'}>{f.killer}</span>}
            {f.weapon ? <WeaponIcon kind={card(f.weapon).weaponClass!} size={10} /> : <span className="kf-src">{f.source === 'shot' ? '•' : f.source === 'c4' ? '💥' : f.source === 'fire' ? '🔥' : f.source === 'trap' ? '⚡' : '✱'}</span>}
            {f.hs && <span className="kf-hs">HS</span>}
            <span className={f.victimMine ? 'me' : 'opp'}>{f.victim}</span>
          </div>
        ))}
      </div>

      {/* Reveal banner */}
      {revealPlays && revealPlays.length > 0 && (
        <div className="reveal">
          <div className="reveal-title">相手のアクション</div>
          <div className="reveal-list">
            {revealPlays.map((p, i) => (
              <span key={i} className="reveal-item" style={{ animationDelay: `${i * 90}ms` }}>
                {p.t === 'streak' ? <StreakIcon id={p.id} size={12} /> : p.t === 'move' ? '⇢' : <CardIcon cardId={p.cardId} size={12} />}
                {p.t === 'streak' ? STREAKS[p.id].en : p.t === 'move' ? `ローテ→${ZONE_LABELS[p.zone]}` : card(p.cardId).en}
                {p.t === 'deploy' || p.t === 'tactic' ? (p.zone !== undefined ? `→${ZONE_LABELS[p.zone]}` : '') : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* My HUD */}
      <div className="hud hud-me">
        <div className="hud-row">
          <ScoreBar score={myScore} target={target} color={ME_COLOR} />
          <div className="credits"><Coins size={14} /><b>{credits}</b><span>¢</span></div>
          <button className="icon-btn" onClick={() => setEmoteOpen((o) => !o)} aria-label="エモート"><MessageCircle size={16} /></button>
        </div>
        <div className="streaks">
          <span className="sp-label">SP <b>{sp}</b></span>
          {STREAK_ORDER.map((id) => {
            const s = STREAKS[id];
            const queued = plan.actions.some((a) => a.t === 'streak' && a.id === id);
            const can = sp >= s.cost || queued;
            return (
              <button
                key={id}
                className={`streak ${can ? 'can' : ''} ${queued ? 'queued' : ''} ${sel?.kind === 'streak' && sel.id === id ? 'selected' : ''} streak-${id}`}
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
        {emotes.filter((e) => e.mine).map((e) => (
          <div key={e.key} className="emote-bubble mine">{EMOTES.find((x) => x.id === e.id)?.text}</div>
        ))}
        {emoteOpen && (
          <div className="emote-menu">
            {EMOTES.map((e) => <button key={e.id} onClick={() => sendEmote(e.id)}>{e.text}</button>)}
          </div>
        )}
      </div>

      {/* Planned actions */}
      <div className="plan-chips">
        {phase === 'plan' && plan.actions.length === 0 && !sel && <span className="plan-empty">カードをタップして作戦を立てよう</span>}
        {phase === 'plan' && sel && <span className="plan-hint">{hint}<button onClick={() => setSel(null)}><X size={12} /></button></span>}
        {phase === 'plan' && !sel && plan.actions.map((a, i) => {
          const d = describeAction(view, a);
          return (
            <button key={i} className="chip" onClick={() => removeAction(i)}>
              {d.label}<X size={10} />
            </button>
          );
        })}
        {phase === 'waiting' && <span className="plan-empty">相手の作戦を待っています…</span>}
        {phase === 'anim' && <button className="chip skip" onClick={() => (speedRef.current = 0.08)}>SKIP ▶▶</button>}
      </div>

      {/* Selected card preview */}
      {phase === 'plan' && selectedCard && (
        <div className="preview">
          <CardDetail cardId={selectedCard.cardId} compact />
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

      {/* Hand */}
      <div className="hand">
        {view.self.hand.map((h) => {
          const def = card(h.cardId);
          const used = usedHids.has(h.hid);
          return (
            <HandCard
              key={h.hid}
              cardId={h.cardId}
              cost={def.cost}
              used={used}
              selected={sel?.kind === 'hand' && sel.hid === h.hid}
              disabled={!used && def.cost > credits}
              onClick={() => onHandClick(h.hid)}
            />
          );
        })}
        {view.self.hand.length === 0 && <div className="hand-empty">手札なし</div>}
      </div>

      <div className="action-bar">
        <div className="deck-info">山札 {view.self.deckCount}</div>
        <button className="btn ready-btn" disabled={phase !== 'plan'} onClick={submit}>
          {phase === 'plan' ? (plan.actions.length ? `READY（${plan.actions.length}）` : 'READY（パス）') : phase === 'waiting' ? '待機中…' : phase === 'anim' ? '交戦中' : '試合終了'}
          {phase === 'plan' && timeLeft !== null && <span className={`timer ${timeLeft <= 10 ? 'warn' : ''}`}>{timeLeft}</span>}
        </button>
      </div>

      {/* FX layer */}
      <div className="fx-layer">
        {fx.map((f) => {
          switch (f.kind) {
            case 'tracer':
              return <div key={f.id} className={`fx-tracer ${f.hs ? 'hs' : ''}`} style={{ left: f.x, top: f.y, width: f.len, transform: `rotate(${f.angle}deg)`, '--c': f.color } as CSSProperties} />;
            case 'pop':
              return <div key={f.id} className={`fx-pop ${f.big ? 'big' : ''}`} style={{ left: f.x, top: f.y, color: f.color }}>{f.text}</div>;
            case 'zone':
              return <div key={f.id} className={`fx-zone fx-${f.effect}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--c': f.color } as CSSProperties} />;
            case 'skull':
              return <div key={f.id} className="fx-skull" style={{ left: f.x, top: f.y }}><Skull size={22} /></div>;
            case 'screen':
              return <div key={f.id} className={`fx-screen fx-screen-${f.effect}`}>{f.effect === 'nuke' && <Radiation size={96} />}</div>;
          }
        })}
      </div>

      {callout && (
        <div key={callout.key} className={`callout callout-${callout.size}`} style={{ '--c': callout.color } as CSSProperties}>
          <div className="callout-text">{callout.text}</div>
          {callout.sub && <div className="callout-sub">{callout.sub}</div>}
        </div>
      )}

      {toast && <div key={toast.key} className="toast" onAnimationEnd={() => setToast(null)}>{toast.text}</div>}

      {/* Unit detail */}
      {detail && (
        <div className="modal-bg" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={detail.cardId} unit={detail.unit} />
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
            <button className="btn primary" onClick={onExit}>タイトルへ</button>
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

function ScoreBar({ score, target, color }: { score: number; target: number; color: string }) {
  return (
    <div className="scorebar" style={{ '--c': color } as CSSProperties}>
      <div className="scorebar-num"><b>{score}</b>/{target}</div>
      <div className="scorebar-pips">
        {Array.from({ length: target }, (_, i) => <span key={i} className={i < score ? 'on' : ''} />)}
      </div>
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
  return (
    <div className="result-bg">
      <div className="result" style={{ '--c': color } as CSSProperties}>
        <div className="result-title">{outcome}</div>
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
          <div className={`result-rp ${result.rp > 0 ? 'up' : result.rp < 0 ? 'down' : ''}`}>{result.rp > 0 ? '+' : ''}{result.rp} RP</div>
        )}
        <div className="result-btns">
          {canRematch && <button className="btn primary" onClick={onRematch}>もう一戦</button>}
          <button className="btn ghost" onClick={onExit}>タイトルへ</button>
        </div>
      </div>
    </div>
  );
}
