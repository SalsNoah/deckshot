import { useState, type CSSProperties } from 'react';
import { ALL_CARDS, STREAK_ORDER, STREAKS, ZONE_MODS, type CardType } from '../../engine';
import type { Profile } from '../profile';
import { CardDetail, HandCard } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { StreakIcon } from '../ui/icons';
import { zoneVisual } from '../ui/zoneArt';

const TABS: { id: CardType | 'other'; name: string }[] = [
  { id: 'operator', name: 'オペレーター' },
  { id: 'gear', name: '装備' },
  { id: 'tactic', name: '戦術' },
  { id: 'other', name: 'ストリーク/ゾーン' },
];

export function Cards({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [tab, setTab] = useState<CardType | 'other'>('operator');
  const [peek, setPeek] = useState<string | null>(null);
  const list = ALL_CARDS.filter((c) => c.type === tab).sort((a, b) => a.cost - b.cost);
  const ownedKinds = Object.values(profile.owned).filter((n) => n > 0).length;

  return (
    <div className="screen screen-scroll has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-cards.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>カード一覧</h2>
        <span className="deck-count">{ownedKinds}/{ALL_CARDS.length}</span>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.name}</button>
        ))}
      </div>
      {tab !== 'other' ? (
        <div className="card-grid">
          {list.map((c) => {
            const n = profile.owned[c.id] ?? 0;
            const locked = n <= 0;
            return (
              <div key={c.id} className={`collect-card ${locked ? 'locked' : ''}`}>
                <HandCard
                  cardId={c.id}
                  cost={c.cost}
                  disabled={locked}
                  onClick={() => !locked && setPeek(c.id)}
                />
                <span className="collect-count">{locked ? '未所持' : `×${n}`}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="other-list">
          <h3>キルストリーク</h3>
          {STREAK_ORDER.map((id) => (
            <div key={id} className="other-item">
              <StreakIcon id={id} size={18} />
              <b>{STREAKS[id].name}</b><span className="sp">SP {STREAKS[id].cost}</span>
              <p>{STREAKS[id].text}</p>
            </div>
          ))}
          <h3>ゾーン効果（毎試合ランダムに3つ）</h3>
          <div className="zone-gallery">
            {Object.values(ZONE_MODS).map((z) => {
              const vis = zoneVisual(z.id);
              return (
                <div
                  key={z.id}
                  className="zone-card"
                  style={{ '--zone-art': cssUrl(`zones/${z.id}.webp`), '--zone-c': vis.accent } as CSSProperties}
                >
                  <div className="zone-card-art" aria-hidden />
                  <div className="zone-card-body">
                    <b>{z.name}</b>
                    <p>{z.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {peek && (
        <div className="modal-bg" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={peek} />
            <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
