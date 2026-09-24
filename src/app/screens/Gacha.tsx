import { Dices, Ticket } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  canFreeGacha, freeGachaDate, GACHA_MULTI_PACKS, GACHA_MULTI_TICKETS, GACHA_PULL_SIZE,
  grantCards, grantFlow, grantKira, pullGacha, TICKET_PACKS,
} from '../gacha';
import type { Profile } from '../profile';
import { unlockAudio } from '../sfx';
import { cssUrl } from '../ui/assets';
import { PackOpening } from './PackOpening';

type PullMode = 'free' | 'ticket' | 'multi';

export function Gacha({ profile, onChange, onBack }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onBack: () => void;
}) {
  const free = canFreeGacha(profile.lastFreeGacha);
  const [opening, setOpening] = useState<{
    cards: string[];
    kira: boolean[];
    flow: boolean[];
    fresh: boolean[];
    mode: PullMode;
    key: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
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
    const flow = pulled.map((p) => p.flow);
    const fresh = cards.map((id, i) => !profile.owned[id] && cards.indexOf(id) === i);
    onChange({
      owned: grantCards(profile.owned, pulled),
      kiraOwned: grantKira(profile.kiraOwned ?? {}, pulled),
      flowOwned: grantFlow(profile.flowOwned ?? {}, pulled),
      gachaTickets: profile.gachaTickets - ticketCost,
      lastFreeGacha: mode === 'free' ? freeGachaDate() : profile.lastFreeGacha,
    });
    setOpening({ cards, kira, flow, fresh, mode, key: Date.now() });
  };

  if (opening) {
    const againMulti = opening.mode === 'multi';
    const canAgain = againMulti
      ? profile.gachaTickets >= GACHA_MULTI_TICKETS
      : profile.gachaTickets >= 1;
    return (
      <PackOpening
        key={opening.key}
        cards={opening.cards}
        kira={opening.kira}
        flow={opening.flow}
        fresh={opening.fresh}
        onClose={() => setOpening(null)}
        onAgain={canAgain ? () => runPull(againMulti ? 'multi' : 'ticket') : undefined}
        againLabel={againMulti
          ? `もう一度10連（チケット×${GACHA_MULTI_TICKETS}・残り ${profile.gachaTickets}）`
          : `チケットでもう一度（残り ${profile.gachaTickets}）`}
      />
    );
  }

  const buyTickets = (n: number, label: string) => {
    onChange({ gachaTickets: profile.gachaTickets + n });
    flash(`${label}を購入しました（デモ）`);
  };

  return (
    <div className="screen screen-scroll has-art-bg gacha-screen" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>ガチャ</h2>
      </div>

      <div className="gacha-hero">
        <Dices size={28} />
        <div>
          <b>オペレーター補給</b>
          <p>1回で{GACHA_PULL_SIZE}枚、10連で{GACHA_PULL_SIZE * GACHA_MULTI_PACKS}枚。所持カードだけでデッキを組めます。</p>
        </div>
      </div>

      <div className="gacha-wallet">
        <span><Ticket size={14} /> チケット <b>{profile.gachaTickets}</b></span>
        <span className={free ? 'ok' : 'off'}>{free ? '本日の無料ガチャ：残り1回' : '本日の無料ガチャ：使用済'}</span>
      </div>

      <div className="gacha-actions">
        <button className="btn primary big" disabled={!free} onClick={() => runPull('free')}>
          無料で{GACHA_PULL_SIZE}枚引く
        </button>
        <button className="btn big" disabled={profile.gachaTickets < 1} onClick={() => runPull('ticket')}>
          1回引く（チケット×1・残り {profile.gachaTickets}）
        </button>
        <button
          className="btn big gacha-multi"
          disabled={profile.gachaTickets < GACHA_MULTI_TICKETS}
          onClick={() => runPull('multi')}
        >
          10連ガチャ（チケット×{GACHA_MULTI_TICKETS}・{GACHA_PULL_SIZE * GACHA_MULTI_PACKS}枚）
        </button>
      </div>

      <section className="gacha-shop">
        <h3><Ticket size={16} /> 課金アイテム（デモ）</h3>
        <p className="gacha-shop-note">チケットを使うと無料枠とは別に何度でも引けます。購入はデモ動作です。</p>
        <div className="ticket-packs">
          {TICKET_PACKS.map((p) => (
            <button key={p.id} className="ticket-pack" onClick={() => buyTickets(p.tickets, p.label)}>
              <b>{p.label}</b>
              <span>{p.priceLabel}</span>
            </button>
          ))}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
