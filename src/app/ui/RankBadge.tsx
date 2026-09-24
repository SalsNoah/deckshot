import type { CSSProperties } from 'react';
import type { RankId } from '../profile';
import { publicAsset } from './assets';

export function RankBadge({ id, size = 68 }: { id: RankId; size?: number }) {
  const src = publicAsset(`ranks/${id}.webp`);
  return (
    <span className={`rank-badge rank-badge-${id}`} style={{ '--size': `${size}px` } as CSSProperties}>
      <img className="rank-badge-glow" src={src} alt="" aria-hidden draggable={false} />
      <img className="rank-badge-img" src={src} alt="" draggable={false} />
    </span>
  );
}
