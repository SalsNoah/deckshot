import { BookOpen, Bot, Dices, Layers, Pencil, Volume2, VolumeX, Wifi, LayoutGrid } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { canFreeGacha } from '../gacha';
import { isDeckReady, rankOf, type Profile } from '../profile';
import { unlockAudio } from '../sfx';
import { cssUrl } from '../ui/assets';
import { RankBadge } from '../ui/RankBadge';

export function Title({ profile, onChange, onCpu, onOnline, onHowTo, onCards, onDeckEdit, onGacha }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onCpu: () => void;
  onOnline: () => void;
  onHowTo: () => void;
  onCards: () => void;
  onDeckEdit: () => void;
  onGacha: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const { tier, next, progress } = rankOf(profile.rp);
  const games = profile.wins + profile.losses + profile.draws;
  const ready = isDeckReady(profile);
  const freeGacha = canFreeGacha(profile.lastFreeGacha);

  const commitName = () => {
    const n = name.trim().slice(0, 12);
    if (n) onChange({ name: n });
    setEditing(false);
  };

  return (
    <div className="screen title-screen has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-title.webp') } as CSSProperties}>
      <button
        className="icon-btn sound-toggle"
        onClick={() => {
          unlockAudio();
          onChange({ sound: !profile.sound });
        }}
        aria-label="サウンド"
      >
        {profile.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      <div className="logo">
        <div className="logo-reticle">
          <span /><span /><span /><span />
        </div>
        <h1>DECK<span>SHOT</span></h1>
        <div className="logo-sub">FPS TACTICAL CARD BATTLE</div>
        <div className="logo-tag">3分で決着する、読み合いカードバトル</div>
      </div>

      <div className="player-card" style={{ '--c': tier.color } as CSSProperties}>
        <div className="rank-emblem">
          <RankBadge id={tier.id} size={68} />
        </div>
        <div className="player-info">
          {editing ? (
            <input
              autoFocus
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
            />
          ) : (
            <button className="player-name" onClick={() => setEditing(true)}>{profile.name} <Pencil size={12} /></button>
          )}
          <div className="rank-name" style={{ color: tier.color }}>{tier.en}<small>{tier.name}</small></div>
          <div className="rank-bar"><div style={{ width: `${progress * 100}%` }} /></div>
          <div className="rank-meta">
            <span>{profile.rp} RP{next ? ` / 次 ${next.min}` : ''}</span>
            <span>{profile.wins}勝 {profile.losses}敗{games ? `（${Math.round((profile.wins / games) * 100)}%）` : ''}</span>
          </div>
        </div>
      </div>

      <div className="menu">
        <button className="btn primary big" onClick={onCpu} disabled={!ready}>
          <Bot size={20} /> CPU対戦{!ready ? '（デッキ未完成）' : ''}
        </button>
        <button className="btn big" onClick={onOnline} disabled={!ready}>
          <Wifi size={20} /> オンライン対戦{!ready ? '（デッキ未完成）' : ''}
        </button>
        <div className="menu-row">
          <button className="btn" onClick={onDeckEdit}><LayoutGrid size={18} /> デッキ編成</button>
          <button className="btn" onClick={onGacha}>
            <Dices size={18} /> ガチャ
            {freeGacha && <span className="menu-badge">無料</span>}
          </button>
        </div>
        <div className="menu-row">
          <button className="btn" onClick={onCards}><Layers size={18} /> カード一覧</button>
          <button className="btn" onClick={onHowTo}><BookOpen size={18} /> 遊び方</button>
        </div>
      </div>

      <div className="title-foot">
        チケット {profile.gachaTickets} ・ 累計 {profile.kills} キル ・ {profile.headshots} HS
        {profile.nukes ? ` ・ 戦術核 ${profile.nukes}回` : ''}
      </div>
    </div>
  );
}
