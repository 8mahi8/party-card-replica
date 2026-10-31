# G7｜夜空のホウキ：無作為3枚掃き飛ばし（2026-10-30）

## 原作資料

- [Piong その他神器一覧（2026-10-24更新）](https://w.atwiki.jp/piong/pages/19.html)：夜空のホウキ、取得率0.2%、売値¥10、無作為に神器を3枚掃き飛ばす。昔の1枚から3枚へ増えた経緯がある。
- [GFGA その他神器一覧](https://w.atwiki.jp/gfplusa/pages/18.html)、[まかろん2026 神器一覧](https://macarongamemo.com/entry/godfield-artifact)：同じ参考値。
- [ゴッドフィールドを1000試合やった](https://note.com/md_stardustman/n/nfc5dfb559f95)：ホウキを受けた側は手札が3枚減る。補充が発生しない。
- [初心者向け神器の使い方](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)および[2023年God Field論評](https://idea427.hatenablog.com/entry/2023/07/31/192159)：対象を自分にすることもでき、習得済みの奇跡は対象外。未使用の物理カードから3枚が選ばれる。
- 以前の攻略資料には「1枚掃き飛ばす」と記載の旧版がある。2026年に近い3枚の記述を採用。

**未直接測定**：現行原作サーバーでのスーパーミラーとの逐次演出と、対象の手札が3枚未満の場合の画面文言。研究版はこれまで実証済みの雑貨用`itemDefense`（許す/スーパーミラー）を利用。3枚未満なら残っている物理カードだけを掃き飛ばす。

## 実装

- `src/verified-basic-cards.mjs` の`i014`：¥10、重み1/500、`sweep_hand`。カード用データ以外の原作抽選は変更せず、部分研究台帳は**164種類/409枠**、`complete:false`。
- `v2/legacy-adapter.mjs` と`v2/foundation.mjs`：専用の厳密型`onDeclare:sweepHand({count:3})`。
- `v2/staging-room.mjs`：既存の`useItem`と`respondItem`（自分/相手、鏡/許す）へ適用。宣言時は手札を消さず、相手の物理手札は非公開のまま。
- `v2/room-transition.mjs`：鏡の選択後、権威ホストだけがシリアライズ可能なRNGを使用し、物理手札から最大3枚を**非復元抽選**。使用されたホウキ・スーパーミラーは抽選から先に除外。習得済み奇跡は`hand[]`と別管理のため抽選に含まない。
- `v2/effect-runner.mjs`：通常の「捨てる」は自発的で捨てられないカードがあるので、`sweep`を別アクションにした。受け側の物理カードは強制除去され、どのカードも**補充なし**。使用したホウキ・鏡は各1枚補充し、従来の手番再開処理で攻撃へ戻る。Dreamの物理カードに紐づく見た目情報も削除する。
- `v2/demo/firebase-online-lab.html`：開発研究用の「夜空のホウキ・手札除去」固定4枚セットを追加（7セット目）。デフォルト対象は相手、切替で自分にも使える。スーパーミラーも研究できる。これは学校Google Sites版の仕様更新ではない。

## テストと限界

- `tests/g7-night-sky-broom-v2.test.mjs` はカード値、先に相手の防御選択、3枚除去、補充なし、非復元抽選、スーパーミラー、自己使用、太陽のお守り等の任意物理カード、習得奇跡の除外、空の手札、再送不変性、手番継続を検証。
- `tests/v2-firebase-online-webkit.browser.mjs` に固定4枚研究セットからの2ブラウザタッチ操作（許すと鏡）を追加。既存の G6/G7 通常対戦・回復・ドキドキ涙のテストを保持。
- `tests/v2-g6-live-firebase.browser.mjs` に新しい独立2試験ルームによる、本物のRTDBでの許すと鏡の実試験を追加。いずれも所有者ID確認後だけ削除する。
- **学校の本物のiPad Safari＋Google Sites貼付HTMLは未検証**。WebKit CIはiPadサイズのタッチ操作を使う別環境。
- 画面は原作完全版ではなく原作の一部を検証する固定手札研究版。完整の353種類・500枠正規ランダム抽選は未実装。Firebase Rules・認証には変更なし。

実装・試験の最終結果とGitHubコミットは、`HANDOFF_LATEST.md` の先頭の当該節を確認すること。
