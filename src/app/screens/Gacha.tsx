import { Dices, Ticket } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  canFreeGacha, freeGachaDate, GACHA_PULL_SIZE, grantCards, pullGacha, TICKET_PACKS,
} from '../gacha';
import type { Profile } from '../profile';
import { unlockAudio } from '../sfx';
import { cssUrl } from '../ui/assets';
import { PackOpening } from './PackOpening';

export function Gacha({ profile, onChange, onBack }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onBack: () => void;
}) {
  const free = canFreeGacha(profile.lastFreeGacha);
  const [opening, setOpening] = useState<{ cards: string[]; fresh: boolean[]; key: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const runPull = (mode: 'free' | 'ticket') => {
    if (mode === 'free' && !canFreeGacha(profile.lastFreeGacha)) {
      flash('本日の無料ガチャは終了しています');
      return;
    }
    if (mode === 'ticket' && profile.gachaTickets < 1) {
      flash('チケットが足りません');
      return;
    }
    unlockAudio();
    const pulled = pullGacha();
    const fresh = pulled.map((id, i) => !profile.owned[id] && pulled.indexOf(id) === i);
    onChange({
      owned: grantCards(profile.owned, pulled),
      gachaTickets: mode === 'ticket' ? profile.gachaTickets - 1 : profile.gachaTickets,
      lastFreeGacha: mode === 'free' ? freeGachaDate() : profile.lastFreeGacha,
    });
    setOpening({ cards: pulled, fresh, key: Date.now() });
  };

  if (opening) {
    return (
      <PackOpening
        key={opening.key}
        cards={opening.cards}
        fresh={opening.fresh}
        onClose={() => setOpening(null)}
        onAgain={profile.gachaTickets > 0 ? () => runPull('ticket') : undefined}
        againLabel={`チケットでもう一度（残り ${profile.gachaTickets}）`}
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
          <p>1回で{GACHA_PULL_SIZE}枚。所持カードだけでデッキを組めます。</p>
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
          チケットで引く（残り {profile.gachaTickets}）
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
