import { Check, ChevronRight, Dices, FastForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { card, type Rarity } from '../../engine';
import { sfx, vibrate } from '../sfx';
import { publicAsset } from '../ui/assets';
import { CardDetail, HandCard } from '../ui/cards';
import { RARITY_COLOR } from '../ui/icons';

type Phase = 'intro' | 'ready' | 'charging' | 'burst' | 'scan' | 'reveal';

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legend'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legend: 'LEGEND' };
const CHARGE_MS: Record<Rarity, number> = { common: 780, rare: 960, epic: 1280, legend: 1600 };
const BURST_MS = 520;
const SCAN_HOLD: Record<Rarity, number> = { common: 340, rare: 520, epic: 780, legend: 1180 };
const HOLD_MS: Record<Rarity, number> = { common: 0, rare: 0, epic: 480, legend: 1040 };
const HOLD_MULTI: Record<Rarity, number> = { common: 0, rare: 0, epic: 300, legend: 640 };
const FLIP_GAP: Record<Rarity, number> = { common: 360, rare: 420, epic: 1880, legend: 2920 };
const SPOT_MS: Record<Rarity, number> = { common: 0, rare: 0, epic: 1700, legend: 2800 };

export function PackOpening({ cards, kira, flow, fresh, onClose, onAgain, againLabel }: {
  cards: string[];
  /** Per slot: kira result already decided at pull time (operators only). */
  kira: boolean[];
  /** Per slot: motion cosmetic already decided at pull time. */
  flow: boolean[];
  /** Per slot: true when this pull is the player's first copy. */
  fresh: boolean[];
  onClose: () => void;
  onAgain?: () => void;
  againLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [tease, setTease] = useState<Rarity>('common');
  const [scanLocked, setScanLocked] = useState(false);
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false));
  const [holding, setHolding] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<number | null>(null);
  const [burstAt, setBurstAt] = useState<number | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [flippingAll, setFlippingAll] = useState(false);
  const timers = useRef<number[]>([]);
  const gen = useRef(0);
  const dragX = useRef<number | null>(null);
  const torn = useRef(false);
  const holdingRef = useRef<number | null>(null);
  const spotRef = useRef<number | null>(null);

  const rarities = cards.map((id) => card(id).rarity);
  const top = rarities.reduce<Rarity>((a, r) => (RARITY_RANK[r] > RARITY_RANK[a] ? r : a), 'common');
  const allOpen = flipped.every(Boolean);
  const multi = cards.length > 6;
  const dealStep = multi ? 45 : 140;
  const flipGapScale = multi ? 0.5 : 1;
  const scanScale = multi ? 0.86 : 1;
  const accent = phase === 'scan' ? RARITY_COLOR[tease]
    : phase === 'burst' || phase === 'reveal' ? RARITY_COLOR[top]
      : '#2ee6d6';
  const preReveal = phase === 'charging' || phase === 'burst' || phase === 'scan';

  const later = (ms: number, fn: () => void) => {
    const g = gen.current;
    timers.current.push(window.setTimeout(() => {
      if (g !== gen.current) return;
      fn();
    }, ms));
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

  const dealCards = () => {
    setPhase('reveal');
    cards.forEach((_, i) => later(i * dealStep, () => sfx.cardDeal()));
  };

  const startScan = () => {
    const ladder = RARITY_ORDER.filter((r) => RARITY_RANK[r] <= RARITY_RANK[top]);
    setPhase('scan');
    setTease(ladder[0] ?? 'common');
    setScanLocked(ladder.length === 1);
    sfx.lockOn();
    sfx.heartbeat();
    let at = 0;
    ladder.forEach((r, i) => {
      later(at, () => {
        setTease(r);
        const last = i === ladder.length - 1;
        setScanLocked(last);
        if (i > 0) {
          sfx.rankUp(i);
          vibrate(r === 'legend' ? [30, 50, 80] : [20, 30, 20]);
          if (r === 'legend') sfx.legendCharge();
        } else if (last) {
          sfx.heartbeat();
        }
      });
      at += Math.round(SCAN_HOLD[r] * scanScale);
    });
    later(at + 220, dealCards);
  };

  const tear = () => {
    if (phase !== 'ready' || torn.current) return;
    torn.current = true;
    setTease('common');
    setPhase('charging');
    sfx.packCharge();
    vibrate([20, 40, 20, 40, 30]);
    const charge = CHARGE_MS[top];
    for (let t = 480; t < charge; t += 420) later(t, () => sfx.heartbeat());
    later(charge, () => {
      setPhase('burst');
      setTease(top);
      sfx.packOpen(RARITY_RANK[top]);
      vibrate(top === 'legend' ? [50, 40, 90] : 60);
    });
    later(charge + BURST_MS, startScan);
  };

  const skipToReveal = () => {
    if (!preReveal) return;
    gen.current += 1;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    torn.current = true;
    holdingRef.current = null;
    spotRef.current = null;
    setHolding(null);
    setSpotlight(null);
    setScanLocked(false);
    setTease(top);
    dealCards();
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
    const isFlow = flow[i];
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
    sfx.cardFlip(r);
    if (isKira) {
      later(r === 'legend' ? 420 : 90, () => sfx.kira());
      vibrate([30, 40, 30]);
      setBurstAt(i);
      later(900, () => setBurstAt((b) => (b === i ? null : b)));
    }
    if (isFlow) later(r === 'legend' ? 560 : 180, () => sfx.motion());
    if (r === 'legend') {
      vibrate([40, 60, 120]);
      later(280, () => {
        sfx.legendBurst();
        spotRef.current = i;
        setSpotlight(i);
      });
    } else if (r === 'epic') {
      if (!isKira) {
        vibrate(40);
        setBurstAt(i);
        later(900, () => setBurstAt((b) => (b === i ? null : b)));
      }
      later(240, () => {
        spotRef.current = i;
        setSpotlight(i);
      });
    }
  };

  const beginFlip = (i: number, fromAll = false) => {
    if (phase !== 'reveal' || flipped[i]) return;
    if (flippingAll && !fromAll) return;
    if (spotRef.current !== null || holdingRef.current !== null) {
      if (fromAll) later(140, () => beginFlip(i, true));
      return;
    }
    const r = rarities[i];
    const hold = (multi ? HOLD_MULTI : HOLD_MS)[r];
    if (hold <= 0) {
      reveal(i);
      return;
    }
    holdingRef.current = i;
    setHolding(i);
    if (r === 'legend') sfx.legendCharge();
    else sfx.heartbeat();
    later(Math.round(hold * 0.58), () => {
      if (r === 'legend') sfx.crack();
    });
    later(hold, () => {
      holdingRef.current = null;
      setHolding(null);
      reveal(i);
    });
  };

  const flipAll = () => {
    setFlippingAll(true);
    let at = 0;
    cards.forEach((_, i) => {
      if (flipped[i]) return;
      later(at, () => beginFlip(i, true));
      const r = rarities[i];
      at += (multi ? HOLD_MULTI : HOLD_MS)[r] + Math.max(90, (FLIP_GAP[r] + (kira[i] ? 140 : 0) + (flow[i] ? 80 : 0)) * flipGapScale);
    });
    later(at, () => setFlippingAll(false));
  };

  useEffect(() => {
    if (spotlight === null) {
      spotRef.current = null;
      return;
    }
    const r = rarities[spotlight] ?? 'epic';
    const t = window.setTimeout(() => {
      spotRef.current = null;
      setSpotlight(null);
    }, SPOT_MS[r] || 1700);
    return () => window.clearTimeout(t);
  }, [spotlight]);

  const head =
    phase === 'scan' ? (scanLocked ? 'ロックオン' : 'シグナル解析中…')
      : phase === 'charging' || phase === 'burst' ? '開封中…'
        : phase === 'reveal' ? (allOpen ? `獲得カード（${cards.length}枚）` : 'タップしてめくる')
          : 'パックを開封';

  return (
    <div
      className={`screen pack-screen phase-${phase} top-${top}${multi ? ' pack-multi' : ''}${holding !== null ? ' pack-holding' : ''}`}
      style={{ '--hi': accent } as CSSProperties}
    >
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
        <b>{head}</b>
      </div>

      <div className="pack-stage">
        {phase !== 'reveal' && phase !== 'scan' && (
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

        {phase === 'scan' && (
          <div className={`pack-scan r-${tease}${scanLocked ? ' locked' : ''}`} aria-hidden>
            <div className="pack-scan-wash" />
            <div className="pack-scan-line" />
            <div className="pack-scan-core">
              <div key={tease} className="pack-scan-reticle">
                <i /><i /><i /><i />
              </div>
              <div className="pack-scan-copy">
                <small>{scanLocked ? 'SIGNAL LOCK' : 'SCANNING'}</small>
                <b>{RARITY_LABEL[tease]}</b>
              </div>
            </div>
          </div>
        )}

        {phase === 'reveal' && (
          <div className={`pack-cards${multi ? ' multi' : ''}`}>
            {cards.map((id, i) => {
              const r = rarities[i];
              const isKira = kira[i];
              const col = multi ? (i % 5) - 2 : 1 - i;
              return (
                <div
                  key={`${id}-${i}`}
                  className={`pack-card r-${r} ${isKira ? 'kira' : ''} ${flow[i] ? 'anim' : ''} ${flipped[i] ? 'flipped' : ''} ${holding === i ? 'holding' : ''} ${burstAt === i ? 'burst' : ''}`}
                  style={{
                    '--i': multi ? Math.min(i, 12) : i,
                    '--dx': `${col * (multi ? 64 : 112)}px`,
                    '--r': RARITY_COLOR[r],
                  } as CSSProperties}
                >
                  <div className="pack-card-inner">
                    <button className="pack-card-back" onClick={() => beginFlip(i)} aria-label="カードをめくる">
                      <span className="pack-card-emblem" />
                    </button>
                    <div className="pack-card-front">
                      <HandCard cardId={id} cost={card(id).cost} kira={isKira} flow={flow[i]} onClick={() => setPeek(i)} />
                    </div>
                  </div>
                  <div className="pack-card-tag">
                    {flipped[i] && <span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span>}
                    {flipped[i] && kira[i] && <em className="tag-kira">KIRA</em>}
                    {flipped[i] && flow[i] && <em className="tag-anim">ANIM</em>}
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
        {preReveal && (
          <button className="btn ghost pack-skip" onClick={skipToReveal}>
            <FastForward size={14} /> スキップ
          </button>
        )}
        {phase === 'reveal' && !allOpen && (
          <button className="btn ghost" onClick={flipAll} disabled={spotlight !== null || flippingAll || holding !== null}>すべてめくる</button>
        )}
        {phase === 'reveal' && allOpen && (
          <div className="pack-actions">
            {onAgain && (
              <button className="hud-btn hud-main hud-primary" style={{ '--a': '#ff4655' } as CSSProperties} onClick={onAgain}>
                <span className="hud-ico"><Dices size={22} /></span>
                <span className="hud-txt"><b>AGAIN</b><small>{againLabel ?? 'もう一度引く'}</small></span>
                <ChevronRight className="hud-go" size={22} />
              </button>
            )}
            <button className="hud-btn hud-main" style={{ '--a': '#2ee6d6' } as CSSProperties} onClick={onClose}>
              <span className="hud-ico"><Check size={22} /></span>
              <span className="hud-txt"><b>CONFIRM</b><small>OK</small></span>
              <ChevronRight className="hud-go" size={22} />
            </button>
          </div>
        )}
      </div>

      {spotlight !== null && (
        <div className={`pack-spotlight r-${rarities[spotlight]}`} onClick={() => { spotRef.current = null; setSpotlight(null); }}>
          <div className="pack-spot-rays" />
          <div className="pack-spot-flash" />
          <div className="pack-spot-card">
            <HandCard cardId={cards[spotlight]} cost={card(cards[spotlight]).cost} kira={kira[spotlight]} flow={flow[spotlight]} artSize={260} />
          </div>
          <div className="pack-spot-title">
            <b>{RARITY_LABEL[rarities[spotlight]]}</b>
            <span>{card(cards[spotlight]).en}</span>
            <div className="pack-spot-tags">
              {kira[spotlight] && <em className="tag-kira">KIRA</em>}
              {flow[spotlight] && <em className="tag-anim">ANIM</em>}
              {fresh[spotlight] && <em>NEW</em>}
            </div>
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
