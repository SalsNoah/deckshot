import { BookOpen, Bot, ChevronRight, Dices, Layers, LayoutGrid, Pencil, Ticket, Volume2, VolumeX, Wifi } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { canFreeGacha } from '../gacha';
import { VOL_STEPS, isDeckReady, rankOf, type Profile, type VolStep } from '../profile';
import { setBgm, setBgmVolume, setSeVolume, unlockAudio } from '../sfx';
import { cssUrl } from '../ui/assets';
import { RankBadge } from '../ui/RankBadge';

function VolRow({ label, value, onChange }: {
  label: string;
  value: VolStep;
  onChange: (v: VolStep) => void;
}) {
  return (
    <div className="vol-row">
      <span className="vol-label">{label}</span>
      <div className="vol-steps" role="group" aria-label={label}>
        {VOL_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            className={value === step ? 'on' : value > step ? 'lit' : ''}
            aria-pressed={value === step}
            onClick={() => onChange(step)}
          >
            {step === 0 ? '×' : step}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [audioOpen, setAudioOpen] = useState(false);
  const audioRef = useRef<HTMLDivElement>(null);
  const { tier, next, progress } = rankOf(profile.rp);
  const games = profile.wins + profile.losses + profile.draws;
  const ready = isDeckReady(profile);
  const freeGacha = canFreeGacha(profile.lastFreeGacha);
  const muted = profile.bgmVol === 0 && profile.seVol === 0;

  useEffect(() => {
    if (!audioOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!audioRef.current?.contains(e.target as Node)) setAudioOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [audioOpen]);

  const commitName = () => {
    const n = name.trim().slice(0, 12);
    if (n) onChange({ name: n });
    setEditing(false);
  };

  const setBgmVol = (v: VolStep) => {
    unlockAudio();
    setBgmVolume(v);
    if (v > 0) setBgm('menu');
    else setBgm('off');
    onChange({ bgmVol: v });
  };
  const setSeVol = (v: VolStep) => {
    unlockAudio();
    setSeVolume(v);
    onChange({ seVol: v });
  };

  return (
    <div className="screen title-screen has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-title.webp') } as CSSProperties}>
      <div className="title-top">
        <span className="title-top-spacer" aria-hidden />
        <div className="audio-wrap" ref={audioRef}>
          <button
            className="icon-btn sound-toggle"
            onClick={() => { unlockAudio(); setAudioOpen((o) => !o); }}
            aria-label="音量"
            aria-expanded={audioOpen}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {audioOpen && (
            <div className="audio-panel">
              <VolRow label="BGM" value={profile.bgmVol} onChange={setBgmVol} />
              <VolRow label="SE" value={profile.seVol} onChange={setSeVol} />
            </div>
          )}
        </div>
      </div>

      <div className="title-vert" aria-hidden>DECKSHOT — TACTICAL CARD BATTLE — VOL.01</div>

      <div className="logo">
        <h1><span className="logo-deck">DECK</span><span className="logo-shot">SHOT</span></h1>
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
          <div className={`rank-name ${tier.id === 'rookie' ? 'is-rookie' : ''}`}>{tier.en}<small>{tier.name}</small></div>
          <div className="rank-bar"><div style={{ width: `${progress * 100}%` }} /></div>
          <div className="rank-meta">
            <span>{profile.rp} RP{next ? ` / NEXT ${next.min}` : ''}</span>
            <span>{profile.wins}W {profile.losses}L{games ? `  ${Math.round((profile.wins / games) * 100)}%` : ''}</span>
          </div>
          <div className="service-record" aria-label="戦績">
            <span>KILLS<b>{profile.kills}</b></span>
            <span>HS<b>{profile.headshots}</b></span>
            {profile.nukes > 0 && <span>NUKE<b>{profile.nukes}</b></span>}
          </div>
        </div>
      </div>

      <div className="title-cta">
        <button className="hud-btn hud-main hud-primary" onClick={onOnline} disabled={!ready}>
          <span className="hud-ico"><Wifi size={24} /></span>
          <span className="hud-txt"><b>ONLINE BATTLE</b><small>オンライン対戦{!ready ? '（デッキ未完成）' : ''}</small></span>
          <ChevronRight className="hud-go" size={24} />
        </button>
        <button className="hud-btn hud-main hud-secondary" onClick={onCpu} disabled={!ready}>
          <span className="hud-ico"><Bot size={18} /></span>
          <span className="hud-txt"><b>CPU BATTLE</b><small>CPU対戦{!ready ? '（デッキ未完成）' : ''}</small></span>
          <ChevronRight className="hud-go" size={18} />
        </button>
      </div>

      <div className="hud-grid title-tiles">
        <button className="hud-btn hud-tile tile-deck" onClick={onDeckEdit}>
          <LayoutGrid size={18} className="hud-tile-ico" />
          <b>DECK</b><small>デッキ編成</small>
        </button>
        <button className={`hud-btn hud-tile tile-gacha ${freeGacha ? 'is-live' : ''}`} onClick={onGacha}>
          <Dices size={18} className="hud-tile-ico" />
          <b>SUPPLY</b><small>ガチャ</small>
          <span className="tile-tickets" aria-label={`チケット ${profile.gachaTickets}枚`}>
            <Ticket size={12} />
            <b>×{profile.gachaTickets}</b>
          </span>
          {freeGacha && <span className="menu-badge">無料</span>}
        </button>
        <button className="hud-btn hud-tile tile-cards" onClick={onCards}>
          <Layers size={18} className="hud-tile-ico" />
          <b>ARSENAL</b><small>カード一覧</small>
        </button>
        <button className="hud-btn hud-tile tile-howto" onClick={onHowTo}>
          <BookOpen size={18} className="hud-tile-ico" />
          <b>BRIEFING</b><small>遊び方</small>
        </button>
      </div>
    </div>
  );
}
