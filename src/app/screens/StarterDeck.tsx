import { Check, ChevronRight } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { DECKS, card, countCards, type Rarity } from '../../engine';
import type { Profile } from '../profile';
import { DeckRoster } from '../ui/DeckRoster';
import { CardDetail, HandCard } from '../ui/cards';
import { cssUrl, publicAsset } from '../ui/assets';

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };

/** A deck's headline cards: rarest first, then priciest. */
function headliners(cards: string[], n: number): string[] {
  return [...countCards(cards).keys()]
    .sort((a, b) => RANK[card(b).rarity] - RANK[card(a).rarity] || card(b).cost - card(a).cost)
    .slice(0, n);
}

/** First-run pick between the three preset decks; the chosen one becomes the player's collection. */
export function StarterDeck({ profile, onPick }: { profile: Profile; onPick: (deckId: string) => void }) {
  const [sel, setSel] = useState(DECKS[0]!.id);
  const [peek, setPeek] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const deck = DECKS.find((d) => d.id === sel) ?? DECKS[0]!;
  const stars = useMemo(() => headliners(deck.cards, 3), [deck]);

  return (
    <div className="screen screen-scroll has-art-bg starter" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="starter-head">
        <small>STARTER DECK</small>
        <h2>最初のデッキを選ぼう</h2>
        <p>選んだデッキの30枚がそのまま手に入る。ガチャで集めたカードで、あとから自由に組み替えられる。</p>
      </div>

      <div className="starter-picks" role="radiogroup" aria-label="スターターデッキ">
        {DECKS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={d.id === sel}
            className={`starter-pick ${d.id === sel ? 'on' : ''}`}
            style={{ '--c': d.color } as CSSProperties}
            onClick={() => setSel(d.id)}
          >
            <span className="starter-pick-art" aria-hidden>
              <img src={publicAsset(`portraits/${headliners(d.cards, 1)[0]}.webp`)} alt="" draggable={false} />
            </span>
            <b>{d.en}</b>
            <small>{d.style}</small>
          </button>
        ))}
      </div>

      <section key={deck.id} className="deck-detail starter-detail" style={{ '--a': deck.color } as CSSProperties}>
        <div className="deck-detail-head">
          <div>
            <div className="deck-en" style={{ '--c': deck.color } as CSSProperties}>{deck.en}</div>
            <div className="deck-name">{deck.name}<span>{deck.style}・{deck.cards.length}枚</span></div>
          </div>
        </div>
        <p>{deck.description}</p>
        <div className="starter-stars">
          {stars.map((id) => (
            <div key={id} className="starter-star">
              <HandCard cardId={id} cost={card(id).cost} artSize={110} onClick={() => setPeek(id)} />
            </div>
          ))}
        </div>
        <DeckRoster cards={deck.cards} profile={profile} onCard={setPeek} />
      </section>

      <button className="hud-btn hud-main hud-primary sticky-save" onClick={() => setConfirm(true)}>
        <span className="hud-ico"><Check size={22} /></span>
        <span className="hud-txt"><b>DEPLOY</b><small>{deck.name}デッキで始める</small></span>
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

      {confirm && (
        <div className="modal-bg" onClick={() => setConfirm(false)}>
          <div className="modal starter-confirm" style={{ '--c': deck.color } as CSSProperties} onClick={(e) => e.stopPropagation()}>
            <h3>{deck.name}デッキで始める？</h3>
            <p>このデッキの30枚を受け取ります。スターターデッキを選べるのは一度だけです。</p>
            <button className="btn primary" onClick={() => onPick(deck.id)}>決定</button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>もう少し考える</button>
          </div>
        </div>
      )}
    </div>
  );
}
