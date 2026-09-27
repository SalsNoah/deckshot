import { useCallback, useEffect, useRef, useState } from 'react';
import { DECKS } from '../engine';
import { LocalCpuMatch, type MatchConnection } from './match';
import type { OnlineMatch } from './online';
import { isDeckReady, loadProfile, matchRpDelta, saveProfile, starterGrant, applyOperatorMatchUses, type Profile } from './profile';
import { bindAudioUnlock, setBgm, setBgmVolume, setSeVolume, unlockAudio } from './sfx';
import { TutorialMatch } from './tutorial';
import { Battle, type MatchResult } from './screens/Battle';
import { Cards } from './screens/Cards';
import { DeckEdit } from './screens/DeckEdit';
import { DeckSelect } from './screens/DeckSelect';
import { Gacha } from './screens/Gacha';
import { HowTo } from './screens/HowTo';
import { Lobby } from './screens/Lobby';
import { AnimPreview } from './screens/AnimPreview';
import { Splash } from './screens/Splash';
import { StarterDeck } from './screens/StarterDeck';
import { Title } from './screens/Title';

type Screen =
  | { name: 'splash' }
  | { name: 'title' }
  | { name: 'deck'; mode: 'cpu' | 'online' }
  | { name: 'deckEdit'; back: Screen }
  | { name: 'gacha' }
  | { name: 'lobby' }
  /** `tutorial`: the coached training match; 'first' continues to the starter deck pick. */
  | { name: 'battle'; conn: MatchConnection; key: number; tutorial?: 'first' | 'replay' }
  | { name: 'starter' }
  | { name: 'howto'; next?: Screen }
  | { name: 'cards' }
  | { name: 'animPreview' };

