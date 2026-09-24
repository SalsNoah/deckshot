# 調査レポート：FPSテーマ対人カードゲーム

調査日: 2026-09-24

## 1. ターゲット（10〜20代男性）が遊んでいるもの

| 観点 | 事実 | 出典 |
| --- | --- | --- |
| PCのFPS | VALORANT（28.5%）と Apex Legends（約25.5%）がほぼ互角でトップ。人気ジャンルは FPS/TPS が突出 | [ゲーマー国勢調査2024-2025（EAA FPS News）](https://fpsjp.net/archives/517951) |
| ファンの年齢層 | Apex・VALORANT・オーバーウォッチはファンの80%以上が15〜29歳。CoD・フォートナイトも若年層が半数以上 | [GEM Standard](https://www.gem-standard.com/columns/1004) |
| スマホ | 男性15〜19歳・20〜30代で「ポケポケ（Pokémon TCG Pocket）」がTOP5。ゲーマー国勢調査では全体の約3割がプレイ | [クロス・マーケティング 2025](https://www.cross-m.co.jp/report/20250729game) / [EAA](https://fpsjp.net/archives/517951) |
| ジャンル嗜好 | スマホでは男性10代は「バトルロイヤル」「スポーツ」など対戦要素が上位 | [SKYFLAGリサーチ](https://research-skyflag.info/lab/report061/) |

**わかったこと**
- ターゲットは **FPSの用語や文化にどっぷり浸かっている**。例えば「エコラウンド」「ロスボーナス」「裏取り」「ローテ」「スモーク」「フラッシュ」「キルストリーク」「エース」「クラッチ」は説明しなくても通じる。
- **スマホでもカードゲームは遊ばれている**（ポケポケ）。ただし1試合5分程度で終わる軽さが前提。

## 2. モバイル対戦カードゲームの成功要因

### Marvel Snap
- 1試合は **6ターン・3〜6分**。**両者が同時にターンを進める**ので待ち時間がない。
- 3つのロケーションで「**どこに何を出すか**」を読み合う。同時に出すから、読みやブラフが成立する。
- ロケーション効果はランダム。Ben Brodeは「プレイヤーが対応できるランダム性（input randomness）」が面白さを生むと語っている。
- 出典: [Game Developer](https://www.gamedeveloper.com/game-platforms/designers-don-t-sleep-on-marvel-snap-s-simultaneous-turns), [The Verge](https://www.theverge.com/23437497/marvel-snap-developer-design-interview-mobile-steam), [mobilegamer.biz](https://mobilegamer.biz/second-dinners-ben-brode-reveals-marvel-snaps-recipe-for-success-literally/)

### ポケポケ
- デッキは **20枚**、**3ポイント先取**、エネルギーは自動で供給。本家を大幅に簡略化して **1試合5分前後**にした。
- 毎日無料でパックを開けられる。レアカードの演出も凝っている。
- 出典: [ポケカードラボ](https://pokecardlab.com/2024/11/28/pokepokle4/), [@DIME](https://dime.jp/genre/1920022/)

### クラッシュ・ロワイヤル
- 操作はすぐ理解できるのに、戦略は深い。1試合は数分。
- **トロフィーのランク階段**がわかりやすい目標になる。**エモート**は表現力がありつつ、荒れにくいコミュニケーション手段。
- TikTokなどの**切り抜き動画**で広まった。
- 出典: [Game Developer](https://www.gamedeveloper.com/design/clash-royale---deconstructing-supercell-s-next-billion-dollar-game), [Game Developer 2](https://www.gamedeveloper.com/design/breaking-down-supercell-s-next-hit-clash-royale)

## 3. 競合：FPSテーマのカード／ボードゲーム

| タイトル | 形態 | 特徴 | 本企画との差 |
| --- | --- | --- | --- |
| Card-Strike: Grandma Offensive | 紙 | CSの経済システム（稼ぐ→買う）が中心 | 同人規模。対戦としての読み合いは薄い |
| Falcon Tactics | 紙＋ダイス | CSのマップと爆弾設置 | ダイス依存。デジタル版なし |
| Rival Aim | 紙（パーティー向け） | 近接武器・狙撃・NUKE・ルートボックス | パーティーゲームで競技性は低い |
| FragPunk | PCのFPS | ラウンドごとにルールを変えるカードを使う | カードはあくまで補助。カードゲームではない |

出典: [itch.io](https://reeceljones.itch.io/card-strike-grandma-offensive), [Falcon](https://dungeonsofkards.itch.io/falcon-tactics), [Rival Aim](https://www.thegamecrafter.com/games/rival-aim), [VGC](https://www.videogameschronicle.com/news/fragpunk-reveal/)

**わかったこと**: **タクティカルFPSの気持ちよさ（先に撃った方が勝つ撃ち合い・経済・スパイク設置・キルストリーク）をデジタルの同時ターン制カードゲームに落とし込んだ作品**は見当たらない。ここは空いている。

## 4. 技術選定（最終的にスマホアプリにする前提）

- **Capacitor**: Webのゲームをそのまま iOS/Android のネイティブアプリに包める。ハプティクス・課金・プッシュ通知はプラグインで追加できる。 [Capacitor Docs](https://capacitorjs.com/docs/guides/games), [abratabia](https://www.abratabia.com/native-wrappers/capacitor-games.php)
- 注意点: 低価格帯のAndroid端末ではWebViewが重くなりやすい。
  - 対策1: 3D/WebGLは使わず、DOMとCSSアニメーション中心の軽い描画にする。
  - 対策2: ゲームロジックはUIから切り離した純TypeScriptにしておく。将来React NativeやUnityに移ることになっても、ロジックとサーバーはそのまま再利用できる。
- **結論**: 「React + TypeScript + Vite」でWebとして作り、PWAとして配布しつつ、後で **Capacitor** でストアに出す。対人戦は **サーバーが正（server-authoritative）** の WebSocket 方式にする。

## 5. 設計に落とし込む要件

1. **1試合5分前後**。同時ターン制で待ち時間をなくす（Snap式）。
2. **ルールは30秒で説明できる**こと。「3つのエリアに兵士を出して撃ち合い、エリアを取ってポイントを稼ぐ」。
3. **FPSの"あるある"を仕組みで再現する**。先に撃った方が勝つAIM、エコとロスボーナス、スモーク、フラッシュ、裏取り、C4の設置と解除、キルストリーク、そして戦術核。
4. **気持ちいい瞬間を派手に見せる**。HEADSHOT、DOUBLE/TRIPLE KILL、ACE、NUKE。クリップにして共有したくなる演出にする。
5. **ランダム性は「対応できるもの」に限る**。毎試合変わるゾーン効果（マップ）は入れるが、ダメージのダイスロールは入れない。撃ち合いの結果は決定的にする。
6. **目標と自己表現**。ランク階段と、エモート（煽りすぎない定型文）を用意する。
