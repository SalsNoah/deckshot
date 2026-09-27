/**
 * Shared deck roster: unique cards as HandCard tiles, grouped by type.
 * Used by both deck edit and pre-battle confirm so the layouts match.
 */
import { DECK_SIZE, card, countCards, type CardType } from '../../engine';
import { hasFlow, hasKira, hasSign, type Profile } from '../profile';
import { HandCard } from './cards';
import { TYPE_LABEL } from './text';

const TYPE_ORDER: CardType[] = ['operator', 'gear', 'tactic'];
const TYPE_EN: Record<CardType, string> = { operator: 'OPERATOR', gear: 'GEAR', tactic: 'TACTIC' };

export function DeckRoster({ cards, profile, onCard, emptyHint = 'カードがありません' }: {
  cards: string[];
  profile: Pick<Profile, 'kiraOwned' | 'signOwned' | 'flowOwned'>;
  onCard?: (id: string) => void;
  emptyHint?: string;
}) {
  const unique = [...countCards(cards).entries()].sort((a, b) => card(a[0]).cost - card(b[0]).cost);
  const groups = TYPE_ORDER
    .map((t) => ({ t, list: unique.filter(([id]) => card(id).type === t) }))
    .filter((g) => g.list.length > 0);

  if (!groups.length) {
    return <p className="muted deck-roster-empty">{emptyHint}</p>;
  }

  return (
    <div className="deck-roster">
      {groups.map((g) => (
        <section key={g.t} className="deck-group">
          <h4>
            {TYPE_EN[g.t]}
            <span>{TYPE_LABEL[g.t]}・{g.list.reduce((s, [, n]) => s + n, 0)}枚</span>
          </h4>
          <div className="deck-roster-grid">
            {g.list.map(([id, n]) => (
              <div key={id} className="deck-roster-card">
                <HandCard
                  cardId={id}
                  cost={card(id).cost}
                  kira={hasKira(profile, id)}
                  sign={hasSign(profile, id)}
                  flow={hasFlow(profile, id)}
                  artSize={72}
                  onClick={() => onCard?.(id)}
                />
                {n > 1 && <b className="deck-roster-n">×{n}</b>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Slot tabs for the 3 saved decks. */
export function DeckSlots({ active, lengths, onSelect }: {
  active: number;
  lengths: number[];
  onSelect: (i: number) => void;
}) {
  return (
    <div className="deck-slots" role="tablist" aria-label="デッキスロット">
      {lengths.map((n, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          className={i === active ? 'on' : ''}
          onClick={() => onSelect(i)}
        >
          <b>SET {i + 1}</b>
          <small>{n}/{DECK_SIZE}</small>
        </button>
      ))}
    </div>
  );
}
