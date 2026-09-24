# DECKSHOT（デックショット）

**3分で決着する、読み合いFPSカードバトル。**
両者が同時に作戦を立て、一斉に公開。AIMの速いほうが先に撃つ。スモーク・フラッシュ・裏取り・C4・キルストリーク、最後は戦術核。

- 調査レポート: [docs/research.md](docs/research.md)
- ゲーム骨子（ルール・カード・収益化・ロードマップ）: [docs/game-design.md](docs/game-design.md)

## 遊び方（開発環境）

```bash
npm install
npm run dev
```

- Web: http://localhost:5173 （ポートが埋まっていれば 5174 など）
- ゲームサーバー: ws://localhost:8787 （オンライン対戦用。`npm run dev` で同時に起動）
- **スマホで試す**: PCと同じWi-Fiにつないだスマホで、ターミナルに表示される `Network: http://192.168.x.x:5173` を開く。オンライン対戦も同じLAN内ならそのまま動く。

| モード | 内容 |
| --- | --- |
| CPU対戦 | 新兵／隊長／エースの3段階。勝つとRPが増えてランクが上がる（端末内に保存） |
| オンライン対戦 | ランダムマッチ、または4桁のルームコードで友だちと対戦 |

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Web と ゲームサーバーを同時に起動 |
| `npm test` | エンジンのユニットテスト（Vitest） |
| `npm run typecheck` | 型チェック |
| `npm run sim -- 60 normal` | AI同士の自動対戦によるバランス検証（各デッキの組み合わせで60試合ずつ） |
| `npm run sim -- 12 hard easy` | 難易度の差を検証（A=hard、B=easy） |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run server` | ゲームサーバーを起動。`dist/` があれば静的配信もする（1プロセスで本番運用できる） |

## スマホアプリ化（Capacitor）

Web版がそのままネイティブアプリになる構成にしてあります（設定は `capacitor.config.ts`）。

```bash
# 本番サーバーのURLを埋め込んでビルド
VITE_SERVER_URL=wss://your-server.example.com npm run build

npm install @capacitor/android @capacitor/ios
npx cap add android      # Android Studio が必要
npx cap add ios          # macOS + Xcode が必要
npx cap sync
npx cap open android     # あとはIDEからビルド・実機実行・ストア提出
```

- 画面は縦固定・フルスクリーン前提で作っています（`public/manifest.webmanifest` もあるので、PWAとしてホーム画面に追加することもできます）。
- 振動は `navigator.vibrate` を使っています。ネイティブ化するときは `@capacitor/haptics` に差し替えると、iOSでも振動するようになります。
- サーバーは `npm run server` をそのまま Fly.io や Render などのNodeホスティングに置けば動きます（`PORT` 環境変数に対応）。

## 構成

```
src/engine/   ゲームロジック（純TypeScript。DOMに依存しない。乱数はシード付きで決定的）
  cards.ts      カード・ストリーク・ゾーン効果・デッキの定義（バランス調整はここ）
  plan.ts       作戦の検証（UI／サーバー／AIで共通）
  resolve.ts    ターン解決。演出用に、スナップショット付きのイベント列を返す
  ai.ts         CPU（候補手をサンプリングして盤面評価。hardは相手の手札を推測して応手まで読む）
  state.ts      状態の生成、実効ステータス、プレイヤーごとのビュー（相手の手札を隠す）
src/app/      React UI（画面、演出、効果音。効果音はWeb Audioで合成）
src/net/      通信プロトコルの型定義
server/       WebSocketの対戦サーバー（サーバーが正。クライアントの作戦はサーバーで検証する）
scripts/      バランス検証用のシミュレーター
```
