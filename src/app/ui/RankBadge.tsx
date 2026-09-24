import { useId, type ReactNode } from 'react';
import type { RankId } from '../profile';

export function RankBadge({ id, size = 64 }: { id: RankId; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const g = (name: string) => `${uid}-${name}`;
  return (
    <svg
      className={`rank-badge rank-badge-${id}`}
      width={size}
      height={size * 1.15}
      viewBox="0 0 80 92"
      aria-hidden
    >
      <defs>
        {defs(id, g)}
      </defs>
      <BadgeBody id={id} g={g} />
    </svg>
  );
}

function defs(id: RankId, g: (name: string) => string): ReactNode {
  return (
    <>
      <linearGradient id={g('metal')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={METAL[id][0]} />
        <stop offset="45%" stopColor={METAL[id][1]} />
        <stop offset="100%" stopColor={METAL[id][2]} />
      </linearGradient>
      <linearGradient id={g('shine')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
        <stop offset="40%" stopColor="#fff" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
      </linearGradient>
      <radialGradient id={g('gem')} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#fff" />
        <stop offset="45%" stopColor={GEM[id]} />
        <stop offset="100%" stopColor="#1a1020" />
      </radialGradient>
      <filter id={g('glow')} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation={GLOW[id]} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );
}

const METAL: Record<RankId, [string, string, string]> = {
  rookie: ['#9aa6b4', '#6d7886', '#3e4652'],
  bronze: ['#f0c08a', '#c07836', '#6a3e22'],
  silver: ['#ffffff', '#c5d0dc', '#6e7c8c'],
  gold: ['#fff1a8', '#f0b429', '#8a5a10'],
  platinum: ['#f4fffd', '#9eeadf', '#2a7a72'],
  diamond: ['#f7fbff', '#9ec4ff', '#3a5eae'],
  master: ['#f3e1ff', '#b06cff', '#4a1d78'],
  legend: ['#ffe08a', '#ff4655', '#6a1020'],
};

const GEM: Record<RankId, string> = {
  rookie: '#8a96a8',
  bronze: '#e7a15a',
  silver: '#e8eef5',
  gold: '#ffe14d',
  platinum: '#5fe3d0',
  diamond: '#d7e6ff',
  master: '#e2b6ff',
  legend: '#ff8a78',
};

const GLOW: Record<RankId, number> = {
  rookie: 0,
  bronze: 0.4,
  silver: 0.6,
  gold: 1.2,
  platinum: 1.6,
  diamond: 1.8,
  master: 2.2,
  legend: 2.8,
};

const SHIELD = 'M40 8l26 10v22c0 16-11 28-26 36C25 68 14 56 14 40V18z';

function BadgeBody({ id, g }: { id: RankId; g: (name: string) => string }) {
  const tier = TIER[id];
  return (
    <g filter={GLOW[id] ? `url(#${g('glow')})` : undefined}>
      {id === 'legend' && <LegendRays />}
      {tier >= 6 && <Wings gold={id === 'legend'} />}
      {tier >= 5 && <Crown id={id} />}
      <path d={SHIELD} fill={`url(#${g('metal')})`} stroke={EDGE[id]} strokeWidth={tier >= 3 ? 2.2 : 1.4} />
      <path d={SHIELD} fill={`url(#${g('shine')})`} />
      {tier >= 1 && <path d="M40 14l20 8v16c0 12-8 21-20 27-12-6-20-15-20-27V22z" fill="none" stroke="#fff" strokeOpacity={0.35} />}
      {tier >= 2 && <path d="M22 28h36M24 34h32" stroke="#fff" strokeOpacity="0.25" />}
      {id === 'diamond' && <Facets />}
      <Center id={id} g={g} />
      {tier >= 3 && <Laurels />}
      {tier >= 4 && <Sparks />}
    </g>
  );
}

const TIER: Record<RankId, number> = {
  rookie: 0, bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, master: 6, legend: 7,
};

const EDGE: Record<RankId, string> = {
  rookie: '#c5ced8',
  bronze: '#f3d2a4',
  silver: '#ffffff',
  gold: '#fff6c2',
  platinum: '#d9fff6',
  diamond: '#ffffff',
  master: '#f6e2ff',
  legend: '#ffe7a3',
};

function Center({ id, g }: { id: RankId; g: (name: string) => string }) {
  if (id === 'rookie') {
    return <path d="M40 34l8 6-8 14-8-14z" fill="#d5dde6" />;
  }
  if (id === 'bronze' || id === 'silver') {
    return (
      <>
        <circle cx="40" cy="42" r={id === 'silver' ? 9 : 7} fill="#1a120c" fillOpacity="0.25" />
        <path d="M40 32l5 8h-10z M40 52l-5-8h10z" fill={id === 'silver' ? '#fff' : '#f6e2c4'} />
      </>
    );
  }
  return <circle cx="40" cy="44" r={id === 'legend' || id === 'master' ? 11 : 9} fill={`url(#${g('gem')})`} stroke="#fff" strokeOpacity="0.7" />;
}

function Laurels() {
  return (
    <g fill="none" stroke="#fff6c8" strokeWidth="1.4" strokeLinecap="round">
      <path d="M18 48c4 2 6 6 6 12" />
      <path d="M16 42c5 1 8 5 9 10" />
      <path d="M62 48c-4 2-6 6-6 12" />
      <path d="M64 42c-5 1-8 5-9 10" />
    </g>
  );
}

function Sparks() {
  return (
    <g fill="#fff">
      <path d="M40 18l1.2 3.2L44 22l-2.8.8L40 26l-1.2-3.2L36 22l2.8-.8z" />
      <path d="M24 24l.7 1.6 1.6.4-1.6.5-.7 1.5-.6-1.5-1.6-.5 1.6-.4z" opacity="0.8" />
      <path d="M56 24l.7 1.6 1.6.4-1.6.5-.7 1.5-.6-1.5-1.6-.5 1.6-.4z" opacity="0.8" />
    </g>
  );
}

function Facets() {
  return (
    <g fill="#fff" fillOpacity="0.28" stroke="#fff" strokeOpacity="0.55">
      <path d="M40 20l10 8-10 6-10-6z" />
      <path d="M28 36l12-4 12 4-12 16z" />
    </g>
  );
}

function Crown({ id }: { id: RankId }) {
  const fill = id === 'legend' ? '#ffe08a' : id === 'master' ? '#e7c6ff' : '#fff';
  return <path d="M26 16l4 8 10-10 10 10 4-8-2 14H28z" fill={fill} stroke="#fff" strokeWidth="0.6" />;
}

function Wings({ gold }: { gold: boolean }) {
  const fill = gold ? '#ffd27a' : '#d7b4ff';
  return (
    <g fill={fill} opacity="0.9">
      <path d="M14 40c-8-2-12-8-12-14 6 1 10 4 12 8z" />
      <path d="M14 46c-10 0-16-4-18-10 7 2 12 5 16 10z" />
      <path d="M66 40c8-2 12-8 12-14-6 1-10 4-12 8z" />
      <path d="M66 46c10 0 16-4 18-10-7 2-12 5-16 10z" />
    </g>
  );
}

function LegendRays() {
  return (
    <g className="rank-rays" fill="#ffb547" opacity="0.7">
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x="39" y="2" width="2" height="14" rx="1" transform={`rotate(${i * 30} 40 46)`} />
      ))}
    </g>
  );
}
