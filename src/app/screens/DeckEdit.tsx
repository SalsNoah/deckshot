import { Check, ChevronRight } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  ALL_CARDS, DECK_SIZE, DECKS, MAX_COPIES, card, countCards, validateDeck, type CardType,
} from '../../engine';
import type { Profile } from '../profile';
import { hasFlow, hasKira, hasSign } from '../profile';
import { CardDetail, HandCard } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { TYPE_LABEL } from '../ui/text';

const TABS: { id: CardType | 'all'; name: string }[] = [
  { id: 'all', name: 'すべて' },
  { id: 'operator', name: 'オペ' },
  { id: 'gear', name: '装備' },
  { id: 'tactic', name: '戦術' },
];

export function DeckEdit({ profile, onChange, onBack }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => [...profile.deck]);
  const [tab, setTab] = useState<CardType | 'all'>('all');
  const [peek, setPeek] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const deckCounts = useMemo(() => countCards(draft), [draft]);
  const validation = useMemo(() => validateDeck(draft, profile.owned), [draft, profile.owned]);

  const ownedList = useMemo(() => {
    const ids = Object.keys(profile.owned).filter((id) => (profile.owned[id] ?? 0) > 0);
    return ALL_CARDS
      .filter((c) => ids.includes(c.id) && (tab === 'all' || c.type === tab))
      .sort((a, b) => a.cost - b.cost || a.en.localeCompare(b.en));
  }, [profile.owned, tab]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  };

  const add = (id: string) => {
    const inDeck = deckCounts.get(id) ?? 0;
    const owned = profile.owned[id] ?? 0;
    if (draft.length >= DECK_SIZE) return flash(`デッキは${DECK_SIZE}枚まで`);
    if (inDeck >= MAX_COPIES) return flash(`同じカードは${MAX_COPIES}枚まで`);
    if (inDeck >= owned) return flash('所持枚数が足りません');
    setDraft((d) => [...d, id]);
  };

  const remove = (id: string) => {
    setDraft((d) => {
      const i = d.lastIndexOf(id);
      if (i < 0) return d;
      return [...d.slice(0, i), ...d.slice(i + 1)];
    });
  };

  const applyTemplate = (deckId: string) => {
    const preset = DECKS.find((d) => d.id === deckId);
    if (!preset) return;
    const missing: string[] = [];
    const counts = countCards(preset.cards);
    for (const [id, n] of counts) {
      if ((profile.owned[id] ?? 0) < n) missing.push(card(id).name);
    }
    if (missing.length) {
      flash(`所持不足: ${missing.slice(0, 3).join('、')}${missing.length > 3 ? '…' : ''}`);
      return;
    }
    setDraft([...preset.cards]);
    flash(`${preset.name}を適用`);
  };

  const save = () => {
    const v = validateDeck(draft, profile.owned);
    if (!v.ok) {
      flash(v.errors[0] ?? 'デッキが不正です');
      return;
    }
    onChange({ deck: [...draft], deckId: 'custom' });
    flash('デッキを保存しました');
    window.setTimeout(onBack, 400);
  };

  const uniqueDeck = [...deckCounts.entries()].sort((a, b) => card(a[0]).cost - card(b[0]).cost);

  return (
    <div className="screen screen-scroll has-art-bg deck-edit" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>デッキ編成</h2>
        <span className={`deck-count ${draft.length === DECK_SIZE ? 'ok' : ''}`}>{draft.length}/{DECK_SIZE}</span>
      </div>

      <div className="deck-templates">
        <span>テンプレ:</span>
        {DECKS.map((d) => (
          <button key={d.id} className="btn small ghost" style={{ color: d.color }} onClick={() => applyTemplate(d.id)}>
            {d.en}
          </button>
        ))}
      </div>

      <section className="deck-edit-current">
        <h3>編成中</h3>
        {uniqueDeck.length === 0 ? (
          <p className="muted">下の所持カードをタップして追加</p>
        ) : (
          <div className="deck-cards">
            {uniqueDeck.map(([id, n]) => (
              <button key={id} className="deck-line" onClick={() => remove(id)} onContextMenu={(e) => { e.preventDefault(); setPeek(id); }}>
                <span className="deck-line-cost">{card(id).cost}</span>
                <span className="deck-line-name">{card(id).name}</span>
                <span className="deck-line-type">{TYPE_LABEL[card(id).type]}</span>
                <span className="deck-line-n">×{n}</span>
              </button>
            ))}
          </div>
        )}
        {!validation.ok && draft.length === DECK_SIZE && (
          <p className="deck-error">{validation.errors[0]}</p>
        )}
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.name}</button>
        ))}
      </div>

      <div className="card-grid deck-pool">
        {ownedList.map((c) => {
          const inDeck = deckCounts.get(c.id) ?? 0;
          const owned = profile.owned[c.id] ?? 0;
          const full = inDeck >= MAX_COPIES || inDeck >= owned || draft.length >= DECK_SIZE;
          return (
            <div key={c.id} className="pool-card">
              <HandCard
                cardId={c.id}
                cost={c.cost}
                disabled={full && inDeck === 0}
                kira={hasKira(profile, c.id)}
                sign={hasSign(profile, c.id)}
                flow={hasFlow(profile, c.id)}
                onClick={() => (inDeck > 0 && full ? remove(c.id) : add(c.id))}
              />
              <div className="pool-meta">
                <span>所持 {owned}</span>
                <span className={inDeck ? 'on' : ''}>編成 {inDeck}/{MAX_COPIES}</span>
              </div>
              <div className="pool-actions">
                <button className="btn small" disabled={full} onClick={() => add(c.id)}>+</button>
                <button className="btn small ghost" disabled={inDeck === 0} onClick={() => remove(c.id)}>−</button>
                <button className="btn small ghost" onClick={() => setPeek(c.id)}>?</button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="hud-btn hud-main hud-primary sticky-save"
        disabled={!validation.ok}
        onClick={save}
      >
        <span className="hud-ico"><Check size={22} /></span>
        <span className="hud-txt"><b>SAVE DECK</b><small>このデッキを保存（{draft.length}/{DECK_SIZE}）</small></span>
        <ChevronRight className="hud-go" size={22} />
      </button>

      {toast && <div className="toast">{toast}</div>}

      {peek && (
        <div className="modal-bg" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CardDetail cardId={peek} kira={hasKira(profile, peek)} sign={hasSign(profile, peek)} flow={hasFlow(profile, peek)} />
            <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
