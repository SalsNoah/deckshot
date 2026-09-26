import { ChevronRight, FastForward, Gift, Layers, Ticket } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { Rarity } from '../../engine';
import {
  canFreeGacha, freeGachaDate, GACHA_MULTI_PACKS, GACHA_MULTI_TICKETS, GACHA_PULL_SIZE,
  grantCards, grantKira, grantSign, KIRA_ONLY_CHANCE, pullGacha, RARITY_WEIGHT, SIGN_CHANCE,
  TICKET_PACKS, FLOW_UNLOCK_MATCHES,
} from '../gacha';
import type { Profile } from '../profile';
import { unlockAudio } from '../sfx';
import { cssUrl, publicAsset } from '../ui/assets';
import { RARITY_COLOR } from '../ui/icons';
import { PackOpening } from './PackOpening';

type PullMode = 'free' | 'ticket' | 'multi';

const QUICK_KEY = 'deckshot.gacha.quick';
const RATES: { r: Rarity; label: string }[] = [
  { r: 'legend', label: 'LEGEND' },
  { r: 'epic', label: 'EPIC' },
  { r: 'rare', label: 'RARE' },
  { r: 'common', label: 'COMMON' },
];
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function Gacha({ profile, onChange, onBack }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onBack: () => void;
}) {
  const free = canFreeGacha(profile.lastFreeGacha);
  const [opening, setOpening] = useState<{
    cards: string[];
    kira: boolean[];
    sign: boolean[];
    fresh: boolean[];
    mode: PullMode;
    key: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [quick, setQuick] = useState(() => localStorage.getItem(QUICK_KEY) === '1');

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const toggleQuick = () => {
    const next = !quick;
    setQuick(next);
    localStorage.setItem(QUICK_KEY, next ? '1' : '0');
  };

  const runPull = (mode: PullMode) => {
    if (mode === 'free' && !canFreeGacha(profile.lastFreeGacha)) {
      flash('本日の無料ガチャは終了しています');
      return;
    }
    if (mode === 'ticket' && profile.gachaTickets < 1) {
      flash('チケットが足りません');
      return;
    }
    if (mode === 'multi' && profile.gachaTickets < GACHA_MULTI_TICKETS) {
      flash(`10連にはチケットが${GACHA_MULTI_TICKETS}枚必要です`);
      return;
    }
    unlockAudio();
    const packs = mode === 'multi' ? GACHA_MULTI_PACKS : 1;
    const ticketCost = mode === 'multi' ? GACHA_MULTI_TICKETS : mode === 'ticket' ? 1 : 0;
    const pulled = pullGacha(Math.random, packs);
    const cards = pulled.map((p) => p.cardId);
    const kira = pulled.map((p) => p.kira);
    const sign = pulled.map((p) => p.sign);
    const fresh = cards.map((id, i) => !profile.owned[id] && cards.indexOf(id) === i);
    onChange({
      owned: grantCards(profile.owned, pulled),
      kiraOwned: grantKira(profile.kiraOwned ?? {}, pulled),
      signOwned: grantSign(profile.signOwned ?? {}, pulled),
      gachaTickets: profile.gachaTickets - ticketCost,
      lastFreeGacha: mode === 'free' ? freeGachaDate() : profile.lastFreeGacha,
    });
    setOpening({ cards, kira, sign, fresh, mode, key: Date.now() });
  };

  if (opening) {
    const againMulti = opening.mode === 'multi';
    const cost = againMulti ? GACHA_MULTI_TICKETS : 1;
    return (
      <PackOpening
        key={opening.key}
        cards={opening.cards}
        kira={opening.kira}
        sign={opening.sign}
        fresh={opening.fresh}
        quick={quick}
        onClose={() => setOpening(null)}
        onAgain={profile.gachaTickets >= cost ? () => runPull(againMulti ? 'multi' : 'ticket') : undefined}
        againLabel={`${againMulti ? '10連' : '単発'} チケット×${cost}・残り${profile.gachaTickets}`}
      />
    );
  }

  const buyTickets = (n: number, label: string) => {
    onChange({ gachaTickets: profile.gachaTickets + n });
    flash(`${label}を購入しました（デモ）`);
  };

  const totalWeight = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);

  return (
    <div className="screen screen-scroll has-art-bg gacha-screen" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>ガチャ</h2>
        <span className="gacha-tickets"><Ticket size={14} /> <b>{profile.gachaTickets}</b></span>
      </div>

      <section className="gacha-banner">
        <div className="gacha-banner-art" aria-hidden>
          <img className="back" src={publicAsset('packs/operator.webp')} alt="" draggable={false} />
          <img src={publicAsset('packs/operator.webp')} alt="" draggable={false} />
        </div>
        <div className="gacha-banner-copy">
          <small>SUPPLY DROP</small>
          <b>OPERATOR<br />SUPPLY</b>
          <p>1パック{GACHA_PULL_SIZE}枚・10連で{GACHA_PULL_SIZE * GACHA_MULTI_PACKS}枚</p>
          <p>引いたカードだけでデッキを組めます</p>
        </div>
        <div className="gacha-rates">
          {RATES.map(({ r, label }) => (
            <span key={r} style={{ '--r': RARITY_COLOR[r] } as CSSProperties}>
              {label}<b>{pct(RARITY_WEIGHT[r] / totalWeight)}</b>
            </span>
          ))}
          <p>オペレーター枠：通常 {pct(1 - KIRA_ONLY_CHANCE - SIGN_CHANCE)}・金枠 {pct(KIRA_ONLY_CHANCE)}・金枠+サイン {pct(SIGN_CHANCE)}</p>
          <p>アニメ化はデッキで{FLOW_UNLOCK_MATCHES}試合使用で解放</p>
        </div>
      </section>

      <div className="gacha-actions menu">
        <button
          className="hud-btn hud-main hud-primary"
          disabled={!free}
          onClick={() => runPull('free')}
        >
          <span className="hud-ico"><Gift size={22} /></span>
          <span className="hud-txt"><b>FREE DROP</b><small>{free ? `本日1回・無料で${GACHA_PULL_SIZE}枚` : '本日は使用済み（毎日リセット）'}</small></span>
          <ChevronRight className="hud-go" size={22} />
        </button>
        <div className="gacha-pull-row">
          <button
            className="hud-btn hud-main"
            disabled={profile.gachaTickets < 1}
            onClick={() => runPull('ticket')}
          >
            <span className="hud-ico"><Ticket size={20} /></span>
            <span className="hud-txt"><b>1-PULL</b><small>チケット1枚</small></span>
          </button>
          <button
            className="hud-btn hud-main gacha-multi"
            style={{ '--a': '#ffb547' } as CSSProperties}
            disabled={profile.gachaTickets < GACHA_MULTI_TICKETS}
            onClick={() => runPull('multi')}
          >
            <span className="hud-ico"><Layers size={20} /></span>
            <span className="hud-txt"><b>10-PULL</b><small>チケット{GACHA_MULTI_TICKETS}枚</small></span>
          </button>
        </div>
        <button className={`gacha-quick${quick ? ' on' : ''}`} onClick={toggleQuick} aria-pressed={quick}>
          <FastForward size={14} />
          スキップ開封
          <i className="gacha-switch" />
        </button>
      </div>

      <section className="gacha-shop">
        <h3>チケット購入（デモ）</h3>
        <p className="gacha-shop-note">チケットを使うと無料枠とは別に何度でも引けます。購入はデモ動作です。</p>
        <div className="gacha-shop-row">
          {TICKET_PACKS.map((p) => (
            <button key={p.id} className="btn" onClick={() => buyTickets(p.tickets, p.label)}>
              {p.label}<small>{p.priceLabel}</small>
            </button>
          ))}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
