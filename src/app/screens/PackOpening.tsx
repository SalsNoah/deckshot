import { Check, Dices, FastForward, Layers } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { card, type Rarity } from '../../engine';
import { sfx, setBgmGain, vibrate } from '../sfx';
import { publicAsset } from '../ui/assets';
import { CardDetail, HandCard } from '../ui/cards';
import { RARITY_COLOR } from '../ui/icons';

type Phase = 'ready' | 'tear' | 'burst' | 'deal' | 'open' | 'done';
/** Seam light colour: the single, honest hint of the best card in the pack. */
type Hint = 'low' | 'epic' | 'legend';

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };
const LABEL: Record<Rarity, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legend: 'LEGEND' };
const BY_RANK: Rarity[] = ['legend', 'epic', 'rare', 'common'];
const HINT_COLOR: Record<Hint, string> = { low: '#19f0ff', epic: RARITY_COLOR.epic, legend: RARITY_COLOR.legend };
const COLS = 6;

const TEAR_MS: Record<Hint, number> = { low: 340, epic: 760, legend: 1000 };
const TEAR_MULTI_LOW = 440;
/** Some legend packs glow epic-purple first and upgrade here; epic packs never glow gold. */
const PROMO_AT = 520;
const PROMO_SHARE = 0.45;
const BURST_MS = 240;
const DEAL_STEP = 70;
const DEAL_STEP_MULTI = 14;
const DEAL_FLIGHT = 340;
const WAVE_STEP = 90;
const WAVE_ROW = 70;
const FLIP_MS = 460;
const CHARGE_MS = { epic: 360, legend: 780 };
const AUTO_CHARGE_MS = { epic: 0, legend: 480 };
const AUTO_GAP = 260;
const POP_MS = 700;
const SPOT_MS = { legend: 2600, sign: 2000 };
const TAP_GUARD = 380;
const AGAIN_GUARD = 450;

