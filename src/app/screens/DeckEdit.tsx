import { Check, ChevronRight, Minus, Plus } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  ALL_CARDS, DECK_SIZE, MAX_COPIES, countCards, validateDeck, type CardType,
} from '../../engine';
import { DECK_SLOTS, hasFlow, hasKira, hasSign, type Profile } from '../profile';
import { DeckRoster, DeckSlots } from '../ui/DeckRoster';
import { CardDetail, HandCard } from '../ui/cards';
import { cssUrl } from '../ui/assets';

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
  const [slot, setSlot] = useState(profile.activeDeck);
  const [drafts, setDrafts] = useState(() =>
    Array.from({ length: DECK_SLOTS }, (_, i) => [...(profile.decks[i] ?? [])]));
  const [tab, setTab] = useState<CardType | 'all'>('all');
  const [peek, setPeek] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const draft = drafts[slot]!;
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

  const setDraft = (next: string[] | ((cur: string[]) => string[])) => {
    setDrafts((all) => {
      const cur = all[slot]!;
      const cards = typeof next === 'function' ? next(cur) : next;
      return all.map((d, i) => (i === slot ? cards : d));
    });
  };

  /** Why `id` can't be added right now, or null if it can. */
  const addBlock = (id: string): string | null => {
    const inDeck = deckCounts.get(id) ?? 0;
    if (draft.length >= DECK_SIZE) return `デッキは${DECK_SIZE}枚まで`;
    if (inDeck >= MAX_COPIES) return `同じカードは${MAX_COPIES}枚まで`;
    if (inDeck >= (profile.owned[id] ?? 0)) return '所持枚数が足りません';
    return null;
  };

  const add = (id: string) => {
    const block = addBlock(id);
    if (block) return flash(block);
    setDraft((d) => [...d, id]);
  };

  const remove = (id: string) => {
    setDraft((d) => {
      const i = d.lastIndexOf(id);
      if (i < 0) return d;
      return [...d.slice(0, i), ...d.slice(i + 1)];
    });
  };

  const save = () => {
    const v = validateDeck(draft, profile.owned);
    if (!v.ok) {
      flash(v.errors[0] ?? 'デッキが不正です');
      return;
    }
    onChange({
      decks: drafts.map((d) => [...d]),
      activeDeck: slot,
      deck: [...draft],
      deckId: 'custom',
    });
    flash(`SET ${slot + 1} を保存しました`);
    window.setTimeout(onBack, 400);
  };

  return (
    <div className="screen screen-scroll has-art-bg deck-edit" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>デッキ編成</h2>
        <span className={`deck-count ${draft.length === DECK_SIZE ? 'ok' : ''}`}>{draft.length}/{DECK_SIZE}</span>
      </div>

      <DeckSlots
        active={slot}
        lengths={drafts.map((d) => d.length)}
        onSelect={setSlot}
      />

      <section className="deck-detail">
        <div className="deck-detail-head">
          <div>
            <div className="deck-en">SET {slot + 1}</div>
            <div className="deck-name">編成中<span>{draft.length}/{DECK_SIZE}枚・タップで詳細</span></div>
          </div>
        </div>
        <DeckRoster
          cards={draft}
          profile={profile}
          onCard={setPeek}
          emptyHint="下の所持カードをタップして追加"
        />
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
                onClick={() => setPeek(c.id)}
              />
              <div className="pool-meta">
                <span>所持 {owned}</span>
                <span className={inDeck ? 'on' : ''}>編成 {inDeck}/{MAX_COPIES}</span>
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
        <span className="hud-txt"><b>SAVE DECK</b><small>SET {slot + 1} を保存（{draft.length}/{DECK_SIZE}）</small></span>
        <ChevronRight className="hud-go" size={22} />
      </button>

      {toast && <div className="toast">{toast}</div>}

      {peek && (() => {
        const inDeck = deckCounts.get(peek) ?? 0;
        const block = addBlock(peek);
        return (
          <div className="modal-bg" onClick={() => setPeek(null)}>
            <div className="modal deck-peek" onClick={(e) => e.stopPropagation()}>
              <CardDetail cardId={peek} kira={hasKira(profile, peek)} sign={hasSign(profile, peek)} flow={hasFlow(profile, peek)} />
              <div className="deck-peek-foot">
                <div className="deck-peek-meta">
                  <span>所持<b>{profile.owned[peek] ?? 0}</b></span>
                  <span className={inDeck ? 'on' : ''}>編成<b>{inDeck}/{MAX_COPIES}</b></span>
                  <span>デッキ<b>{draft.length}/{DECK_SIZE}</b></span>
                </div>
                <div className="deck-peek-actions">
                  <button className="btn ghost" disabled={inDeck === 0} onClick={() => remove(peek)}>
                    <Minus size={16} />外す
                  </button>
                  <button className="btn primary" disabled={!!block} onClick={() => add(peek)}>
                    <Plus size={16} />追加
                  </button>
                </div>
                {block && <p className="deck-peek-note">{block}</p>}
                <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
