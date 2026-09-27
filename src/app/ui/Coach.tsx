import { ChevronRight, ChevronsRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TutStep } from '../tutorial';
import { publicAsset } from './assets';

interface Box { x: number; y: number; w: number; h: number }

const PAD = 5;

/** `**word**` → emphasis. */
function rich(text: string) {
  return text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

/**
 * Training overlay: dims the battle, cuts a spotlight around the element the step points at, and
 * keeps the instructor's panel on the opposite half of the screen so it never covers the target.
 * The dim never takes taps; only info steps lay a tap-to-continue catcher over the screen.
 */
export function Coach({ step, stepKey, turn, turns, locate, nudge, onNext, onSkip }: {
  step: TutStep;
  /** Changes with every step; restarts the line's entrance. */
  stepKey: string;
  turn: number;
  turns: number;
  /** Re-read every frame: hand cards lift when selected and modals pop in. */
  locate: () => Element | null;
  /** Bumped on every blocked tap; shakes the panel. */
  nudge: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const locateRef = useRef(locate);
  locateRef.current = locate;
  const [box, setBox] = useState<Box | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const layer = layerRef.current;
      if (layer) {
        const lr = layer.getBoundingClientRect();
        const el = locateRef.current();
        const r = el?.getBoundingClientRect();
        const next = r && r.width > 0 && r.height > 0 ? { x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height } : null;
        const key = next ? `${next.x | 0},${next.y | 0},${next.w | 0},${next.h | 0},${lr.height | 0}` : `-,${lr.height | 0}`;
        if (key !== last) {
          last = key;
          setBox(next);
          setHeight(lr.height);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const info = !step.gate;
  const hole = box ? { left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 } : null;
  const place = !box ? 'mid' : box.y + box.h / 2 > height * 0.55 ? 'top' : 'bottom';
  const shake = nudge ? (nudge % 2 ? 'nudge-a' : 'nudge-b') : '';

  return (
    <div className="tut" ref={layerRef}>
      {info && <button type="button" className="tut-catch" onClick={onNext} aria-label="次へ" />}
      {hole ? <div className={`tut-hole ${info ? '' : 'act'}`} style={hole} /> : <div className="tut-dim" />}
      {hole && !info && (
        <span className="tut-tap" style={{ left: hole.left + hole.width / 2, top: Math.max(4, hole.top - 24) } as CSSProperties}>TAP</span>
      )}
      <div className={`tut-coach at-${place} ${shake}`} onClick={info ? onNext : undefined}>
        <div className="tut-face" aria-hidden>
          <img src={publicAsset('portraits/vanguard.webp')} alt="" draggable={false} />
        </div>
        <div className="tut-body">
          <div className="tut-head">
            <b>教官</b>
            <span>TRAINING {turn}/{turns}</span>
            <button type="button" className="tut-skip" onClick={(e) => { e.stopPropagation(); onSkip(); }}>
              SKIP<ChevronsRight size={12} />
            </button>
          </div>
          <p key={stepKey} className="tut-say">{rich(step.say)}</p>
          {info && <span className="tut-next">タップで次へ<ChevronRight size={13} /></span>}
        </div>
      </div>
    </div>
  );
}
