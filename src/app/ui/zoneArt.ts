import {
  Boxes, Building2, Crosshair, EyeOff, Landmark, Mountain, Radar, Shield, Skull, Store, Waypoints,
  type LucideIcon,
} from 'lucide-react';

/** Neon environment art for each zone modifier. */
export const ZONE_ART: Record<string, string> = Object.fromEntries(
  ['open', 'highground', 'choke', 'longrange', 'cqb', 'supply', 'toxic', 'outpost', 'dark', 'cover', 'radar']
    .map((id) => [id, `./zones/${id}.webp`]),
);

export function zoneArtUrl(modId: string): string | undefined {
  return ZONE_ART[modId];
}

export interface ZoneVisual {
  /** Ultra-short effect chip for battle header. */
  tip: string;
  /** Accent color for border / tint / watermark. */
  accent: string;
  Icon: LucideIcon;
}

/** Distinct glanceable identity per zone for battle readability. */
export const ZONE_VISUAL: Record<string, ZoneVisual> = {
  open: { tip: '効果なし', accent: '#7d8b9c', Icon: Landmark },
  highground: { tip: '支配+2pt', accent: '#3dffe8', Icon: Mountain },
  choke: { tip: '上限2体', accent: '#ff5a6a', Icon: Waypoints },
  longrange: { tip: '狙撃ATK+2', accent: '#6aa8ff', Icon: Crosshair },
  cqb: { tip: '全員ATK+1', accent: '#ffb020', Icon: Building2 },
  supply: { tip: '支配+2¢', accent: '#ffd24a', Icon: Store },
  toxic: { tip: '終了時-1', accent: '#5dff9a', Icon: Skull },
  outpost: { tip: '配置コスト-1', accent: '#34f0df', Icon: Boxes },
  dark: { tip: 'AIM0同時撃', accent: '#b8c4d4', Icon: EyeOff },
  cover: { tip: '被ダメ-1', accent: '#e0a060', Icon: Shield },
  radar: { tip: '支配SP+1', accent: '#d48cff', Icon: Radar },
};

export function zoneVisual(modId: string): ZoneVisual {
  return ZONE_VISUAL[modId] ?? ZONE_VISUAL.open;
}
