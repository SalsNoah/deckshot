import { Bomb, Check, ChevronRight, Coins, Crosshair, Flag, Hand, Radiation, Target } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cssUrl } from '../ui/assets';
import { KEYWORD_TEXT } from '../ui/text';

export function HowToContent({ compact }: { compact?: boolean }) {
  return (
    <div className={`howto ${compact ? 'compact' : ''}`}>
      <section>
        <h3><Flag size={16} /> 勝利条件</h3>
        <p>
          盤面は <b>A / MID / B</b> の3ゾーン。ターン終了時、<b>自分のユニットだけがいるゾーン</b>を確保して <b>+1pt</b>（高台は+2）。
          <b>7ターン目以降は得点が倍</b>になる。先に <b className="hl">10pt</b> 取ったら勝ち（10ターンで終了）。
        </p>
        <p className="tip"><b>マッチポイント</b>：相手が8pt以上のとき、負けている側は確保したゾーン1つにつき<b>+1pt</b>。最後まで逆転できる。</p>
      </section>
      <section>
        <h3><Hand size={16} /> デッキ</h3>
        <p>
          デッキは <b>30枚固定</b>。同じカードは最大 <b>2枚</b>まで。
          ガチャや初期配布で得た<b>所持カードだけ</b>で自由に編成できる。初期手札は <b>6枚</b>。
        </p>
      </section>
      <section>
        <h3><Hand size={16} /> ターンの流れ</h3>
        <ol>
          <li><b>作戦</b>：両者が<b>同時に</b>、相手に見えないまま行動を決める。</li>
          <li><b>公開</b>：READYを押すと両者の行動が一斉に明かされる。</li>
          <li><b>交戦</b>：全ゾーンで撃ち合い → 得点 → 次のターンへ。</li>
        </ol>
        <p className="tip">操作：手札をタップ → 光った場所をタップで予約。予約はタップで取り消し。自分のユニットをタップすると隣のゾーンへ<b>ローテ（1¢）</b>できる。</p>
      </section>
      <section>
        <h3><Crosshair size={16} /> 撃ち合い</h3>
        <p>
          <b>AIMが高い順</b>に1回ずつ撃つ。先に倒されたユニットは撃ち返せない。<b>AIMが同じなら相打ち</b>。
          狙うのは<b>HPが一番低い敵</b>（【ガード】がいればそちら）。HP満タンの敵を一撃で倒すと <b className="hs">HEADSHOT</b>！
        </p>
        <p className="tip">フラッシュで敵のAIMを0に、スモークで交戦そのものを止められる。</p>
      </section>
      <section>
        <h3><Coins size={16} /> 経済</h3>
        <p>
          毎ターン収入（3¢から毎ターン+2、最大11¢）。余ったクレジットは持ち越せる（最大14¢）。
          キル <b>+1¢</b>、HEADSHOT <b>さらに+1¢</b>、1つも確保できなかったターンは<b>ロスボーナス+2¢</b>。
        </p>
        <p className="tip"><b>補給（4¢）</b>：カードを1枚引く（1ターン1回。使えるのは次のターンから）。手札が尽きる前にクレジットをカードに変えよう。</p>
      </section>
      <section>
        <h3><Radiation size={16} /> キルストリーク</h3>
        <p>
          キルで <b>SP+1</b>。味方がやられたターンも <b>SP+1</b>（1ターン1回まで）。SPを使って
          <b>UAV（2）</b>：作戦中に即発動、このターン相手の手札が見える／
          <b>空爆（4）</b>：ゾーンの敵全員に3ダメージ／
          <b className="hl">戦術核（12）</b>：次のターン終了時に着弾して勝利。ただし相手が<b>2ゾーン以上確保</b>していれば阻止される。
        </p>
      </section>
      <section>
        <h3><Bomb size={16} /> C4爆弾</h3>
        <p>味方がいるゾーンに設置。<b>次のターン終了時</b>、相手がそのゾーンを奪い返していなければ爆発して敵全員に6ダメージ＋2pt。守る側はゾーンを取り返して解除しよう。</p>
      </section>
      {!compact && (
        <section>
          <h3><Target size={16} /> キーワード</h3>
          <div className="kw-list">
            {Object.values(KEYWORD_TEXT).map((k) => (
              <div key={k.name}><b>【{k.name}】</b>{k.text}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen screen-scroll has-art-bg" style={{ '--screen-bg': cssUrl('bgs/bg-menu.webp') } as CSSProperties}>
      <div className="screen-head">
        <button className="btn ghost small" onClick={onBack}>← 戻る</button>
        <h2>遊び方</h2>
      </div>
      <HowToContent />
      <button className="hud-btn hud-main hud-primary" onClick={onBack}>
        <span className="hud-ico"><Check size={22} /></span>
        <span className="hud-txt"><b>GOT IT</b><small>わかった！</small></span>
        <ChevronRight className="hud-go" size={22} />
      </button>
    </div>
  );
}