export function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [screen, setScreen] = useState<Screen>({ name: 'splash' });
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    saveProfile(profile);
    setBgmVolume(profile.bgmVol);
    setSeVolume(profile.seVol);
  }, [profile]);

  useEffect(() => {
    bindAudioUnlock();
  }, []);

  useEffect(() => {
    if (profile.bgmVol === 0) {
      setBgm('off');
      return;
    }
    if (screen.name === 'battle') setBgm('battle');
    else if (screen.name === 'gacha') setBgm('gacha');
    else setBgm('menu');
  }, [screen.name, profile.bgmVol]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLButtonElement>('.btn, .hud-btn');
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'press-ripple';
      dot.style.setProperty('--x', `${e.clientX - r.left}px`);
      dot.style.setProperty('--y', `${e.clientY - r.top}px`);
      el.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const update = useCallback((p: Partial<Profile>) => setProfile((cur) => ({ ...cur, ...p })), []);

  const exitBattle = useCallback(() => {
    setScreen((s) => {
      if (s.name === 'battle') s.conn.close();
      return { name: 'title' };
    });
  }, []);

  const startCpu = () => {
    const p = profileRef.current;
    if (!isDeckReady(p)) {
      setScreen({ name: 'deckEdit', back: { name: 'deck', mode: 'cpu' } });
      return;
    }
    const others = DECKS.map((d) => d.id);
    const cpuDeck = others[Math.floor(Math.random() * others.length)];
    const conn = new LocalCpuMatch(p.name, p.deck, p.difficulty, cpuDeck);
    setScreen({ name: 'battle', conn, key: Date.now() });
  };

  const startOnline = useCallback((m: OnlineMatch) => {
    setScreen({ name: 'battle', conn: m, key: Date.now() });
  }, []);

  const onFinish = useCallback((r: MatchResult): number | null => {
    const cur = profileRef.current;
    const won = r.winner === r.me;
    const draw = r.winner === 'draw';
    const rp = matchRpDelta(cur.rp, draw ? 'draw' : won ? 'win' : 'loss');
    const ticketBonus = won && Math.random() < 0.15 ? 1 : 0;
    const progress = applyOperatorMatchUses(cur, cur.deck);
    const next: Profile = {
      ...cur,
      ...progress,
      rp: Math.max(0, cur.rp + rp),
      wins: cur.wins + (won ? 1 : 0),
      losses: cur.losses + (!won && !draw ? 1 : 0),
      draws: cur.draws + (draw ? 1 : 0),
      kills: cur.kills + r.kills,
      headshots: cur.headshots + r.headshots,
      nukes: cur.nukes + (r.nuked ? 1 : 0),
      gachaTickets: cur.gachaTickets + ticketBonus,
    };
    setProfile(next);
    return next.rp - cur.rp;
  }, []);

  const goCpu = () => {
    unlockAudio();
    if (!profile.seenHowTo) {
      update({ seenHowTo: true });
      setScreen({ name: 'howto', next: { name: 'deck', mode: 'cpu' } });
    } else setScreen({ name: 'deck', mode: 'cpu' });
  };

  const startTutorial = (mode: 'first' | 'replay') => {
    unlockAudio();
    setScreen({ name: 'battle', conn: new TutorialMatch(profileRef.current.name), key: Date.now(), tutorial: mode });
  };

  /** Finishing or skipping the first-run tutorial moves on to the deck pick; a replay goes home. */
  const leaveTutorial = (conn: MatchConnection, mode: 'first' | 'replay') => {
    conn.close();
    if (mode === 'first') {
      update({ onboarding: 'deck' });
      setScreen({ name: 'starter' });
    } else {
      setScreen({ name: 'title' });
    }
  };

  const onSplashStart = () => {
    const step = profileRef.current.onboarding;
    if (step === 'tutorial') startTutorial('first');
    else if (step === 'deck') setScreen({ name: 'starter' });
    else setScreen({ name: 'title' });
  };

  return (
    <div className="app">
      <div key={screen.name} className="shutter" aria-hidden />
      {screen.name === 'splash' && <Splash onStart={onSplashStart} />}
      {screen.name === 'starter' && (
        <StarterDeck
          profile={profile}
          onPick={(deckId) => {
            update(starterGrant(deckId));
            setScreen({ name: 'title' });
          }}
        />
      )}
      {screen.name === 'title' && (
        <Title
          profile={profile}
          onChange={update}
          onCpu={goCpu}
          onOnline={() => { unlockAudio(); setScreen({ name: 'deck', mode: 'online' }); }}
          onHowTo={() => setScreen({ name: 'howto' })}
          onCards={() => setScreen({ name: 'cards' })}
          onDeckEdit={() => setScreen({ name: 'deckEdit', back: { name: 'title' } })}
          onGacha={() => setScreen({ name: 'gacha' })}
        />
      )}
      {screen.name === 'deck' && (
        <DeckSelect
          mode={screen.mode}
          profile={profile}
          difficulty={profile.difficulty}
          onChange={update}
          onBack={() => setScreen({ name: 'title' })}
          onEdit={() => setScreen({ name: 'deckEdit', back: screen })}
          onStart={() => {
            unlockAudio();
            if (screen.mode === 'cpu') startCpu();
            else setScreen({ name: 'lobby' });
          }}
        />
      )}
      {screen.name === 'deckEdit' && (
        <DeckEdit
          profile={profile}
          onChange={update}
          onBack={() => setScreen(screen.back)}
        />
      )}
      {screen.name === 'gacha' && (
        <Gacha profile={profile} onChange={update} onBack={() => setScreen({ name: 'title' })} />
      )}
      {screen.name === 'lobby' && (
        <Lobby
          name={profile.name}
          deck={profile.deck}
          onStart={startOnline}
          onBack={() => setScreen({ name: 'deck', mode: 'online' })}
        />
      )}
      {screen.name === 'battle' && (
        <Battle
          key={screen.key}
          conn={screen.conn}
          onExit={exitBattle}
          onFinish={screen.tutorial ? () => null : onFinish}
          kiraOwned={profile.kiraOwned}
          signOwned={profile.signOwned}
          flowOwned={profile.flowOwned}
          tutorial={screen.tutorial ? {
            first: screen.tutorial === 'first',
            onLeave: () => leaveTutorial(screen.conn, screen.tutorial!),
          } : undefined}
        />
      )}
      {screen.name === 'howto' && (
        <HowTo onBack={() => setScreen(screen.next ?? { name: 'title' })} onTutorial={() => startTutorial('replay')} />
      )}
      {screen.name === 'cards' && (
        <Cards profile={profile} onBack={() => setScreen({ name: 'title' })} onPreview={() => setScreen({ name: 'animPreview' })} />
      )}
      {screen.name === 'animPreview' && <AnimPreview onBack={() => setScreen({ name: 'cards' })} />}
    </div>
  );
}
