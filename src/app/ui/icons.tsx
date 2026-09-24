import {
  Bomb, CloudFog, Crosshair, Flame, HeartPulse, PiggyBank, Plane, Radar, Radiation, Radio, Shield, ShieldPlus, Sun,
  Swords, Syringe, Target, Undo2, UserPlus,
} from 'lucide-react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { card, type Role, type StreakId, type WeaponClass } from '../../engine';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

function Svg({ size = 20, color = 'currentColor', style, className, children, viewBox = '0 0 48 24' }: IconProps & { children: ReactNode; viewBox?: string }) {
  const [, , w, h] = viewBox.split(' ').map(Number);
  return (
    <svg width={(size * w) / h} height={size} viewBox={viewBox} fill={color} style={style} className={className}>
      {children}
    </svg>
  );
}

/** Minimal weapon silhouettes. */
export function WeaponIcon({ kind, ...p }: IconProps & { kind: WeaponClass }) {
  switch (kind) {
    case 'smg':
      return (
        <Svg {...p}>
          <path d="M6 8h26l2-2h6v4h4v4H34l-2 2h-6l-2 7h-5l1-7h-6l-2 3H8l1-5H6z" />
        </Svg>
      );
    case 'ar':
      return (
        <Svg {...p}>
          <path d="M1 9h8l2-2h22l1-2h4v2h9v3H38v2h-6l-3 3 2 6h-5l-2-6h-4l-1 3h-4l1-3h-4l-3 3H3l2-4H1z" />
        </Svg>
      );
    case 'sg':
      return (
        <Svg {...p}>
          <path d="M2 10h12l2-1h30v4H30l-1 2h-8l-3 2-4 5H9l3-6H6l-4-2z" />
        </Svg>
      );
    case 'sr':
      return (
        <Svg {...p}>
          <path d="M16 3h14v2h-2v2h-8V5h-4z" />
          <path d="M0 10h10l3-2h22v2h13v2H34l-2 2h-8l-4 2-2 6h-5l2-6H8l-5 3H0z" />
        </Svg>
      );
    case 'lmg':
      return (
        <Svg {...p}>
          <path d="M1 8h9l2-2h26v2h9v4H36l-2 2h-3l2 6h-5l-3-6h-3v5h-8v-5h-3l-4 3H3l2-5H1z" />
        </Svg>
      );
    case 'knife':
      return (
        <Svg {...p}>
          <path d="M4 10h14v4H4z" />
          <path d="M18 9h3v6h-3z" />
          <path d="M21 10h16c4 0 8 1 10 2-2 1-6 2-10 2H21z" />
        </Svg>
      );
    case 'armor':
      return <ShieldPlus size={p.size} color={p.color} style={p.style} className={p.className} />;
  }
}

export function GrenadeIcon(p: IconProps) {
  return (
    <Svg {...p} viewBox="0 0 24 24">
      <path d="M9 3h5v2h3l2 2-1 1-2-1v1.2a7 7 0 1 1-7 0V5h0z" />
    </Svg>
  );
}

export const ROLE_COLOR: Record<Role, string> = {
  assault: '#ff7a45',
  tank: '#5aa2ff',
  sniper: '#b98cff',
  support: '#46d98a',
};

export const ROLE_LABEL: Record<Role, string> = {
  assault: 'アサルト',
  tank: 'タンク',
  sniper: 'スナイパー',
  support: 'サポート',
};

export function RoleIcon({ role, size = 16, color }: { role: Role; size?: number; color?: string }) {
  const c = color ?? ROLE_COLOR[role];
  switch (role) {
    case 'assault': return <Swords size={size} color={c} />;
    case 'tank': return <Shield size={size} color={c} />;
    case 'sniper': return <Target size={size} color={c} />;
    case 'support': return <Radio size={size} color={c} />;
  }
}

const TACTIC_ICONS: Record<string, (p: IconProps) => ReactElement> = {
  flashbang: (p) => <Sun size={p.size} color={p.color} />,
  smoke: (p) => <CloudFog size={p.size} color={p.color} />,
  frag: (p) => <GrenadeIcon {...p} />,
  molotov: (p) => <Flame size={p.size} color={p.color} />,
  stim: (p) => <Syringe size={p.size} color={p.color} />,
  drone: (p) => <Radar size={p.size} color={p.color} />,
  eco: (p) => <PiggyBank size={p.size} color={p.color} />,
  fallback: (p) => <Undo2 size={p.size} color={p.color} />,
  focusfire: (p) => <Crosshair size={p.size} color={p.color} />,
  precision: (p) => <Target size={p.size} color={p.color} />,
  reinforce: (p) => <UserPlus size={p.size} color={p.color} />,
  c4: (p) => <Bomb size={p.size} color={p.color} />,
};

export const TYPE_COLOR = {
  gear: '#9fb3c8',
  tactic: '#ffb547',
};

export function CardIcon({ cardId, size = 22, color }: { cardId: string; size?: number; color?: string }) {
  const def = card(cardId);
  if (def.type === 'operator') return <RoleIcon role={def.role!} size={size} color={color} />;
  if (def.type === 'gear') return <WeaponIcon kind={def.weaponClass!} size={size} color={color ?? TYPE_COLOR.gear} />;
  const I = TACTIC_ICONS[cardId];
  return I ? I({ size, color: color ?? TYPE_COLOR.tactic }) : <HeartPulse size={size} />;
}

export function StreakIcon({ id, size = 18, color }: { id: StreakId; size?: number; color?: string }) {
  switch (id) {
    case 'uav': return <Radar size={size} color={color} />;
    case 'airstrike': return <Plane size={size} color={color} />;
    case 'nuke': return <Radiation size={size} color={color} />;
  }
}

export function cardColor(cardId: string): string {
  const def = card(cardId);
  if (def.type === 'operator') return ROLE_COLOR[def.role!];
  return def.type === 'gear' ? TYPE_COLOR.gear : TYPE_COLOR.tactic;
}

export const RARITY_COLOR = {
  common: '#8a96a8',
  rare: '#4aa3ff',
  epic: '#c77dff',
  legend: '#ffc94d',
};
