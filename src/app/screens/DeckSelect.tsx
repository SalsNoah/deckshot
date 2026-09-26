import { Check, ChevronRight, Crosshair, Pencil } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { DECK_SIZE, card, countCards, validateDeck, type CardType, type Difficulty } from '../../engine';
import type { Profile } from '../profile';
import { CardDetail } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { CardIcon } from '../ui/icons';
import { TYPE_LABEL } from '../ui/text';

const DIFFS: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: '新兵', desc: 'まずはルールに慣れよう' },
  { id: 'normal', name: '隊長', desc: 'ちゃんと考えてくる' },
  { id: 'hard', name: 'エース', desc: '読み合いを仕掛けてくる' },
];

const TYPE_ORDER: CardType[] = ['operator', 'gear', 'tactic'];
const TYPE_EN: Record<CardType, string> = { operator: 'OPERATOR', gear: 'GEAR', tactic: 'TACTIC' };
const CURVE_MAX_COST = 6;

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
  const curve = Array.from({ length: CURVE_MAX_COST + 1 }, (_, c) =>
    profile.deck.filter((id) => Math.min(CURVE_MAX_COST, card(id).cost) === c).length);
  const curvePeak = Math.max(1, ...curve);
  const groups = TYPE_ORDER
    .map((t) => ({ t, list: unique.filter(([id]) => card(id).type === t) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="screen screen-scroll has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>{mode === 'cpu' ? 'CPU対戦' : 'オンライン対戦'}</h2>
      </div>

      <div className="deck-detail">
        <div className="deck-detail-head">
          <div>
            <div className="deck-en">CUSTOM</div>
            <div className="deck-name">マイデッキ<span>{profile.deck.length}/{DECK_SIZE}枚・所持カードのみ</span></div>
          </div>
          <button className="btn small" onClick={onEdit}>
            <Pencil size={14} /> 編成する
          </button>
        </div>
        {!validation.ok && (
          <p className="deck-error">{validation.errors[0] ?? 'デッキを編成してください'}</p>
        )}

        <div className="mana-curve" aria-label="コストカーブ">
          {curve.map((n, c) => (
            <div key={c} className="mc-col">
              <div className="mc-bar" style={{ '--h': `${(n / curvePeak) * 100}%` } as CSSProperties}>
                <i />
                {n > 0 && <span>{n}</span>}
              </div>
              <b>{c === CURVE_MAX_COST ? `${c}+` : c}</b>
            </div>
          ))}
        </div>

        {groups.map((g) => (
          <section key={g.t} className="deck-group">
            <h4>{TYPE_EN[g.t]}<span>{TYPE_LABEL[g.t]}・{g.list.reduce((s, [, n]) => s + n, 0)}枚</span></h4>
            <div className="deck-cards">
              {g.list.map(([id, n]) => (
                <button key={id} className="deck-line" onClick={() => setPeek(id)}>
                  <span className="deck-line-cost">{card(id).cost}</span>
                  <CardIcon cardId={id} size={14} />
                  <span className="deck-line-name">{card(id).name}</span>
                  {n > 1 && <span className="deck-line-n">×{n}</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {mode === 'cpu' && (
        <div className="diff-list">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              className={`diff ${d.id === difficulty ? 'selected' : ''}`}
              aria-pressed={d.id === difficulty}
              onClick={() => onChange({ difficulty: d.id })}
            >
              {d.id === difficulty && <Check size={13} strokeWidth={3} className="diff-check" />}
              <b>{d.name}</b>
              <span>{d.desc}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="hud-btn hud-main hud-primary"
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
