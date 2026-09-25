import { ArrowLeftRight, Coins, Crosshair, Radiation, Skull } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  card, RESUPPLY_COST, STREAKS, ZONE_LABELS,
  type BoardSnap, type PublicPlay, type Rarity, type StreakId, type ZoneId,
} from '../../engine';
import { hasCardArt, Portrait } from './cards';
import { CardIcon, cardColor, RARITY_COLOR, StreakIcon } from './icons';

export const HS_COLOR = '#ffd54a';

/** Reveal-stage flip timing (ms). Also fed to CSS so sounds and flips line up. */
export const REVEAL_FLIP_AT = 450;
export const REVEAL_FLIP_GAP = 130;

export type ZoneEffect = 'flash' | 'explosion' | 'airstrike' | 'capture' | 'smoke' | 'fire';
export type PopTone = 'dmg' | 'hs' | 'heal' | 'buff' | 'info' | 'pts';

export type Fx =
  | { id: number; kind: 'tracer'; x: number; y: number; len: number; angle: number; color: string; hs?: boolean }
  | { id: number; kind: 'muzzle'; x: number; y: number; angle: number; color: string }
  | { id: number; kind: 'impact'; x: number; y: number; color: string; hs?: boolean; big?: boolean }
  | { id: number; kind: 'pop'; x: number; y: number; text: string; color: string; tone: PopTone }
  | { id: number; kind: 'zone'; x: number; y: number; w: number; h: number; effect: ZoneEffect; color?: string; label?: string; from?: 'top' | 'bottom' }
  | { id: number; kind: 'shatter'; x: number; y: number; w: number; h: number; cardId: string; color: string; hs: boolean }
  | { id: number; kind: 'land'; x: number; y: number; w: number; h: number; color: string }
  | { id: number; kind: 'reticle'; x: number; y: number; w: number; h: number }
  | { id: number; kind: 'spot'; x: number; y: number }
  | { id: number; kind: 'hsburst'; x: number; y: number }
  | { id: number; kind: 'trail'; x: number; y: number; len: number; angle: number; color: string }
  | { id: number; kind: 'screen'; effect: 'nuke' | 'hs' | 'engage' };

export type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, 'id'> : never) : never;

function Sparks({ n, seed, dist }: { n: number; seed: number; dist: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, k) => {
        const a = (360 / n) * k + (((seed * 53 + k * 29) % 24) - 12);
        const d = Math.round(dist * (0.65 + (((seed * 7 + k * 13) % 10) / 10) * 0.6));
        return <i key={k} className="fx-spark" style={{ '--a': `${a}deg`, '--d': `${d}px` } as CSSProperties} />;
      })}
    </>
  );
}

function ZoneFxBody({ f }: { f: Extract<Fx, { kind: 'zone' }> }) {
  switch (f.effect) {
    case 'explosion':
      return (
        <>
          <i className="zx-core" />
          <i className="zx-ring" />
          <i className="zx-ring zx-r2" />
          <Sparks n={10} seed={f.id} dist={70} />
        </>
      );
    case 'airstrike':
      return (
        <>
          <i className="zx-jet" />
          <i className="zx-core zx-a" />
          <i className="zx-core zx-b" />
          <i className="zx-core zx-c" />
          <i className="zx-ring" />
          <i className="zx-ring zx-r2" />
        </>
      );
    case 'capture':
      return (
        <>
          <i className={`zc-fill zc-${f.from ?? 'bottom'}`} />
          {f.label && <span className="zc-label">{f.label}</span>}
        </>
      );
    case 'flash':
      return <i className="zf-star" />;
    case 'smoke':
      return (
        <>
          <i className="zs-puff zs-1" />
          <i className="zs-puff zs-2" />
          <i className="zs-puff zs-3" />
        </>
      );
    case 'fire':
      return <i className="zfire-embers" />;
  }
}

