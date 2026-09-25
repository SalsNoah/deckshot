import { ChevronRight, Crosshair, Pencil } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { DECK_SIZE, card, countCards, validateDeck, type Difficulty } from '../../engine';
import type { Profile } from '../profile';
import { CardDetail } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { CardIcon } from '../ui/icons';

const DIFFS: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: '新兵', desc: 'まずはルールに慣れよう' },
  { id: 'normal', name: '隊長', desc: 'ちゃんと考えてくる' },
  { id: 'hard', name: 'エース', desc: '読み合いを仕掛けてくる' },
];

export function DeckSelect({ mode, profile, difficulty, onChange, onStart, onBack, onEdit }: {
  mode: 'cpu' | 'online';
  profile: Profile;
  difficulty: Difficulty;
  onChange: (p: { difficulty?: Difficulty }) => void;
  onStart: () => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [peek, setPeek] = useState<string | null>(null);
  const validation = validateDeck(profile.deck, profile.owned);
  const unique = [...countCards(profile.deck).entries()].sort((a, b) => card(a[0]).cost - card(b[0]).cost);

  return (
    <div className="screen screen-scroll has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>{mode === 'cpu' ? 'CPU対戦' : 'オンライン対戦'}</h2>
      </div>

      <div className="deck-detail" style={{ '--a': '#2ee6d6', '--c': '#2ee6d6' } as CSSProperties}>
        <div className="deck-detail-head">
          <div>
            <div className="deck-en">CUSTOM</div>
            <div className="deck-name">マイデッキ<span>{profile.deck.length}/{DECK_SIZE}枚・所持カードのみ</span></div>
          </div>
          <button className="btn small" style={{ '--a': '#2ee6d6' } as CSSProperties} onClick={onEdit}>
            <Pencil size={14} /> 編成する
          </button>
        </div>
        {!validation.ok && (
          <p className="deck-error">{validation.errors[0] ?? 'デッキを編成してください'}</p>
        )}
        <div className="deck-cards">
          {unique.map(([id, n]) => (
            <button key={id} className="deck-line" onClick={() => setPeek(id)}>
              <span className="deck-line-cost">{card(id).cost}</span>
              <CardIcon cardId={id} size={14} />
              <span className="deck-line-name">{card(id).name}</span>
              {n > 1 && <span className="deck-line-n">×{n}</span>}
            </button>
          ))}
        </div>
      </div>

      {mode === 'cpu' && (
        <div className="diff-list">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              className={`diff ${d.id === difficulty ? 'selected' : ''}`}
              style={{ '--a': d.id === difficulty ? '#ff4655' : '#c7d2de' } as CSSProperties}
              onClick={() => onChange({ difficulty: d.id })}
            >
              <b>{d.name}</b>
              <span>{d.desc}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="hud-btn hud-main hud-primary"
        style={{ '--a': '#ff4655' } as CSSProperties}
        disabled={!validation.ok}
        onClick={onStart}
      >
        <span className="hud-ico"><Crosshair size={22} /></span>
        <span className="hud-txt">
          <b>{mode === 'cpu' ? 'DEPLOY' : 'CONTINUE'}</b>
          <small>{mode === 'cpu' ? '出撃！' : 'このデッキで次へ'}</small>
        </span>
        <ChevronRight className="hud-go" size={22} />
      </button>

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
