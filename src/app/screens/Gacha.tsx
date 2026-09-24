import { Dices, Ticket } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { card } from '../../engine';
import {
  canFreeGacha, freeGachaDate, GACHA_PULL_SIZE, grantCards, pullGacha, TICKET_PACKS,
} from '../gacha';
import type { Profile } from '../profile';
import { CardDetail, HandCard } from '../ui/cards';
import { RARITY_COLOR } from '../ui/icons';

export function Gacha({ profile, onChange, onBack }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onBack: () => void;
}) {
  const free = canFreeGacha(profile.lastFreeGacha);
  const [results, setResults] = useState<string[] | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const runPull = (mode: 'free' | 'ticket') => {
    if (busy) return;
    if (mode === 'free' && !canFreeGacha(profile.lastFreeGacha)) {
      flash('本日の無料ガチャは終了しています');
      return;
    }
    if (mode === 'ticket' && profile.gachaTickets < 1) {
      flash('チケットが足りません');
      return;
    }
    setBusy(true);
    const pulled = pullGacha();
    onChange({
      owned: grantCards(profile.owned, pulled),
      gachaTickets: mode === 'ticket' ? profile.gachaTickets - 1 : profile.gachaTickets,
      lastFreeGacha: mode === 'free' ? freeGachaDate() : profile.lastFreeGacha,
    });
    setResults(pulled);
    setBusy(false);
  };

  const buyTickets = (n: number, label: string) => {
    onChange({ gachaTickets: profile.gachaTickets + n });
    flash(`${label}を購入しました（デモ）`);
  };

  return (
    <div className="screen screen-scroll has-art-bg gacha-screen" style={{ '--screen-bg': 'url(./bgs/bg-menu.webp)' } as CSSProperties}>
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
        <button className="btn primary big" disabled={!free || busy} onClick={() => runPull('free')}>
          無料で{GACHA_PULL_SIZE}枚引く
        </button>
        <button className="btn big" disabled={profile.gachaTickets < 1 || busy} onClick={() => runPull('ticket')}>
          チケットで引く（残り {profile.gachaTickets}）
        </button>
      </div>

      {results && (
        <div className="gacha-results">
          <h3>獲得カード</h3>
          <div className="gacha-result-row">
            {results.map((id, i) => {
              const def = card(id);
              return (
                <div
                  key={`${id}-${i}`}
                  className="gacha-result-card"
                  style={{ '--r': RARITY_COLOR[def.rarity] } as CSSProperties}
                >
                  <HandCard cardId={id} cost={def.cost} onClick={() => setPeek(id)} />
                  <span className="gacha-rarity" style={{ color: RARITY_COLOR[def.rarity] }}>{def.rarity.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
          <button className="btn ghost small" onClick={() => setResults(null)}>閉じる</button>
        </div>
      )}

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