export function FxView({ f }: { f: Fx }) {
  switch (f.kind) {
    case 'tracer':
      return (
        <div
          className={`fx-tracer ${f.hs ? 'hs' : ''}`}
          style={{ left: f.x, top: f.y, width: f.len, transform: `rotate(${f.angle}deg)`, '--c': f.color } as CSSProperties}
        >
          <i />
        </div>
      );
    case 'muzzle':
      return (
        <div className="fx-muzzle" style={{ left: f.x, top: f.y, transform: `rotate(${f.angle}deg)`, '--c': f.color } as CSSProperties}>
          <i />
        </div>
      );
    case 'impact':
      return (
        <div className={`fx-impact ${f.hs ? 'hs' : ''} ${f.big ? 'big' : ''}`} style={{ left: f.x, top: f.y, '--c': f.color } as CSSProperties}>
          <i className="fx-impact-ring" />
          <Sparks n={f.hs ? 12 : f.big ? 9 : 7} seed={f.id} dist={f.hs ? 46 : f.big ? 36 : 28} />
        </div>
      );
    case 'pop':
      return <div className={`fx-pop tone-${f.tone}`} style={{ left: f.x, top: f.y, '--c': f.color } as CSSProperties}>{f.text}</div>;
    case 'zone':
      return (
        <div className={`fx-zone fx-${f.effect}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--c': f.color } as CSSProperties}>
          <ZoneFxBody f={f} />
        </div>
      );
    case 'shatter': {
      const face = (
        <>
          <span className="sh-portrait"><Portrait cardId={f.cardId} size={36} /></span>
          <b>{card(f.cardId).en}</b>
        </>
      );
      // Angle of the cut from (0, 72%) to (100%, 30%) of the tile.
      const slash = (Math.atan2(-0.42 * f.h, f.w) * 180) / Math.PI;
      return (
        <div
          className={`fx-shatter ${f.hs ? 'hs' : ''}`}
          style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--c': f.color, '--sa': `${slash}deg` } as CSSProperties}
        >
          <div className="sh-half sh-a">{face}</div>
          <div className="sh-half sh-b">{face}</div>
          <i className="sh-slash" />
          <span className="sh-burst"><Sparks n={f.hs ? 12 : 8} seed={f.id} dist={f.hs ? 58 : 42} /></span>
          <span className="sh-tag">
            {f.hs ? <Crosshair size={11} strokeWidth={2.6} /> : <Skull size={11} strokeWidth={2.6} />}
            {f.hs ? 'HEADSHOT' : 'KILL'}
          </span>
        </div>
      );
    }
    case 'land':
      return (
        <div className="fx-land" style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--c': f.color } as CSSProperties}>
          <i className="ld-pillar" />
          <i className="ld-ring" />
          <i className="ld-frame" />
        </div>
      );
    case 'reticle':
      return (
        <div className="fx-reticle" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
          <i className="rt-c rt-tl" />
          <i className="rt-c rt-tr" />
          <i className="rt-c rt-bl" />
          <i className="rt-c rt-br" />
          <i className="rt-cross" />
          <span className="rt-label">LOCK ON</span>
        </div>
      );
    case 'spot':
      return <div className="fx-spot" style={{ '--x': `${f.x}px`, '--y': `${f.y}px` } as CSSProperties} />;
    case 'hsburst':
      return (
        <div className="fx-hsburst" style={{ left: f.x, top: f.y }}>
          <i className="hb-rays" />
          <i className="hb-ring" />
          <i className="hb-ring hb-r2" />
          <Sparks n={14} seed={f.id} dist={72} />
        </div>
      );
    case 'trail':
      return (
        <div
          className="fx-trail"
          style={{ left: f.x, top: f.y, width: f.len, transform: `rotate(${f.angle}deg)`, '--c': f.color } as CSSProperties}
        />
      );
    case 'screen':
      return <div className={`fx-screen fx-screen-${f.effect}`}>{f.effect === 'nuke' && <Radiation size={96} />}</div>;
  }
}

/* ───────── Reveal stage (simultaneous card reveal) ───────── */

export interface RevealItem {
  kind: 'card' | 'move' | 'resupply' | 'streak';
  cardId?: string;
  streak?: StreakId;
  title: string;
  tag: string;
  /** Zone the card flies to when the stage closes. */
  zone?: ZoneId;
  rarity: Rarity | 'none';
}

export interface RevealState {
  key: number;
  enemy: RevealItem[];
  mine: RevealItem[];
  leaving: boolean;
}

/** Turn public plays into display cards. `snap` is the board before the turn resolves. */
export function revealItems(plays: PublicPlay[], all: PublicPlay[], snap: BoardSnap): RevealItem[] {
  const unitAt = (uid?: string): { cardId: string; zone: ZoneId } | undefined => {
    if (!uid) return undefined;
    for (const z of snap.zones) for (const side of z.units) for (const u of side) if (u.uid === uid) return { cardId: u.cardId, zone: u.zone };
    for (const p of all) if (p.t === 'deploy' && p.uid === uid) return { cardId: p.cardId, zone: p.zone };
    return undefined;
  };
  return plays.map((p): RevealItem => {
    switch (p.t) {
      case 'deploy': {
        const d = card(p.cardId);
        return { kind: 'card', cardId: d.id, title: d.en, tag: `→ ${ZONE_LABELS[p.zone]}`, zone: p.zone, rarity: d.rarity };
      }
      case 'gear': {
        const d = card(p.cardId);
        const u = unitAt(p.uid);
        return { kind: 'card', cardId: d.id, title: d.en, tag: u ? `→ ${card(u.cardId).en}` : '装備', zone: u?.zone, rarity: d.rarity };
      }
      case 'tactic': {
        const d = card(p.cardId);
        const u = unitAt(p.uid);
        const tag = p.zone !== undefined ? `→ ${ZONE_LABELS[p.zone]}` : u ? `→ ${card(u.cardId).en}` : '戦術';
        return { kind: 'card', cardId: d.id, title: d.en, tag, zone: p.zone ?? u?.zone, rarity: d.rarity };
      }
      case 'move': {
        const u = unitAt(p.uid);
        return { kind: 'move', cardId: u?.cardId, title: u ? card(u.cardId).en : 'ROTATE', tag: `ローテ → ${ZONE_LABELS[p.zone]}`, zone: p.zone, rarity: 'none' };
      }
      case 'streak':
        return {
          kind: 'streak', streak: p.id, title: STREAKS[p.id].en,
          tag: p.zone !== undefined ? `→ ${ZONE_LABELS[p.zone]}` : STREAKS[p.id].name, zone: p.zone, rarity: 'none',
        };
      case 'resupply':
        return { kind: 'resupply', title: 'SUPPLY', tag: `補給 ${RESUPPLY_COST}¢`, rarity: 'none' };
    }
  });
}

function RevealCard({ item, i, faceDown }: { item: RevealItem; i: number; faceDown?: boolean }) {
  const color = item.cardId ? cardColor(item.cardId) : item.kind === 'streak' ? '#ff4655' : '#ffb547';
  const rim = item.rarity === 'none' ? (item.kind === 'streak' ? '#ff4655' : '#7d8b9c') : RARITY_COLOR[item.rarity];
  let art: ReactNode = null;
  if (item.kind === 'streak' && item.streak) art = <StreakIcon id={item.streak} size={26} />;
  else if (item.kind === 'resupply') art = <Coins size={24} />;
  else if (item.cardId && hasCardArt(item.cardId)) art = <Portrait cardId={item.cardId} size={96} />;
  else if (item.cardId) art = <CardIcon cardId={item.cardId} size={24} />;
  const cost = item.kind === 'card' && item.cardId ? card(item.cardId).cost : undefined;
  return (
    <div
      className={`rv-card rv-k-${item.kind} r-${item.rarity}`}
      style={{ '--i': i, '--c': color, '--r': rim } as CSSProperties}
      data-zone={item.zone ?? ''}
    >
      <div className="rv-card-inner">
        {faceDown && <div className="rv-back"><i className="rv-emblem" /></div>}
        <div className="rv-front">
          <div className="rv-art">{art}</div>
          <div className="rv-shade" />
          {cost !== undefined && <div className="rv-cost">{cost}</div>}
          {item.kind === 'move' && <div className="rv-badge"><ArrowLeftRight size={10} strokeWidth={2.6} /></div>}
          <div className="rv-name">{item.title}</div>
        </div>
      </div>
      <div className="rv-tag">{item.tag}</div>
    </div>
  );
}

export function RevealStage({ r }: { r: RevealState }) {
  const n = r.enemy.length;
  const m = r.mine.length;
  const ew = n <= 4 ? 72 : n <= 5 ? 62 : n <= 6 ? 54 : 46;
  const mw = m <= 6 ? 42 : 36;
  const count = (k: number, none: string) => (k ? `${k} ACTION${k > 1 ? 'S' : ''}` : none);
  return (
    <div
      className={`rv-stage ${r.leaving ? 'leaving' : ''}`}
      style={{ '--flip-at': `${REVEAL_FLIP_AT}ms`, '--flip-gap': `${REVEAL_FLIP_GAP}ms` } as CSSProperties}
    >
      <div className="rv-dim" />
      <div className="rv-head">
        <b data-text="REVEAL">REVEAL</b>
        <small>作戦公開</small>
      </div>
      <div className="rv-side rv-opp">
        <div className="rv-label"><i />ENEMY<span>{count(n, 'NO ACTION')}</span><i /></div>
        {n > 0 ? (
          <div className="rv-cards" style={{ '--w': `${ew}px` } as CSSProperties}>
            {r.enemy.map((it, i) => <RevealCard key={i} item={it} i={i} faceDown />)}
          </div>
        ) : (
          <div className="rv-none">相手は動かなかった</div>
        )}
      </div>
      <div className="rv-vs"><span>VS</span></div>
      <div className="rv-side rv-me">
        {m > 0 ? (
          <div className="rv-cards" style={{ '--w': `${mw}px` } as CSSProperties}>
            {r.mine.map((it, i) => <RevealCard key={i} item={it} i={i} />)}
          </div>
        ) : (
          <div className="rv-none">パス</div>
        )}
        <div className="rv-label"><i />YOU<span>{count(m, 'PASS')}</span><i /></div>
      </div>
    </div>
  );
}

/* ───────── Card cut-in (tactics / killstreaks) ───────── */

export interface CutIn {
  key: number;
  side: 'me' | 'opp';
  color: string;
  label: string;
  title: string;
  sub: string;
  cardId?: string;
  streak?: StreakId;
  fizzle?: boolean;
}

export function CutInView({ c }: { c: CutIn }) {
  let art: ReactNode = null;
  if (c.cardId && hasCardArt(c.cardId)) art = <Portrait cardId={c.cardId} size={120} />;
  else if (c.cardId) art = <CardIcon cardId={c.cardId} size={30} />;
  else if (c.streak) art = <StreakIcon id={c.streak} size={34} />;
  return (
    <div className={`cutin cutin-${c.side} ${c.fizzle ? 'fizzle' : ''}`} style={{ '--c': c.color } as CSSProperties}>
      <div className="cutin-band"><i className="cutin-sweep" /></div>
      <div className={`cutin-card ${c.streak ? 'is-streak' : ''}`}>
        <div className="cutin-art">{art}</div>
        {c.cardId && <div className="cutin-cost">{card(c.cardId).cost}</div>}
      </div>
      <div className="cutin-text">
        <small>{c.label}</small>
        <b>{c.title}</b>
        <span>{c.fizzle ? '不発…' : c.sub}</span>
      </div>
    </div>
  );
}

/* ───────── Banner callouts ───────── */

export type CalloutVariant = 'default' | 'turn' | 'engage' | 'hs' | 'multi' | 'ace' | 'alert';

export interface Callout {
  key: number;
  text: string;
  sub?: string;
  color: string;
  size: 'xl' | 'lg' | 'md';
  variant: CalloutVariant;
  /** Total on-screen time (ms); drives the CSS animation length. */
  life: number;
  /** Skull count for multikill banners. */
  count?: number;
}

export function CalloutView({ c }: { c: Callout }) {
  return (
    <div className={`callout callout-${c.size} cv-${c.variant}`} style={{ '--c': c.color, '--life': `${c.life}ms` } as CSSProperties}>
      <div className="callout-band"><i /></div>
      {c.count !== undefined && c.count > 0 && (
        <div className="cv-skulls">
          {Array.from({ length: Math.min(c.count, 6) }, (_, i) => (
            <Skull key={i} size={20} strokeWidth={2.4} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      <div className="callout-row">
        {c.variant === 'hs' && <span className="cv-icon"><Crosshair size={34} strokeWidth={2.2} /></span>}
        <div className="callout-text" data-text={c.text}>{c.text}</div>
      </div>
      {c.sub && <div className="callout-sub"><span>{c.sub}</span></div>}
    </div>
  );
}
