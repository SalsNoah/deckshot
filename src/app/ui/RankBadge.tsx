import type { RankId } from '../profile';
import { publicAsset } from './assets';

export function RankBadge({ id, size = 68 }: { id: RankId; size?: number }) {
  return (
    <img
      className={`rank-badge rank-badge-${id}`}
      src={publicAsset(`ranks/${id}.webp`)}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}
