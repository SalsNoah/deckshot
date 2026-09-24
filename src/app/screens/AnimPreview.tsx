import { useState, type CSSProperties } from 'react';
import { card } from '../../engine';
import { cssUrl } from '../ui/assets';
import { Portrait, portraitAnimIds } from '../ui/cards';
import { cardColor } from '../ui/icons';

/** Review screen: every operator motion GIF at once. */
export function AnimPreview({ onBack }: { onBack: () => void }) {
  const ids = portraitAnimIds();
  const [focus, setFocus] = useState<string | null>(null);
  const focusDef = focus ? card(focus) : null;

  return (
    <div className="screen screen-scroll anim-preview has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-cards.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>アニメーションプレビュー</h2>
        <span className="deck-count">{ids.length}</span>
      </div>
      <p className="anim-preview-note">アニメレアGIFを全キャラ表示（タップで拡大）</p>
      <div className="anim-preview-grid">
        {ids.map((id) => {
          const def = card(id);
          return (
            <button
              key={id}
              type="button"
              className="anim-preview-cell"
              onClick={() => setFocus(id)}
              style={{ '--role': cardColor(id) } as CSSProperties}
            >
              <Portrait cardId={id} size={112} flow />
              <span className="anim-preview-name">{def.en}</span>
              <span className="anim-preview-jp">{def.name}</span>
            </button>
          );
        })}
      </div>

      {focus && focusDef && (
        <div className="modal-bg" onClick={() => setFocus(null)}>
          <div className="modal anim-preview-modal" onClick={(e) => e.stopPropagation()}>
            <Portrait cardId={focus} size={280} flow />
            <div className="anim-preview-modal-meta">
              <b>{focusDef.en}</b>
              <span>{focusDef.name}</span>
            </div>
            <button className="btn ghost small" onClick={() => setFocus(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
