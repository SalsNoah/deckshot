import { Copy, Users, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { defaultServerUrl, OnlineClient, type LobbyStatus, type OnlineMatch } from '../online';
import { cssUrl } from '../ui/assets';

export function Lobby({ name, deck, onStart, onBack }: {
  name: string;
  deck: string[];
  onStart: (m: OnlineMatch) => void;
  onBack: () => void;
}) {
  const [url, setUrl] = useState(() => localStorage.getItem('deckshot.server') || defaultServerUrl());
  const [draftUrl, setDraftUrl] = useState(url);
  const [status, setStatus] = useState<LobbyStatus>({ s: 'connecting' });
  const [code, setCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const clientRef = useRef<OnlineClient | null>(null);
  const startedRef = useRef(false);
  const deckKey = deck.join(',');

  useEffect(() => {
    const client = new OnlineClient(url, name, deck, setStatus, (m) => {
      startedRef.current = true;
      onStart(m);
    });
    clientRef.current = client;
    return () => {
      if (!startedRef.current) client.close();
    };
  }, [url, name, deckKey, attempt, onStart]);

  const connected = status.s !== 'connecting' && status.s !== 'error' && status.s !== 'closed';

  return (
    <div className="screen screen-scroll lobby has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>オンライン対戦</h2>
      </div>

      <div className={`net-status net-${status.s}`}>
        {status.s === 'connecting' && 'サーバーに接続中…'}
        {status.s === 'idle' && 'オンライン'}
        {status.s === 'queued' && '対戦相手を探しています…'}
        {status.s === 'room' && 'ルームで相手を待っています'}
        {status.s === 'error' && status.message}
        {status.s === 'closed' && '接続が切れました'}
      </div>

      {status.s === 'room' && (
        <div className="room-code">
          <span>ルームコード</span>
          <b>{status.code}</b>
          <button className="btn small" onClick={() => navigator.clipboard?.writeText(status.code)}><Copy size={14} /> コピー</button>
          <p>友だちにこのコードを伝えよう</p>
        </div>
      )}

      {status.s === 'queued' && <div className="searching"><div className="radar-sweep" /></div>}

      {(status.s === 'queued' || status.s === 'room') ? (
        <button className="btn ghost" onClick={() => clientRef.current?.cancel()}>キャンセル</button>
      ) : (
        <div className="menu">
          <button className="btn primary big" disabled={!connected} onClick={() => clientRef.current?.quick()}>
            <Zap size={18} /> ランダムマッチ
          </button>
          <button className="btn big" disabled={!connected} onClick={() => clientRef.current?.create()}>
            <Users size={18} /> ルームを作る
          </button>
          <div className="join-row">
            <input
              placeholder="ルームコード"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn" disabled={!connected || code.length !== 4} onClick={() => clientRef.current?.join(code)}>参加</button>
          </div>
        </div>
      )}

      <details className="server-setting">
        <summary>サーバー設定</summary>
        <input value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} />
        <button
          className="btn small"
          onClick={() => {
            localStorage.setItem('deckshot.server', draftUrl);
            setUrl(draftUrl);
            setAttempt((a) => a + 1);
          }}
        >
          再接続
        </button>
        <p>開発時は <code>npm run dev</code> でゲームサーバー（ポート8787）も起動します。</p>
      </details>
    </div>
  );
}
