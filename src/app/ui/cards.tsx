import { Crosshair, EyeOff, Ghost, Heart, Shield, Swords } from 'lucide-react';
import { forwardRef, type CSSProperties, type MouseEventHandler } from 'react';
import { card, hasAbility, type Unit, type UnitSnap } from '../../engine';
import { CardIcon, cardColor, RARITY_COLOR, ROLE_COLOR, ROLE_LABEL, WeaponIcon } from './icons';
import { publicAsset } from './assets';
import { cardKeywords, TYPE_LABEL } from './text';

const CARD_ART_IDS = [
  // operators
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
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
] as const;

const OPERATOR_ANIM_SET = new Set<string>(OPERATOR_ANIM_IDS);

function cardArtSrc(id: string): string {
  return publicAsset(`portraits/${id}.webp`);
}

/** Pre-baked motion-analyzed loop GIF (see `npm run portraits:anim`). */
function cardAnimSrc(id: string): string {
  return publicAsset(`portraits/anim/${id}.gif`);
}

export function hasCardArt(cardId: string): boolean {
  return (CARD_ART_IDS as readonly string[]).includes(cardId);
}

export function hasPortraitAnim(cardId: string): boolean {
  return OPERATOR_ANIM_SET.has(cardId);
}

/** Ordered list of operators that have baked motion GIFs. */
export function portraitAnimIds(): readonly string[] {
  return OPERATOR_ANIM_IDS;
}

/** Neon card portrait. Animation-rare swaps the still for an analyzed looping GIF. */
export function Portrait({ cardId, size = 56, flow }: { cardId: string; size?: number; flow?: boolean }) {
  const def = card(cardId);
  const accent = cardColor(cardId);
  const useAnim = Boolean(flow && hasPortraitAnim(cardId));
  const src = hasCardArt(cardId)
    ? (useAnim ? cardAnimSrc(cardId) : cardArtSrc(cardId))
    : undefined;
  if (src) {
    return (
      <img
        className={`portrait${useAnim ? ' portrait-anim' : ''}`}
        src={src}
        alt={def.en}
        width={size}
        height={size}
        draggable={false}
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

export function StatRow({ atk, hp, aim, base, size = 'sm' }: {
  atk: number; hp: number; aim: number;
  base?: { atk: number; hp: number; aim: number };
  size?: 'sm' | 'lg';
}) {
  const cls = (v: number, b?: number) => (b === undefined ? '' : v > b ? 'up' : v < b ? 'down' : '');
  const s = size === 'lg' ? 14 : 10;
  return (
    <div className={`stats stats-${size}`}>
      <span className={`st atk ${cls(atk, base?.atk)}`}><Swords size={s} />{atk}</span>
      <span className={`st hp ${cls(hp, base?.hp)}`}><Heart size={s} />{hp}</span>
      <span className={`st aim ${cls(aim, base?.aim)}`}><Crosshair size={s} />{aim}</span>
    </div>
  );
}

export function HandCard({ cardId, cost, selected, disabled, used, kira, flow, onClick }: {
  cardId: string;
  cost: number;
  selected?: boolean;
  disabled?: boolean;
  used?: boolean;
  /** Gold-border glossy variant (operators). */
  kira?: boolean;
  /** Portrait motion animation (rare gacha cosmetic). */
  flow?: boolean;
  onClick?: MouseEventHandler;
}) {
  const def = card(cardId);
  const color = cardColor(cardId);
  const art = hasCardArt(cardId);
  return (
    <button
      className={`hcard ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${used ? 'used' : ''} ${kira ? 'kira' : ''} ${flow ? 'flow' : ''} type-${def.type} ${art ? 'has-art' : ''}`}
      style={{ '--c': color, '--r': RARITY_COLOR[def.rarity] } as CSSProperties}
      onClick={onClick}
    >
      <div className="hcard-art" aria-hidden>
        {art ? <Portrait cardId={cardId} size={140} flow={flow} /> : <CardIcon cardId={cardId} size={36} />}
      </div>
      <div className="hcard-shade" aria-hidden />
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

export function CardDetail({ cardId, unit, compact, kira, flow }: {
  cardId: string;
  unit?: UnitSnap;
  compact?: boolean;
  kira?: boolean;
  flow?: boolean;
}) {
  const def = card(cardId);
  const color = cardColor(cardId);
  const kws = cardKeywords(cardId).filter((k) => !def.text?.includes(`【${k.name}】`));
  const extra = [unit?.weapon, unit?.armor].filter(Boolean) as string[];
  const isOp = def.type === 'operator';
  const art = hasCardArt(cardId);
  return (
    <div className={`cdetail ${compact ? 'compact' : ''} type-${def.type} ${art ? 'has-art' : ''} ${kira ? 'kira' : ''}`} style={{ '--c': color, '--r': RARITY_COLOR[def.rarity] } as CSSProperties}>
      {art && (
        <div className="cdetail-hero" aria-hidden>
          <Portrait cardId={cardId} size={compact ? 220 : 360} flow={flow} />
          <div className="cdetail-hero-shade" />
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
  onClick?: MouseEventHandler;
}

export const UnitTile = forwardRef<HTMLDivElement, UnitTileProps>(function UnitTile({ u, mine, state, badges, flow, onClick }, ref) {
  const def = card(u.cardId);
  const role = def.role ?? 'assault';
  const guard = hasAbility(u as unknown as Unit, 'guard');
  const hpPct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  return (
    <div
      ref={ref}
      className={`unit ${mine ? 'mine' : 'enemy'} ${state ?? ''} ${u.flashed ? 'flashed' : ''} ${u.hp <= 0 ? 'dead' : ''}`}
      style={{ '--role': ROLE_COLOR[role] } as CSSProperties}
      onClick={onClick}
      data-uid={u.uid}
    >
      <div className="unit-portrait"><Portrait cardId={u.cardId} size={30} flow={flow} /></div>
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
        <StatRow atk={u.atk} hp={u.hp} aim={u.aim} base={{ atk: def.atk!, hp: u.maxHp, aim: def.aim! }} />
      </div>
      <div className="unit-hpbar"><div style={{ width: `${hpPct * 100}%` }} /></div>
      {badges && badges.length > 0 && (
        <div className="unit-badges">{badges.map((b, i) => <span key={i}>{b}</span>)}</div>
      )}
    </div>
  );
});
