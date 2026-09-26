import { BookOpen, Bot, ChevronRight, Dices, Layers, Pencil, Sparkles, Volume2, VolumeX, Wifi, LayoutGrid } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { canFreeGacha } from '../gacha';
import { countCosmetics, isDeckReady, rankOf, type Profile } from '../profile';
import { unlockAudio } from '../sfx';
import { cssUrl } from '../ui/assets';
import { KiraShineIcon, SignAIcon } from '../ui/icons';
import { RankBadge } from '../ui/RankBadge';

export function Title({ profile, onChange, onCpu, onOnline, onHowTo, onCards, onDeckEdit, onGacha, onAnimPreview }: {
  profile: Profile;
  onChange: (p: Partial<Profile>) => void;
  onCpu: () => void;
  onOnline: () => void;
  onHowTo: () => void;
  onCards: () => void;
  onDeckEdit: () => void;
  onGacha: () => void;
  onAnimPreview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const { tier, next, progress } = rankOf(profile.rp);
  const games = profile.wins + profile.losses + profile.draws;
  const ready = isDeckReady(profile);
  const freeGacha = canFreeGacha(profile.lastFreeGacha);
  const cosmetics = countCosmetics(profile);

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

      <div className="hud-panel player-card" style={{ '--a': tier.color, '--c': tier.color } as CSSProperties}>
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
        <button className="hud-btn hud-main" style={{ '--a': '#2ee6d6' } as CSSProperties} onClick={onOnline} disabled={!ready}>
          <span className="hud-ico"><Wifi size={22} /></span>
          <span className="hud-txt"><b>ONLINE BATTLE</b><small>オンライン対戦{!ready ? '（デッキ未完成）' : ''}</small></span>
          <ChevronRight className="hud-go" size={22} />
        </button>
        <button className="hud-btn hud-main hud-primary" style={{ '--a': '#ff4655' } as CSSProperties} onClick={onCpu} disabled={!ready}>
          <span className="hud-ico"><Bot size={22} /></span>
          <span className="hud-txt"><b>CPU BATTLE</b><small>CPU対戦{!ready ? '（デッキ未完成）' : ''}</small></span>
          <ChevronRight className="hud-go" size={22} />
        </button>
        <div className="hud-grid">
          <button className="hud-btn hud-tile" style={{ '--a': '#2ee6d6' } as CSSProperties} onClick={onDeckEdit}>
            <LayoutGrid size={18} className="hud-tile-ico" />
            <b>DECK</b><small>デッキ編成</small>
          </button>
          <button className="hud-btn hud-tile" style={{ '--a': '#ffb547' } as CSSProperties} onClick={onGacha}>
            <Dices size={18} className="hud-tile-ico" />
            <b>SUPPLY</b><small>ガチャ</small>
            {freeGacha && <span className="menu-badge">無料</span>}
          </button>
          <button className="hud-btn hud-tile" style={{ '--a': '#8fb8ff' } as CSSProperties} onClick={onCards}>
            <Layers size={18} className="hud-tile-ico" />
            <b>ARSENAL</b><small>カード一覧</small>
            <span className="cosmetic-counts tile" aria-label={`金枠 ${cosmetics.kira}、サイン ${cosmetics.sign}`}>
              <span className="cosmetic-chip kira"><KiraShineIcon size={11} /><b>{cosmetics.kira}</b></span>
              <span className="cosmetic-chip sign"><SignAIcon size={11} /><b>{cosmetics.sign}</b></span>
            </span>
          </button>
          <button className="hud-btn hud-tile" style={{ '--a': '#c7d2de' } as CSSProperties} onClick={onHowTo}>
            <BookOpen size={18} className="hud-tile-ico" />
            <b>BRIEFING</b><small>遊び方</small>
          </button>
          <button className="hud-btn hud-tile" style={{ '--a': '#e8a0ff' } as CSSProperties} onClick={onAnimPreview}>
            <Sparkles size={18} className="hud-tile-ico" />
            <b>PREVIEW</b><small>レアプレビュー</small>
          </button>
        </div>
      </div>

      <div className="title-foot">
        チケット {profile.gachaTickets} ・ 累計 {profile.kills} キル ・ {profile.headshots} HS
        {profile.nukes ? ` ・ 戦術核 ${profile.nukes}回` : ''}
      </div>
    </div>
  );
}
