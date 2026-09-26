import { Crosshair, EyeOff, Ghost, Heart, Shield, Swords } from 'lucide-react';
import { forwardRef, useEffect, useState, type CSSProperties, type MouseEventHandler } from 'react';
import { card, hasAbility, type Unit, type UnitSnap } from '../../engine';
import { CardIcon, cardColor, RARITY_COLOR, ROLE_COLOR, ROLE_LABEL, WeaponIcon } from './icons';
import { publicAsset } from './assets';
import { cardKeywords, TYPE_LABEL } from './text';

const CARD_ART_IDS = [
  // operators
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
  'pup', 'bit', 'lace', 'mochi', 'chirp', 'nibble', 'silk', 'bean',
  'ember', 'frost', 'lock', 'key', 'nova', 'orbit', 'fang', 'claw', 'volt', 'amp',
  'chum', 'dot',
  'beacon', 'brute', 'salvo', 'goliath', 'juggernaut', 'havoc',
  // gear
  'smg', 'knife', 'vest', 'ar', 'shotgun', 'heavyarmor', 'sniper', 'lmg',
  'railgun', 'hexscope', 'banerounds', 'bombvest',
  // tactics
  'eco', 'fallback', 'smoke', 'flashbang', 'stim', 'drone', 'focusfire', 'frag', 'molotov', 'precision', 'reinforce', 'c4',
] as const;

const OPERATOR_ANIM_IDS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
  'pup', 'bit', 'lace', 'mochi', 'chirp', 'nibble', 'silk', 'bean',
  'ember', 'frost', 'lock', 'key', 'nova', 'orbit', 'fang', 'claw', 'volt', 'amp',
  'chum', 'dot',
  'beacon', 'brute', 'salvo', 'goliath', 'juggernaut', 'havoc',
] as const;

const OPERATOR_ANIM_SET = new Set<string>(OPERATOR_ANIM_IDS);

function cardArtSrc(id: string): string {
  return publicAsset(`portraits/${id}.webp`);
}

/** Portraits drawn at or below this CSS size use the 256px loop; larger ones use 512px. */
const ANIM_SMALL_MAX = 160;

/** Pre-baked looping animated WebP (see `npm run portraits:anim`). */
function cardAnimSrc(id: string, size: number): string {
  return publicAsset(size <= ANIM_SMALL_MAX ? `portraits/anim/sm/${id}.webp` : `portraits/anim/${id}.webp`);
}

export function hasCardArt(cardId: string): boolean {
  return (CARD_ART_IDS as readonly string[]).includes(cardId);
}

export function hasPortraitAnim(cardId: string): boolean {
  return OPERATOR_ANIM_SET.has(cardId);
}

