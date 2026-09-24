import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { card, type Rarity } from '../../engine';
import { sfx, vibrate } from '../sfx';
import { publicAsset } from '../ui/assets';
import { CardDetail, HandCard } from '../ui/cards';
import { RARITY_COLOR } from '../ui/icons';

type Phase = 'intro' | 'ready' | 'charging' | 'burst' | 'reveal';

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };
const RARITY_LABEL: Record<Rarity, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legend: 'LEGEND' };
/** Wait before the next card flips during "flip all", long enough for that rarity's effect. */
const FLIP_GAP: Record<Rarity, number> = { common: 380, rare: 420, epic: 760, legend: 2700 };

export function PackOpening({ cards, kira, flow, fresh, onClose, onAgain, againLabel }: {
  cards: string[];
  /** Per slot: kira result already decided at pull time (operators only). */
  kira: boolean[];
  /** Per slot: hair-flow cosmetic already decided at pull time. */
  flow: boolean[];
  /** Per slot: true when this pull is the player's first copy. */
  fresh: boolean[];
  onClose: () => void;
  onAgain?: () => void;
  againLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false));
  const [spotlight, setSpotlight] = useState<number | null>(null);
  const [burstAt, setBurstAt] = useState<number | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [flippingAll, setFlippingAll] = useState(false);
  const timers = useRef<number[]>([]);
  const dragX = useRef<number | null>(null);
  const torn = useRef(false);

  const rarities = cards.map((id) => card(id).rarity);
  const top = rarities.reduce<Rarity>((a, r) => (RARITY_RANK[r] > RARITY_RANK[a] ? r : a), 'common');
  const allOpen = flipped.every(Boolean);
  const multi = cards.length > 6;
  const dealStep = multi ? 45 : 140;
  const flipGapScale = multi ? 0.45 : 1;

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => {
    later(650, () => setPhase('ready'));
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const particles = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${-((i * 0.53) % 6)}s`,
      dur: `${5 + ((i * 1.7) % 4)}s`,
      size: `${2 + (i % 3)}px`,
    })),
    [],
  );

  const tear = () => {
    if (phase !== 'ready' || torn.current) return;
    torn.current = true;
    setPhase('charging');
    sfx.packCharge();
    vibrate([20, 40, 20, 40, 30]);
    later(950, () => {
      setPhase('burst');
      sfx.packOpen();
      vibrate(60);
    });
    later(1550, () => {
      setPhase('reveal');
      cards.forEach((_, i) => later(i * dealStep, () => sfx.cardDeal()));
    });
  };

  const onPackDown = (e: PointerEvent) => {
    dragX.current = e.clientX;
  };
  const onPackMove = (e: PointerEvent) => {
    const start = dragX.current;
    if (start !== null && Math.abs(e.clientX - start) > 40) {
      dragX.current = null;
      tear();
    }
  };

  const reveal = (i: number) => {
    const r = rarities[i];
    const isKira = kira[i];
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
    sfx.cardFlip(r);
    if (isKira) {
      vibrate([30, 40, 30]);
      setBurstAt(i);
      later(900, () => setBurstAt((b) => (b === i ? null : b)));
    }
    if (r === 'legend') {
      vibrate([40, 60, 120]);
      later(380, () => setSpotlight(i));
    } else if (r === 'epic' && !isKira) {
      vibrate(40);
      setBurstAt(i);
      later(900, () => setBurstAt((b) => (b === i ? null : b)));
    }
  };

  const flip = (i: number) => {
    if (phase !== 'reveal' || flipped[i] || spotlight !== null || flippingAll) return;
    reveal(i);
  };

  const flipAll = () => {
    setFlippingAll(true);
    let at = 0;
    cards.forEach((_, i) => {
      if (flipped[i]) return;
      later(at, () => reveal(i));
      at += Math.max(90, (FLIP_GAP[rarities[i]] + (kira[i] ? 120 : 0)) * flipGapScale);
    });
    later(at, () => setFlippingAll(false));
  };

  useEffect(() => {
    if (spotlight === null) return;
    const t = window.setTimeout(() => setSpotlight(null), 2300);
    return () => window.clearTimeout(t);
  }, [spotlight]);

  return (
    <div className={`screen pack-screen phase-${phase}${multi ? ' pack-multi' : ''}`} style={{ '--hi': RARITY_COLOR[top] } as CSSProperties}>
      <div className="pack-bg" aria-hidden>
        <div className="pack-bg-rays" />
        {particles.map((p, i) => (
          <span
            key={i}
            className="pack-mote"
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, width: p.size, height: p.size }}
          />
        ))}
      </div>

      <div className="pack-head">
        <span>OPERATOR SUPPLY{multi ? ' ×10' : ''}</span>
        <b>{phase === 'reveal' ? (allOpen ? `獲得カード（${cards.length}枚）` : 'タップしてめくる') : 'パックを開封'}</b>
      </div>

      <div className="pack-stage">
        {phase !== 'reveal' && (
          <button
            className="pack"
            onClick={tear}
            onPointerDown={onPackDown}
            onPointerMove={onPackMove}
            onPointerUp={() => { dragX.current = null; }}
            aria-label="パックを開ける"
          >
            <span className="pack-half pack-lid"><img src={publicAsset('packs/operator.webp')} alt="" draggable={false} /></span>
            <span className="pack-half pack-body"><img src={publicAsset('packs/operator.webp')} alt="" draggable={false} /></span>
            <span className="pack-foil" />
            <span className="pack-title"><b>DECK<i>SHOT</i></b><small>OPERATOR SUPPLY ×{cards.length}</small></span>
            <span className="pack-seam" />
          </button>
        )}
        {phase === 'burst' && <div className="pack-flash" />}

        {phase === 'reveal' && (
          <div className={`pack-cards${multi ? ' multi' : ''}`}>
            {cards.map((id, i) => {
              const r = rarities[i];
              const isKira = kira[i];
              const col = multi ? (i % 5) - 2 : 1 - i;
              return (
                <div
                  key={`${id}-${i}`}
                  className={`pack-card r-${r} ${isKira ? 'kira' : ''} ${flipped[i] ? 'flipped' : ''} ${burstAt === i ? 'burst' : ''}`}
                  style={{
                    '--i': multi ? Math.min(i, 12) : i,
                    '--dx': `${col * (multi ? 64 : 112)}px`,
                    '--r': RARITY_COLOR[r],
                  } as CSSProperties}
                >
                  <div className="pack-card-inner">
                    <button className="pack-card-back" onClick={() => flip(i)} aria-label="カードをめくる">
                      <span className="pack-card-emblem" />
                    </button>
                    <div className="pack-card-front">
                      <HandCard cardId={id} cost={card(id).cost} kira={isKira} flow={flow[i]} onClick={() => setPeek(i)} />
                    </div>
                  </div>
                  <div className="pack-card-tag">
                    {flipped[i] && <span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span>}
                    {flipped[i] && fresh[i] && <em>NEW</em>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pack-foot">
        {phase === 'ready' && <div className="pack-hint">パックをタップ、またはスワイプして開封</div>}
        {phase === 'reveal' && !allOpen && (
          <button className="btn ghost" onClick={flipAll} disabled={spotlight !== null || flippingAll}>すべてめくる</button>
        )}
        {phase === 'reveal' && allOpen && (
          <div className="pack-actions">
            {onAgain && <button className="btn primary" onClick={onAgain}>{againLabel ?? 'もう一度引く'}</button>}
            <button className="btn" onClick={onClose}>OK</button>
          </div>
        )}
      </div>

      {spotlight !== null && (
        <div className="pack-spotlight" onClick={() => setSpotlight(null)}>
          <div className="pack-spot-rays" />
          <div className="pack-spot-flash" />
          <div className="pack-spot-card">
            <HandCard cardId={cards[spotlight]} cost={card(cards[spotlight]).cost} kira={kira[spotlight]} flow={flow[spotlight]} />
          </div>
          <div className="pack-spot-title">
            <b>LEGEND</b>
            <span>{card(cards[spotlight]).en}</span>
          </div>
        </div>
      )}

      {peek !== null && (
        <div className="modal-bg" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={cards[peek]} kira={kira[peek]} flow={flow[peek]} />
            <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
