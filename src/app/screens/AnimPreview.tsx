import { useMemo, useState, type CSSProperties } from 'react';
import { card } from '../../engine';
import { FLOW_UNLOCK_MATCHES } from '../gacha';
import { cssUrl } from '../ui/assets';
import { CardDetail, HandCard, portraitAnimIds } from '../ui/cards';
import { cardColor, KiraShineIcon, SignAIcon } from '../ui/icons';

type PreviewMode = 'normal' | 'kira' | 'sign' | 'anim' | 'compare';

const MODES: { id: PreviewMode; label: string; hint: string }[] = [
  { id: 'normal', label: '通常', hint: '標準フレームのカード' },
  { id: 'kira', label: '金枠', hint: 'ガチャ金枠（9%）' },
  { id: 'sign', label: 'サイン', hint: '金枠＋サイン（1%）' },
  { id: 'anim', label: 'アニメ', hint: `デッキで${FLOW_UNLOCK_MATCHES}試合使用で解放` },
  { id: 'compare', label: '比較', hint: '同じキャラのレア差を並べて確認' },
];

function flagsFor(mode: PreviewMode): { kira: boolean; sign: boolean; flow: boolean } {
  switch (mode) {
    case 'kira': return { kira: true, sign: false, flow: false };
    case 'sign': return { kira: true, sign: true, flow: false };
    case 'anim': return { kira: false, sign: false, flow: true };
    default: return { kira: false, sign: false, flow: false };
  }
}

/** Preview every operator cosmetic rarity side-by-side. */
export function AnimPreview({ onBack }: { onBack: () => void }) {
  const ids = useMemo(() => portraitAnimIds(), []);
  const [mode, setMode] = useState<PreviewMode>('compare');
  const [focus, setFocus] = useState<string | null>(null);
  const focusDef = focus ? card(focus) : null;
  const modeMeta = MODES.find((m) => m.id === mode)!;
  const flags = flagsFor(mode);

  return (
    <div className="screen screen-scroll anim-preview has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-cards.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>レアプレビュー</h2>
        <span className="deck-count">{ids.length}</span>
      </div>

      <div className="tabs rarity-preview-tabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={mode === m.id ? 'on' : ''}
            onClick={() => setMode(m.id)}
          >
            {m.id === 'kira' && <KiraShineIcon size={11} />}
            {m.id === 'sign' && <SignAIcon size={11} />}
            {m.label}
          </button>
        ))}
      </div>
      <p className="anim-preview-note">{modeMeta.hint}。タップで拡大</p>

      <div className={`anim-preview-grid${mode === 'compare' ? ' compare-grid' : ' card-grid-preview'}`}>
        {ids.map((id) => {
          const def = card(id);
          return (
            <div
              key={id}
              className={`anim-preview-cell${mode !== 'compare' ? ' preview-card-cell' : ''}`}
              style={{ '--role': cardColor(id) } as CSSProperties}
            >
              <HandCard
                cardId={id}
                cost={def.cost}
                kira={mode === 'compare' ? false : flags.kira}
                sign={mode === 'compare' ? false : flags.sign}
                flow={mode === 'compare' ? false : flags.flow}
                artSize={mode === 'compare' ? 96 : 110}
                onClick={() => setFocus(id)}
              />
              <span className="anim-preview-name">{def.en}</span>
            </div>
          );
        })}
      </div>

      {focus && focusDef && (
        <div className="modal-bg" onClick={() => setFocus(null)}>
          <div
            className={`modal anim-preview-modal${mode === 'compare' ? ' wide' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="anim-preview-modal-meta">
              <b>{focusDef.en}</b>
              <span>{focusDef.name}</span>
            </div>
            {mode === 'compare' ? (
              <div className="rarity-compare-row">
                {([
                  { id: 'normal' as const, label: '通常' },
                  { id: 'kira' as const, label: '金枠', icon: 'kira' as const },
                  { id: 'sign' as const, label: 'サイン', icon: 'sign' as const },
                  { id: 'anim' as const, label: 'アニメ' },
                ]).map((v) => {
                  const f = flagsFor(v.id);
                  return (
                    <div key={v.id} className="rarity-compare-item">
                      <HandCard
                        cardId={focus}
                        cost={focusDef.cost}
                        kira={f.kira}
                        sign={f.sign}
                        flow={f.flow}
                        artSize={120}
                      />
                      <span className="rarity-compare-label">
                        {v.icon === 'kira' && <KiraShineIcon size={11} />}
                        {v.icon === 'sign' && <SignAIcon size={11} />}
                        {v.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <CardDetail
                cardId={focus}
                kira={flags.kira}
                sign={flags.sign}
                flow={flags.flow}
              />
            )}
            <button className="btn ghost small" onClick={() => setFocus(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