/** Warm the image cache so revealed cards don't flip over to blank art. */
export function preloadCardArt(ids: Iterable<string>) {
  for (const id of new Set(ids)) {
    if (!hasCardArt(id)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = cardArtSrc(id);
  }
}

/** Ordered list of operators that have baked motion GIFs. */
export function portraitAnimIds(): readonly string[] {
  return OPERATOR_ANIM_IDS;
}

/** Transparent neon signature stamp overlaid on operator portraits. */
export function SignatureMark({ cardId, className = '' }: { cardId: string; className?: string }) {
  return (
    <img
      className={`card-sign ${className}`.trim()}
      src={publicAsset(`signatures/${cardId}.png?v=5`)}
      alt=""
      draggable={false}
      decoding="async"
      aria-hidden
    />
  );
}

/** Neon card portrait. Animation-rare swaps the still for a generated looping animation. */
export function Portrait({ cardId, size = 56, flow }: { cardId: string; size?: number; flow?: boolean }) {
  const def = card(cardId);
  const accent = cardColor(cardId);
  const wantAnim = Boolean(flow && hasPortraitAnim(cardId));
  const still = hasCardArt(cardId) ? cardArtSrc(cardId) : undefined;
  const anim = wantAnim ? cardAnimSrc(cardId, size) : undefined;
  const [src, setSrc] = useState<string | undefined>(anim ?? still);

  useEffect(() => {
    setSrc(anim ?? still);
  }, [anim, still]);

  if (still || anim) {
    return (
      <img
        className={`portrait${wantAnim && src === anim ? ' portrait-anim' : ''}`}
        src={src ?? still}
        alt={def.en}
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        onError={() => {
          if (still && src !== still) setSrc(still);
        }}
        style={{ width: size, height: size, '--role': accent } as CSSProperties}
      />
    );
  }
  return (
    <div
      className="portrait portrait-fallback"
      style={{ width: size, height: size, '--role': accent } as CSSProperties}
      aria-label={def.en}
    >
      {def.en.slice(0, 1)}
    </div>
  );
}

const statCls = (v: number, b?: number) => (b === undefined ? '' : v > b ? 'up' : v < b ? 'down' : '');

export function StatRow({ atk, hp, aim, base, size = 'sm', showAim = true }: {
  atk: number; hp: number; aim: number;
  base?: { atk: number; hp: number; aim: number };
  size?: 'sm' | 'md' | 'lg';
  showAim?: boolean;
}) {
  const s = size === 'lg' ? 14 : size === 'md' ? 12 : 10;
  return (
    <div className={`stats stats-${size}`}>
      <span className={`st atk ${statCls(atk, base?.atk)}`}><Swords size={s} />{atk}</span>
      <span className={`st hp ${statCls(hp, base?.hp)}`}><Heart size={s} />{hp}</span>
      {showAim && <span className={`st aim ${statCls(aim, base?.aim)}`}><Crosshair size={s} />{aim}</span>}
    </div>
  );
}

/** One-line card summary for the in-battle selection preview (the lifted hand card already shows the art). */
export function CardStrip({ cardId }: { cardId: string }) {
  const def = card(cardId);
  const isOp = def.type === 'operator';
  return (
    <div className={`cstrip type-${def.type}`} style={{ '--c': cardColor(cardId), '--r': RARITY_COLOR[def.rarity] } as CSSProperties}>
      <div className="cstrip-cost">{def.cost}</div>
      <div className="cstrip-main">
        <div className="cstrip-head">
          <b>{def.en}</b>
          <span>{def.name}</span>
          <em>{isOp ? ROLE_LABEL[def.role!] : TYPE_LABEL[def.type]}</em>
          {isOp && <StatRow size="md" atk={def.atk!} hp={def.hp!} aim={def.aim!} />}
        </div>
        {def.text && <p className="cstrip-text">{def.text}</p>}
      </div>
    </div>
  );
}

export function HandCard({ cardId, cost, selected, disabled, used, kira, sign, flow, artSize = 140, onClick }: {
  cardId: string;
  cost: number;
  selected?: boolean;
  disabled?: boolean;
  used?: boolean;
  /** Gold-border glossy variant (operators). */
  kira?: boolean;
  /** Neon signature overlay (operators). */
  sign?: boolean;
  /** Portrait motion animation (battle-unlock cosmetic). */
  flow?: boolean;
  /** Rendered portrait size; picks the motion loop resolution. */
  artSize?: number;
  onClick?: MouseEventHandler;
}) {
  const def = card(cardId);
  const color = cardColor(cardId);
  const art = hasCardArt(cardId);
  const showSign = Boolean(sign && def.type === 'operator');
  return (
    <button
      className={`hcard ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${used ? 'used' : ''} ${kira ? 'kira' : ''} ${showSign ? 'sign' : ''} ${flow ? 'flow' : ''} type-${def.type} ${art ? 'has-art' : ''}`}
      style={{ '--c': color, '--r': RARITY_COLOR[def.rarity] } as CSSProperties}
      onClick={onClick}
    >
      <div className="hcard-art" aria-hidden>
        {art ? <Portrait cardId={cardId} size={artSize} flow={flow} /> : <CardIcon cardId={cardId} size={36} />}
      </div>
      <div className="hcard-shade" aria-hidden />
      {showSign && <SignatureMark cardId={cardId} className="hcard-sign" />}
      {kira && <div className="hcard-kira-foil" aria-hidden />}
      <div className="hcard-cost">{cost}</div>
      <div className="hcard-footer">
        <div className="hcard-name">{def.en}</div>
        {def.type === 'operator' ? (
          <StatRow atk={def.atk!} hp={def.hp!} aim={def.aim!} />
        ) : (
          <div className="hcard-type">{TYPE_LABEL[def.type]}</div>
        )}
      </div>
      {used && <div className="hcard-used">予約済</div>}
    </button>
  );
}

export function CardDetail({ cardId, unit, compact, kira, sign, flow }: {
  cardId: string;
  unit?: UnitSnap;
  compact?: boolean;
  kira?: boolean;
  sign?: boolean;
  flow?: boolean;
}) {
  const def = card(cardId);
  const color = cardColor(cardId);
  const kws = cardKeywords(cardId);
  const extra = [unit?.weapon, unit?.armor].filter(Boolean) as string[];
  const isOp = def.type === 'operator';
  const art = hasCardArt(cardId);
  const showSign = Boolean(sign && isOp);
  return (
    <div className={`cdetail ${compact ? 'compact' : ''} type-${def.type} ${art ? 'has-art' : ''} ${kira ? 'kira' : ''} ${showSign ? 'sign' : ''}`} style={{ '--c': color, '--r': RARITY_COLOR[def.rarity] } as CSSProperties}>
      {art && (
        <div className="cdetail-hero" aria-hidden>
          <Portrait cardId={cardId} size={compact ? 220 : 360} flow={flow} />
          <div className="cdetail-hero-shade" />
          {showSign && <SignatureMark cardId={cardId} className="cdetail-sign" />}
          {kira && <div className="cdetail-kira-foil" aria-hidden />}
        </div>
      )}
      <div className="cdetail-body">
        <div className="cdetail-head">
          <div className="cdetail-cost">{def.cost}</div>
          <div className="cdetail-title">
            <div className="cdetail-en">{def.en}</div>
            <div className="cdetail-name">
              {def.name}
              <span className="cdetail-type">
                {isOp ? ROLE_LABEL[def.role!] : TYPE_LABEL[def.type]}
                {def.speed !== undefined && def.type === 'tactic' ? `・速${def.speed}` : ''}
              </span>
            </div>
          </div>
          {!art && (
            <div className="cdetail-art">
              <CardIcon cardId={cardId} size={compact ? 28 : 36} />
            </div>
          )}
        </div>
        {isOp && (
          <StatRow
            size="lg"
            atk={unit?.atk ?? def.atk!}
            hp={unit?.hp ?? def.hp!}
            aim={unit?.aim ?? def.aim!}
            base={unit ? { atk: def.atk!, hp: unit.maxHp, aim: def.aim! } : undefined}
          />
        )}
        {def.text && <div className="cdetail-text">{def.text}</div>}
        {kws.length > 0 && !compact && (
          <div className="cdetail-kws">
            {kws.map((k) => (
              <div key={k.name}><b>【{k.name}】</b>{k.text}</div>
            ))}
          </div>
        )}
        {extra.length > 0 && (
          <div className="cdetail-gear">
            {extra.map((g) => (
              <span key={g}><WeaponIcon kind={card(g).weaponClass!} size={12} /> {card(g).name}（{card(g).text}）</span>
            ))}
          </div>
        )}
        {unit && unit.kills > 0 && <div className="cdetail-kills">このユニットのキル数: {unit.kills}</div>}
        {def.flavor && !compact && <div className="cdetail-flavor">“{def.flavor}”</div>}
      </div>
    </div>
  );
}

export interface UnitTileProps {
  u: UnitSnap;
  mine: boolean;
  state?: 'legal' | 'selected' | 'moving' | 'ghost' | 'dim';
  badges?: string[];
  flow?: boolean;
  /** Predicted firing tier in a contested zone (1 = shoots first). */
  order?: number;
  onClick?: MouseEventHandler;
}

export const UnitTile = forwardRef<HTMLDivElement, UnitTileProps>(function UnitTile({ u, mine, state, badges, flow, order, onClick }, ref) {
  const def = card(u.cardId);
  const role = def.role ?? 'assault';
  const guard = hasAbility(u as unknown as Unit, 'guard');
  const hpPct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  const hpColor = hpPct > 0.6 ? '#6ee7a0' : hpPct > 0.3 ? '#ffc94d' : '#ff5a5a';
  return (
    <div
      ref={ref}
      className={`unit ${mine ? 'mine' : 'enemy'} ${state ?? ''} ${u.flashed ? 'flashed' : ''} ${u.stealth ? 'stealth' : ''} ${u.hp <= 0 ? 'dead' : ''}`}
      style={{ '--role': ROLE_COLOR[role] } as CSSProperties}
      onClick={onClick}
      data-uid={u.uid}
    >
      <div className="unit-portrait"><Portrait cardId={u.cardId} size={34} flow={flow} /></div>
      {order !== undefined && <span className="unit-order" aria-label={`射撃順 ${order}`}>{order}</span>}
      <div className="unit-body">
        <div className="unit-top">
          <span className="unit-name">{def.en}</span>
          <span className="unit-icons">
            {guard && <Shield size={10} />}
            {u.stealth && <Ghost size={10} />}
            {u.flashed && <EyeOff size={10} />}
            {u.weapon && <WeaponIcon kind={card(u.weapon).weaponClass!} size={9} />}
          </span>
        </div>
        <StatRow atk={u.atk} hp={u.hp} aim={u.aim} base={{ atk: def.atk!, hp: u.maxHp, aim: def.aim! }} showAim={false} />
      </div>
      <div className={`unit-aim ${statCls(u.aim, def.aim!)}`} aria-label={`AIM ${u.aim}`}>
        <Crosshair size={10} strokeWidth={2.6} />
        <b>{u.aim}</b>
      </div>
      <div className="unit-hpbar" style={{ '--seg': Math.max(1, u.maxHp) } as CSSProperties}>
        <i className="unit-hplag" style={{ width: `${hpPct * 100}%` }} />
        <div style={{ width: `${hpPct * 100}%`, '--hpc': hpColor } as CSSProperties} />
      </div>
      {badges && badges.length > 0 && (
        <div className="unit-badges">{badges.map((b, i) => <span key={i}>{b}</span>)}</div>
      )}
    </div>
  );
});