export function PackOpening({ cards, kira, sign, fresh, quick, onClose, onAgain, againLabel }: {
  cards: string[];
  /** Per slot: kira result already decided at pull time (operators only). */
  kira: boolean[];
  /** Per slot: signature cosmetic already decided at pull time. */
  sign: boolean[];
  /** Per slot: true when this pull is the player's first copy. */
  fresh: boolean[];
  /** Jump straight from the seam hint to the results. */
  quick?: boolean;
  onClose: () => void;
  onAgain?: () => void;
  againLabel?: string;
}) {
  const rarities = useMemo(() => cards.map((id) => card(id).rarity), [cards]);
  const top = rarities.reduce<Rarity>((a, r) => (RANK[r] > RANK[a] ? r : a), 'common');
  const hint: Hint = top === 'legend' ? 'legend' : top === 'epic' ? 'epic' : 'low';
  const [promo] = useState(() => hint === 'legend' && Math.random() < PROMO_SHARE);
  const multi = cards.length > 6;
  const tearMs = hint === 'low' && multi ? TEAR_MULTI_LOW : TEAR_MS[hint];

  const [phase, setPhase] = useState<Phase>('ready');
  const [seam, setSeam] = useState<Hint>('low');
  const [promoted, setPromoted] = useState(false);
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false));
  const [waving, setWaving] = useState(false);
  const [charging, setCharging] = useState<number | null>(null);
  const [cracked, setCracked] = useState(false);
  const [pop, setPop] = useState<number | null>(null);
  const [spot, setSpot] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [againReady, setAgainReady] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);

  const timers = useRef<number[]>([]);
  const gen = useRef(0);
  const phaseRef = useRef<Phase>('ready');
  const flippedRef = useRef<boolean[]>(cards.map(() => false));
  const wavingRef = useRef(false);
  const chargingRef = useRef<number | null>(null);
  const spotRef = useRef<number | null>(null);
  const spotAt = useRef(0);
  const spotQueue = useRef<number[]>([]);
  const dragX = useRef<number | null>(null);
  const swallowClick = useRef(false);
  const tornAt = useRef(0);

  const later = (ms: number, fn: () => void) => {
    const g = gen.current;
    timers.current.push(window.setTimeout(() => {
      if (g === gen.current) fn();
    }, ms));
  };
  const cancelAll = () => {
    gen.current += 1;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => {
    const pending = timers;
    return () => {
      pending.current.forEach((t) => window.clearTimeout(t));
      setBgmGain(1);
    };
  }, []);

  useEffect(() => {
    if (phase === 'done') setBgmGain(1);
  }, [phase]);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const setWave = (on: boolean) => {
    wavingRef.current = on;
    setWaving(on);
  };
  const stopCharge = () => {
    chargingRef.current = null;
    setCharging(null);
    setCracked(false);
  };
  const flipIdx = (idx: number[]) => {
    if (!idx.length) return;
    idx.forEach((i) => { flippedRef.current[i] = true; });
    setFlipped([...flippedRef.current]);
  };
  const lowUnflipped = () => cards.map((_, i) => i).filter((i) => RANK[rarities[i]] < 2 && !flippedRef.current[i]);
  /** Lowest-rarity face-down card first, so the pack builds toward its best card. */
  const nextCard = () => {
    let best = -1;
    for (let i = 0; i < cards.length; i++) {
      if (flippedRef.current[i]) continue;
      if (best < 0 || RANK[rarities[i]] < RANK[rarities[best]]) best = i;
    }
    return best < 0 ? null : best;
  };

  const pumpSpot = () => {
    if (spotRef.current !== null) return;
    const i = spotQueue.current.shift();
    if (i === undefined) return;
    spotRef.current = i;
    spotAt.current = Date.now();
    setSpot(i);
    if (rarities[i] === 'legend') {
      sfx.legendBurst();
      if (sign[i]) later(520, () => sfx.motion());
    } else {
      sfx.motion();
    }
  };
  const closeSpot = () => {
    if (spotRef.current === null || Date.now() - spotAt.current < TAP_GUARD) return;
    spotRef.current = null;
    setSpot(null);
  };

  const finish = () => {
    setAuto(false);
    go('done');
    later(AGAIN_GUARD, () => setAgainReady(true));
  };

  const reveal = (i: number) => {
    const r = rarities[i];
    flipIdx([i]);
    sfx.cardFlip(r);
    if (kira[i]) later(r === 'legend' ? 380 : 160, () => sfx.kira());
    if (r === 'legend') {
      vibrate([40, 60, 120]);
      spotQueue.current.unshift(i);
      later(260, pumpSpot);
      return;
    }
    if (r === 'epic') {
      vibrate(40);
      setPop(i);
      later(POP_MS, () => setPop((p) => (p === i ? null : p)));
    }
    if (sign[i]) {
      spotQueue.current.push(i);
      later(r === 'epic' ? 560 : 220, pumpSpot);
    }
  };

  const flipCard = (i: number, fromAuto = false) => {
    if (phaseRef.current !== 'open' || flippedRef.current[i]) return;
    if (chargingRef.current !== null || spotRef.current !== null || spotQueue.current.length) return;
    const r = rarities[i];
    const charge = r === 'epic' || r === 'legend' ? (fromAuto ? AUTO_CHARGE_MS : CHARGE_MS)[r] : 0;
    if (charge <= 0) {
      reveal(i);
      return;
    }
    chargingRef.current = i;
    setCharging(i);
    if (r === 'legend') {
      sfx.legendCharge();
      vibrate([15, 30, 15]);
      later(Math.round(charge * 0.55), () => {
        setCracked(true);
        sfx.crack();
        vibrate(30);
      });
    } else {
      sfx.heartbeat();
      vibrate(15);
    }
    later(charge, () => {
      stopCharge();
      reveal(i);
    });
  };

  const afterWave = (low: number[]) => {
    setWave(false);
    spotQueue.current.push(...low.filter((i) => sign[i]));
    pumpSpot();
  };

  const startWave = () => {
    go('open');
    const low = lowUnflipped();
    if (!low.length) return;
    setWave(true);
    const beats: number[][] = [];
    low.forEach((i) => {
      const last = beats[beats.length - 1];
      if (multi && last && Math.floor(last[0] / COLS) === Math.floor(i / COLS)) last.push(i);
      else beats.push([i]);
    });
    const step = multi ? WAVE_ROW : WAVE_STEP;
    beats.forEach((beat, k) => later(k * step, () => {
      flipIdx(beat);
      sfx.cardFlip(beat.some((i) => rarities[i] === 'rare') ? 'rare' : 'common');
    }));
    const end = (beats.length - 1) * step;
    if (low.some((i) => kira[i])) later(end + 200, () => sfx.kira());
    later(end + Math.round(FLIP_MS * 0.6), () => afterWave(low));
  };

  const deal = () => {
    go('deal');
    const step = multi ? DEAL_STEP_MULTI : DEAL_STEP;
    const sounds = multi ? 4 : cards.length;
    for (let k = 0; k < sounds; k++) later(k * (multi ? 110 : step), () => sfx.cardDeal());
    later((cards.length - 1) * step + DEAL_FLIGHT, startWave);
  };

  /** Best card nobody has seen yet, for the one spotlight a skip still shows. */
  const pickStar = (unseen: number[]) => {
    const score = (i: number) => (rarities[i] === 'legend' ? 4 : 0) + (sign[i] ? 2 : 0) + (kira[i] ? 1 : 0);
    const star = unseen.filter((i) => rarities[i] === 'legend' || sign[i]).sort((a, b) => score(b) - score(a))[0];
    return star ?? null;
  };

  const skipAll = () => {
    const p = phaseRef.current;
    if (p === 'ready' || p === 'done') return;
    cancelAll();
    const unseen = cards.map((_, i) => i).filter((i) => !flippedRef.current[i]);
    stopCharge();
    setPop(null);
    setWave(false);
    spotQueue.current = [];
    spotRef.current = null;
    setSpot(null);
    setSeam(hint);
    if (p === 'tear') sfx.packOpen(RANK[top]);
    flipIdx(unseen);
    finish();
    const star = pickStar(unseen);
    if (star !== null) {
      spotQueue.current = [star];
      pumpSpot();
    } else {
      sfx.cardFlip(top);
      if (unseen.some((i) => kira[i])) later(160, () => sfx.kira());
    }
  };

  /** Tap during the tear / deal / wave: finish the automatic part now, keep the highlights. */
  const fastForward = () => {
    const p = phaseRef.current;
    if (Date.now() - tornAt.current < 300) return;
    cancelAll();
    if (p === 'tear') sfx.packOpen(RANK[top]);
    setSeam(hint);
    setPop(null);
    const pending = chargingRef.current;
    if (pending !== null) stopCharge();
    setWave(false);
    go('open');
    const low = lowUnflipped();
    flipIdx(low);
    if (low.some((i) => kira[i])) sfx.kira();
    if (pending !== null) reveal(pending);
    spotQueue.current.push(...low.filter((i) => sign[i]));
    pumpSpot();
  };

  const tear = () => {
    if (phaseRef.current !== 'ready') return;
    tornAt.current = Date.now();
    setBgmGain(0.35);
    const shown: Hint = promo ? 'epic' : hint;
    go('tear');
    setSeam(shown);
    sfx.packCharge();
    vibrate(20);
    if (shown === 'epic') later(200, () => sfx.heartbeat());
    if (shown === 'legend') sfx.legendCharge();
    if (promo) {
      later(PROMO_AT, () => {
        setSeam('legend');
        setPromoted(true);
        sfx.crack();
        sfx.rankUp(3);
        vibrate([30, 40, 70]);
      });
    }
    later(tearMs, () => {
      go('burst');
      sfx.packOpen(RANK[top]);
      vibrate(top === 'legend' ? [40, 30, 90] : 30);
    });
    later(tearMs + BURST_MS, () => (quick ? skipAll() : deal()));
  };

  const onStage = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    const p = phaseRef.current;
    if (p === 'ready') tear();
    else if (p === 'tear' || p === 'burst' || p === 'deal' || (p === 'open' && wavingRef.current)) fastForward();
    else if (p === 'open') {
      const n = nextCard();
      if (n !== null) flipCard(n);
    }
  };
  const onPackDown = (e: PointerEvent) => {
    dragX.current = e.clientX;
  };
  const onPackMove = (e: PointerEvent) => {
    const start = dragX.current;
    if (start !== null && Math.abs(e.clientX - start) > 40) {
      dragX.current = null;
      swallowClick.current = true;
      tear();
    }
  };

  useEffect(() => {
    if (phase !== 'open' || waving || charging !== null || spot !== null || pop !== null) return;
    if (!flipped.every(Boolean) || spotQueue.current.length) return;
    const t = window.setTimeout(finish, 280);
    return () => window.clearTimeout(t);
  }, [phase, waving, charging, spot, pop, flipped]);

  useEffect(() => {
    if (!auto || phase !== 'open' || waving || charging !== null || spot !== null) return;
    const next = nextCard();
    if (next === null) return;
    const t = window.setTimeout(() => flipCard(next, true), AUTO_GAP);
    return () => window.clearTimeout(t);
  }, [auto, phase, waving, charging, spot, flipped]);

  useEffect(() => {
    if (spot !== null) {
      const t = window.setTimeout(() => {
        spotRef.current = null;
        setSpot(null);
      }, rarities[spot] === 'legend' ? SPOT_MS.legend : SPOT_MS.sign);
      return () => window.clearTimeout(t);
    }
    if (!spotQueue.current.length) return;
    const t = window.setTimeout(pumpSpot, 160);
    return () => window.clearTimeout(t);
  }, [spot]);

  const particles = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      left: `${(i * 37 + 11) % 100}%`,
      delay: `${-((i * 0.83) % 6)}s`,
      dur: `${5 + ((i * 1.7) % 4)}s`,
      size: `${2 + (i % 3)}px`,
    })),
    [],
  );

  const summary = useMemo(() => {
    const count: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legend: 0 };
    rarities.forEach((r) => { count[r] += 1; });
    const star = (i: number) => RANK[rarities[i]] >= 2 || sign[i];
    const best = cards.map((_, i) => i).filter(star).sort((a, b) =>
      RANK[rarities[b]] - RANK[rarities[a]] || Number(sign[b]) - Number(sign[a]) || Number(kira[b]) - Number(kira[a]) || a - b);
    const groups = new Map<string, { i: number; n: number; fresh: boolean }>();
    cards.forEach((id, i) => {
      if (star(i)) return;
      const key = `${id}|${kira[i] ? 1 : 0}|${sign[i] ? 1 : 0}`;
      const g = groups.get(key);
      if (g) {
        g.n += 1;
        g.fresh ||= fresh[i];
      } else {
        groups.set(key, { i, n: 1, fresh: fresh[i] });
      }
    });
    const rest = [...groups.values()].sort((a, b) =>
      RANK[rarities[b.i]] - RANK[rarities[a.i]] || Number(b.fresh) - Number(a.fresh) || Number(kira[b.i]) - Number(kira[a.i]) || a.i - b.i);
    return {
      count, best, rest,
      news: fresh.filter(Boolean).length,
      kiras: kira.filter(Boolean).length,
      signs: sign.filter(Boolean).length,
    };
  }, [cards, rarities, kira, sign, fresh]);

  const allOpen = flipped.every(Boolean);
  const accent = phase === 'ready' ? HINT_COLOR.low : HINT_COLOR[seam];
  const skippable = phase === 'tear' || phase === 'burst' || phase === 'deal' || (phase === 'open' && (waving || auto));
  const head =
    phase === 'ready' ? 'パックを開封'
      : phase === 'tear' || phase === 'burst' || phase === 'deal' || waving ? '開封中…'
        : phase === 'open' ? (allOpen ? '' : '光るカードをタップ')
          : multi ? '獲得結果' : `獲得カード（${cards.length}枚）`;
  const showPack = phase === 'ready' || phase === 'tear' || phase === 'burst';
  const showCards = phase === 'deal' || phase === 'open' || (phase === 'done' && !multi);

  const tags = (i: number) => (
    <>
      <span style={{ color: RARITY_COLOR[rarities[i]] }}>{LABEL[rarities[i]]}</span>
      {kira[i] && <em className="tag-kira">KIRA</em>}
      {sign[i] && <em className="tag-sign">SIGN</em>}
      {fresh[i] && <em>NEW</em>}
    </>
  );

  return (
    <div
      className={`screen pack-screen phase-${phase} seam-${seam}${promoted ? ' promoted' : ''}${waving ? ' waving' : ''}${multi ? ' pack-multi' : ''}`}
      style={{ '--hi': accent, '--tear': `${tearMs}ms` } as CSSProperties}
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
        <b key={head}>{head || '\u00a0'}</b>
      </div>

      <div className="pack-stage" onClick={onStage}>
        {showPack && (
          <button
            className="pack"
            onPointerDown={onPackDown}
            onPointerMove={onPackMove}
            onPointerUp={() => { dragX.current = null; }}
            aria-label="パックを開ける"
          >
            {multi && <><span className="pack-stack s2" /><span className="pack-stack s1" /></>}
            <span className="pack-half pack-lid"><img src={publicAsset('packs/operator.webp')} alt="" draggable={false} /></span>
            <span className="pack-half pack-body"><img src={publicAsset('packs/operator.webp')} alt="" draggable={false} /></span>
            <span className="pack-foil" />
            <span className="pack-title"><b>DECK<i>SHOT</i></b><small>OPERATOR SUPPLY ×{cards.length}</small></span>
            <span className="pack-seam" />
            {seam === 'legend' && phase !== 'ready' && (
              <span className="pack-sparks" aria-hidden>
                {Array.from({ length: 10 }, (_, k) => <i key={k} style={{ '--k': k } as CSSProperties} />)}
              </span>
            )}
          </button>
        )}
        {promoted && phase === 'tear' && <div className="pack-promo" aria-hidden />}
        {phase === 'burst' && <div className="pack-flash" aria-hidden />}

        {showCards && (
          <div
            className={multi ? 'pack-grid' : 'pack-cards'}
            style={{ '--step': `${multi ? DEAL_STEP_MULTI : DEAL_STEP}ms` } as CSSProperties}
          >
            {cards.map((id, i) => {
              const r = rarities[i];
              const hi = RANK[r] >= 2;
              const col = multi ? i % COLS : i;
              const row = multi ? Math.floor(i / COLS) : 0;
              const dx = multi ? ((COLS - 1) / 2 - col) * 64 : (1 - col) * 112;
              const dy = multi ? (2 - row) * 93 : -24;
              const cls = [
                'pack-card', `r-${r}`,
                hi && 'hl',
                kira[i] && 'kira',
                sign[i] && 'sign',
                flipped[i] && 'flipped',
                charging === i && 'charging',
                charging === i && cracked && 'cracked',
                pop === i && 'pop',
              ].filter(Boolean).join(' ');
              return (
                <div
                  key={i}
                  className={cls}
                  style={{ '--i': i, '--dx': `${dx}px`, '--dy': `${dy}px`, '--r': RARITY_COLOR[r] } as CSSProperties}
                >
                  <div className="pack-card-float">
                    <div className="pack-card-inner">
                      <button
                        className="pack-card-back"
                        onClick={(e) => { e.stopPropagation(); flipCard(i); }}
                        tabIndex={flipped[i] ? -1 : 0}
                        aria-label="カードをめくる"
                      >
                        <span className="pack-card-emblem" />
                        {hi && <span className="pack-card-tap">TAP</span>}
                      </button>
                      <div className="pack-card-front">
                        <HandCard
                          cardId={id}
                          cost={card(id).cost}
                          kira={kira[i]}
                          sign={sign[i]}
                          artSize={multi ? 64 : 110}
                          onClick={(e) => { e.stopPropagation(); setPeek(i); }}
                        />
                      </div>
                    </div>
                  </div>
                  {multi
                    ? flipped[i] && fresh[i] && <em className="pack-card-new">NEW</em>
                    : <div className="pack-card-tag">{flipped[i] && tags(i)}</div>}
                </div>
              );
            })}
          </div>
        )}

        {phase === 'done' && multi && (
          <div className="pack-summary" onClick={(e) => e.stopPropagation()}>
            <div className="pack-sum-counts">
              {BY_RANK.map((r) => summary.count[r] > 0 && (
                <span key={r} className={`sum-chip r-${r}`} style={{ '--r': RARITY_COLOR[r] } as CSSProperties}>
                  <b>{summary.count[r]}</b>{LABEL[r]}
                </span>
              ))}
            </div>
            {(summary.news > 0 || summary.kiras > 0 || summary.signs > 0) && (
              <div className="pack-sum-extra">
                {summary.news > 0 && <em>NEW ×{summary.news}</em>}
                {summary.kiras > 0 && <em className="tag-kira">KIRA ×{summary.kiras}</em>}
                {summary.signs > 0 && <em className="tag-sign">SIGN ×{summary.signs}</em>}
              </div>
            )}
            <div className="pack-sum-scroll">
              {summary.best.length > 0 && (
                <div className="pack-sum-best">
                  {summary.best.map((i, k) => (
                    <div
                      key={i}
                      className={`sum-card big r-${rarities[i]}${kira[i] ? ' kira' : ''}`}
                      style={{ '--r': RARITY_COLOR[rarities[i]], '--k': k } as CSSProperties}
                    >
                      <HandCard cardId={cards[i]} cost={card(cards[i]).cost} kira={kira[i]} sign={sign[i]} artSize={96} onClick={() => setPeek(i)} />
                      <div className="sum-card-tags">{tags(i)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="pack-sum-grid">
                {summary.rest.map((g, k) => (
                  <div
                    key={g.i}
                    className={`sum-card r-${rarities[g.i]}${kira[g.i] ? ' kira' : ''}`}
                    style={{ '--r': RARITY_COLOR[rarities[g.i]], '--k': Math.min(summary.best.length + k, 18) } as CSSProperties}
                  >
                    <HandCard cardId={cards[g.i]} cost={card(cards[g.i]).cost} kira={kira[g.i]} sign={sign[g.i]} artSize={64} onClick={() => setPeek(g.i)} />
                    {g.n > 1 && <b className="sum-count">×{g.n}</b>}
                    {g.fresh && <em className="sum-new">NEW</em>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pack-foot">
        {phase === 'ready' && <div className="pack-hint">タップ または スワイプで開封</div>}
        {skippable && (
          <button className="btn ghost pack-skip" onClick={skipAll}>
            <FastForward size={14} /> スキップ
          </button>
        )}
        {phase === 'open' && !waving && !auto && !allOpen && (
          <button className="btn pack-skip pack-reveal-all" onClick={() => setAuto(true)}>
            <Layers size={14} /> すべてめくる
          </button>
        )}
        {phase === 'done' && (
          <div className="pack-actions">
            {onAgain && (
              <button
                className="hud-btn hud-main hud-primary pack-again"
                onClick={() => { if (againReady) onAgain(); }}
              >
                <span className="hud-ico"><Dices size={20} /></span>
                <span className="hud-txt"><b>AGAIN</b><small>{againLabel ?? 'もう一度引く'}</small></span>
              </button>
            )}
            <button className="hud-btn hud-main pack-ok" onClick={onClose}>
              <span className="hud-ico"><Check size={20} /></span>
              <span className="hud-txt"><b>OK</b><small>閉じる</small></span>
            </button>
          </div>
        )}
      </div>

      {spot !== null && (
        <div className={`pack-spotlight r-${rarities[spot] === 'legend' ? 'legend' : 'sign'}`} onClick={closeSpot}>
          <div className="pack-spot-rays" />
          <div className="pack-spot-flash" />
          <div className="pack-spot-card">
            <HandCard cardId={cards[spot]} cost={card(cards[spot]).cost} kira={kira[spot]} sign={sign[spot]} artSize={260} />
          </div>
          <div className="pack-spot-title">
            <b>{rarities[spot] === 'legend' ? 'LEGEND' : 'SIGNED'}</b>
            <span>{card(cards[spot]).en}</span>
            <div className="pack-spot-tags">
              {rarities[spot] !== 'legend' && <em className="tag-rarity" style={{ '--r': RARITY_COLOR[rarities[spot]] } as CSSProperties}>{LABEL[rarities[spot]]}</em>}
              {kira[spot] && <em className="tag-kira">KIRA</em>}
              {sign[spot] && <em className="tag-sign">SIGN</em>}
              {fresh[spot] && <em>NEW</em>}
            </div>
            <small className="pack-spot-hint">タップで閉じる</small>
          </div>
        </div>
      )}

      {peek !== null && (
        <div className="modal-bg" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={cards[peek]} kira={kira[peek]} sign={sign[peek]} />
            <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
