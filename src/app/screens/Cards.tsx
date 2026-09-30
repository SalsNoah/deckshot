import { useMemo, useState, type CSSProperties } from 'react';
import {
  ALL_CARDS, STREAK_ORDER, STREAKS, ZONE_MODS,
  type CardDef, type CardType, type Rarity,
} from '../../engine';
import { countCosmetics, hasFlow, hasKira, hasSign, type Profile } from '../profile';
import { CardDetail, HandCard } from '../ui/cards';
import { cssUrl } from '../ui/assets';
import { KiraShineIcon, RARITY_COLOR, SignAIcon, StreakIcon } from '../ui/icons';
import { zoneVisual } from '../ui/zoneArt';

const TABS: { id: CardType | 'other'; name: string }[] = [
  { id: 'operator', name: 'オペレーター' },
  { id: 'gear', name: '装備' },
  { id: 'tactic', name: '戦術' },
  { id: 'other', name: 'ストリーク/ゾーン' },
];

const RARITY_FILTERS: { id: Rarity | 'all'; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'common', label: 'COMMON' },
  { id: 'rare', label: 'RARE' },
  { id: 'epic', label: 'EPIC' },
  { id: 'legend', label: 'LEGEND' },
];

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };

type SortKey = 'cost' | 'rarity' | 'name';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'cost', label: 'コスト' },
  { id: 'rarity', label: 'レア' },
  { id: 'name', label: '名前' },
];

function compareCards(a: CardDef, b: CardDef, sort: SortKey): number {
  if (sort === 'cost') return a.cost - b.cost || a.en.localeCompare(b.en);
  if (sort === 'rarity') {
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.cost - b.cost || a.en.localeCompare(b.en);
  }
  return a.name.localeCompare(b.name, 'ja') || a.en.localeCompare(b.en);
}

export function Cards({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [tab, setTab] = useState<CardType | 'other'>('operator');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('cost');
  const [showLocked, setShowLocked] = useState(true);
  const [peek, setPeek] = useState<string | null>(null);

  const list = useMemo(() => {
    if (tab === 'other') return [];
    return ALL_CARDS
      .filter((c) => c.type === tab)
      .filter((c) => rarity === 'all' || c.rarity === rarity)
      .filter((c) => showLocked || (profile.owned[c.id] ?? 0) > 0)
      .sort((a, b) => compareCards(a, b, sort));
  }, [tab, rarity, sort, showLocked, profile.owned]);

  const ownedKinds = Object.values(profile.owned).filter((n) => n > 0).length;
  const cosmetics = useMemo(() => countCosmetics(profile), [profile.kiraOwned, profile.signOwned]);

  return (
    <div className="screen screen-scroll has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-cards.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>カード一覧</h2>
        <div className="collect-head-meta">
          <span className="cosmetic-counts" aria-label={`金枠 ${cosmetics.kira}、サイン ${cosmetics.sign}`}>
            <span className="cosmetic-chip kira" title="金枠">
              <KiraShineIcon size={13} />
              <b>{cosmetics.kira}</b>
            </span>
            <span className="cosmetic-chip sign" title="金枠＋サイン">
              <SignAIcon size={13} />
              <b>{cosmetics.sign}</b>
            </span>
          </span>
          <span className="deck-count">{ownedKinds}/{ALL_CARDS.length}</span>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.name}</button>
        ))}
      </div>
      {tab !== 'other' && (
        <div className="collect-tools">
          <div className="collect-tool-row" role="group" aria-label="レアリティフィルタ">
            <span className="collect-tool-label">レア</span>
            <div className="collect-chips">
              {RARITY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={rarity === f.id ? 'on' : ''}
                  style={f.id !== 'all' ? { '--chip': RARITY_COLOR[f.id] } as CSSProperties : undefined}
                  onClick={() => setRarity(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="collect-tool-row" role="group" aria-label="並び替え">
            <span className="collect-tool-label">並び</span>
            <div className="collect-chips">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={sort === s.id ? 'on' : ''}
                  onClick={() => setSort(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`collect-toggle${showLocked ? ' on' : ''}`}
            aria-pressed={showLocked}
            onClick={() => setShowLocked((v) => !v)}
          >
            <span>
              <b>未所持を表示</b>
              <small>{showLocked ? 'グレーアウトで一覧に含める' : '所持カードのみ表示'}</small>
            </span>
            <i className="gacha-switch" aria-hidden />
          </button>
        </div>
      )}
      {tab !== 'other' ? (
        list.length > 0 ? (
          <div className="card-grid">
            {list.map((c) => {
              const n = profile.owned[c.id] ?? 0;
              const kiraN = profile.kiraOwned?.[c.id] ?? 0;
              const signN = profile.signOwned?.[c.id] ?? 0;
              const showKira = hasKira(profile, c.id);
              const showSign = hasSign(profile, c.id);
              const showFlow = hasFlow(profile, c.id);
              const locked = n <= 0;
              return (
                <div key={c.id} className={`collect-card ${locked ? 'locked' : ''} ${showKira ? 'has-kira' : ''}`}>
                  <HandCard
                    cardId={c.id}
                    cost={c.cost}
                    disabled={locked}
                    kira={showKira}
                    sign={showSign}
                    flow={showFlow}
                    onClick={() => !locked && setPeek(c.id)}
                  />
                  <span className="collect-count">{locked ? '未所持' : `×${n}`}</span>
                  {!locked && c.type === 'operator' && (
                    <span className="collect-cosmetics" aria-label={`キラ ${kiraN}、サイン ${signN}`}>
                      <span className={`cosmetic-chip kira ${kiraN <= 0 ? 'empty' : ''}`}>
                        <KiraShineIcon size={10} /><b>{kiraN}</b>
                      </span>
                      <span className={`cosmetic-chip sign ${signN <= 0 ? 'empty' : ''}`}>
                        <SignAIcon size={10} /><b>{signN}</b>
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="collect-empty">該当するカードがありません</p>
        )
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
            <CardDetail cardId={peek} kira={hasKira(profile, peek)} sign={hasSign(profile, peek)} flow={hasFlow(profile, peek)} />
            <button className="btn ghost small" onClick={() => setPeek(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
