import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ALL_CARDS } from '../../engine';
import { sfx, unlockAudio, vibrate } from '../sfx';
import { cssUrl, publicAsset } from '../ui/assets';

/** Operators drifting behind the logo. x/y in %, r = tilt, from = the side they slide in from. */
const FLOATERS = [
  { id: 'havoc', x: -6, y: 9, r: -15, s: 1, d: 0.95, c: 'var(--opp)', from: '-60vw' },
  { id: 'ace', x: 70, y: 6, r: 13, s: 1.08, d: 1.05, c: 'var(--me)', from: '60vw' },
  { id: 'deadeye', x: -8, y: 55, r: 11, s: 0.86, d: 1.2, c: 'var(--me)', from: '-60vw' },
  { id: 'widow', x: 73, y: 52, r: -12, s: 0.9, d: 1.3, c: 'var(--opp)', from: '60vw' },
];

const BOOT = ['SYS.BOOT', 'TACTICAL LINK', 'OPERATORS'];

/** Title screen: a CRT power-on, the logo slamming together under a locking reticle, then TAP TO START. */
export function Splash({ onStart }: { onStart: () => void }) {
  const [armed, setArmed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const operators = useMemo(() => ALL_CARDS.filter((c) => c.type === 'operator').length, []);
  const embers = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      x: `${(i * 53 + 7) % 100}%`,
      dx: `${((i * 37) % 60) - 30}px`,
      size: `${2 + (i % 3)}px`,
      dur: `${6 + ((i * 1.3) % 5)}s`,
      delay: `${1 + ((i * 0.77) % 6)}s`,
      c: i % 3 === 0 ? 'var(--opp)' : 'var(--me)',
    })),
    [],
  );

  // A stray tap during the first beat of the boot shouldn't skip the title entirely.
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  const start = () => {
    if (!armed || leaving) return;
    unlockAudio();
    sfx.engage();
    vibrate(24);
    setLeaving(true);
    window.setTimeout(onStart, 620);
  };

  return (
    <div
      className={`splash ${leaving ? 'leaving' : ''}`}
      style={{ '--screen-bg': cssUrl('bgs/bg-title.webp') } as CSSProperties}
      onClick={start}
    >
      <div className="sp-art" aria-hidden />
      <div className="sp-grid" aria-hidden><i /></div>
      <div className="sp-horizon" aria-hidden />
      <div className="sp-cards" aria-hidden>
        {FLOATERS.map((f) => (
          <div
            key={f.id}
            className="sp-card"
            style={{ '--x': `${f.x}%`, '--y': `${f.y}%`, '--r': `${f.r}deg`, '--s': f.s, '--d': `${f.d}s`, '--c': f.c, '--from': f.from } as CSSProperties}
          >
            <img src={publicAsset(`portraits/${f.id}.webp`)} alt="" draggable={false} />
          </div>
        ))}
      </div>
      <div className="sp-embers" aria-hidden>
        {embers.map((e, i) => (
          <i key={i} style={{ '--x': e.x, '--dx': e.dx, '--sz': e.size, '--t': e.dur, '--d': e.delay, '--c': e.c } as CSSProperties} />
        ))}
      </div>

      <div className="sp-hud sp-hud-tl" aria-hidden>
        {BOOT.map((label, i) => (
          <span key={label} style={{ '--i': i } as CSSProperties}>
            {label} <b>{i === 0 ? 'OK' : i === 1 ? 'ONLINE' : `${operators} READY`}</b>
          </span>
        ))}
      </div>
      <div className="sp-hud sp-hud-tr" aria-hidden>
        <span style={{ '--i': 0 } as CSSProperties}><i className="sp-rec" />LIVE</span>
        <span style={{ '--i': 1 } as CSSProperties}>VOL.01</span>
      </div>

      <div className="sp-center">
        <div className="sp-reticle" aria-hidden>
          <i className="sp-ring" />
          <i className="sp-arc" />
          <i className="sp-cross" />
        </div>
        <h1 className="sp-logo" aria-label="DECKSHOT">
          <span className="sp-deck" data-text="DECK" aria-hidden>DECK</span>
          <span className="sp-shot" data-text="SHOT" aria-hidden>SHOT</span>
        </h1>
        <div className="sp-sub">FPS TACTICAL CARD BATTLE</div>
        <div className="sp-tag">読み合いで、撃ち抜け。</div>
      </div>

      <div className="sp-start"><span>TAP TO START</span></div>
      <div className="sp-foot">© 2026 DECKSHOT</div>

      <div className="sp-scan" aria-hidden />
      <div className="sp-flash" aria-hidden />
    </div>
  );
}
