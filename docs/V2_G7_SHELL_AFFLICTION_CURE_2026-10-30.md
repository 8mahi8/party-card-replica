# G7｜スマイルの貝がら・ハートの貝がら（2026-10-30）

## 原作確認

- [Piong 神器一覧（2026-10-24更新）](https://w.atwiki.jp/piong/pages/19.html)、[まかろん神器一覧（2026）](https://macarongamemo.com/entry/godfield-artifact)、[Piong 災い一覧](https://w.atwiki.jp/piong/pages/23.html)
- **スマイルの貝がら**：¥5、出現率2.4%=12/500、風邪・熱病・霧・閃光だけを治療。地獄病・天国病・夢・暗雲は治療できない。
- **ハートの貝がら**：¥15、出現率1.2%=6/500、すべての災いを治療。病4段階に加え、霧・閃光・夢・暗雲も対象となる。
- 2026年の原作遊戯を直接画面観察したわけではない。相手を対象とした雑貨に対するスーパーミラーの応答にはG7で既存の`useItem/itemDefense/respondItem`経路を使用するが、2種類の貝がらそれぞれの反射演出は未実測。

## 実装範囲（原作にない機能を作らない）

- `src/verified-basic-cards.mjs`：`i017`（Smile）、`i018`（Heart）を参考重み12+6で追加。研究台帳は**168種類・429/500参考枠**、`complete:false`、本家353種類500枠の完全抽選は引き続き無効。
- `v2/legacy-adapter.mjs`、`v2/foundation.mjs`：カードの価格・重みを厳密照合した`cleanseAfflictions({scope:'minor'|'all'})`型効果。
- `v2/disease-rules.mjs`：`planDiseaseCure`は現時点で存在する**4段階の病だけ**を対象にする。minorは`cold/fever`のみ、allは`cold/fever/hell/heaven`。未感染者への使用も可能。
- `v2/staging-room.mjs`、`v2/room-transition.mjs`、`v2/effect-runner.mjs`：既存の所有カード・対象選択・Mirrror応答を流用。対象が「許す」かMirrorを使った**後**に、受け手（反射時は元の使用者）の病を解除する。再送コマンドは重複解決しない。使用した貝がらと鏡だけが通常補充され、元の攻撃手番が残る。不要な乱数は消費しない。
- **限界**：霧・閃光・夢・暗雲は、現行V2対戦モデルに正式な状態異常としては未導入。貝がらの本来の対象には含まれるが、存在しない状態を「治した」と偽らないため、現実装で解除できるのは病のみ。`dreamDisguises`はデバッグ用の見た目台帳であり、正式な「夢」状態そのものではないので今回変更しない。後で各災いの本体を実装する時に、型付き`cleanseAfflictions`に接続する。
- `v2/demo/firebase-online-lab.html`：10番目の固定手札セット`shells`。AはSmile/Heartと天国病、BはSuper Mirrorと熱病で開始。軽い病と重い病の違い・相手への使用・鏡を同じ画面で比較できる。研究画面の効果表示は実装済み範囲に合わせて「病系」に限定。

## 検証

- `tests/g7-shell-cleansing-v2.test.mjs`：10テストで価格・重み・scope、病4段階、自己使用、相手使用、事前鏡、ターン終了後に再度病ダメージが発生しないこと、回復補充と再送、偽装カードの拒否を確認。
- `tests/v2-firebase-online-webkit.browser.mjs`：狭いSafari相当の2席におけるSmile/Heart × 許す/Mirrorの4試験ルーム。各画面の公開病表示、手札数、攻撃手番復帰と横はみ出しを確認。
- `tests/v2-g6-live-firebase.browser.mjs`：同じ4シナリオを実Firebase RTDBで再実行する。既存の試験用ルーム以外は書き換えず、作成したルームのhostIdを照合して安全に削除。テスト結果は最新`HANDOFF_LATEST.md`参照。
- 学校Google Sitesに直接埋め込まれたHTML・Firebase Rules/認証・GitHub mainは変更しない。学校の実iPad Safariでのテストは未実施。

## 次工程

病状態を治す機能が完成したら、原作資料で確認済みの風邪・熱病・地獄病を発症させる神器/奇跡を既存エンジンの効果に接続する候補を評価する。その前に既存の命中判定・防御・反射と病付与の順序を調べ、既存攻撃コードを無条件に作り直さない。夢・霧・閃光・暗雲は固有仕様が違うので独立して検討する。


## 実測済み（2026-10-30後続追記）

- Node **994/994 PASS**：[run 41066264525](https://github.com/8mahi8/party-card-replica/actions/runs/41066264525)。Chromium **PASS**：[run 41066264540](https://github.com/8mahi8/party-card-replica/actions/runs/41066264540)。WebKitオンライン2ページ **156/156 PASS**、従来のWebKit固定画面 **339/339 PASS**：[run 41066264527](https://github.com/8mahi8/party-card-replica/actions/runs/41066264527)。ソース＋再生成されたスタンドアロンHTMLで確認。
- **実Firebase 14試験全成功**：[run 41067115608](https://github.com/8mahi8/party-card-replica/actions/runs/41067115608)。以前の通常対戦・回復・夜空のホウキ・女神の石けん・天国草を含む10シナリオに加え、`G7_LIVE_SHELL_SMILE_PASS_SUCCESS`、`G7_LIVE_SHELL_SMILE_MIRROR_SUCCESS`、`G7_LIVE_SHELL_HEART_PASS_SUCCESS`、`G7_LIVE_SHELL_HEART_MIRROR_SUCCESS` を確認。各試験部屋のhost IDを照合した安全な**14回の削除成功**もログで確認。
- ライブ試験の初回は、スマイルの反射先がすでに天国病で「病が治らない」ため画面表示が変わらず、ホストだけが更新済みでゲスト側の反映・Firebase書込が完了していない段階でRESTを読んで誤って不合格扱いした。原因は**テストの同期待機不足**。ゲスト側の実受信と手番移行を待ってから読むよう変更し、再実行で4ケースすべて成功。ゲームの計算処理のバグではない。
- 配布HTML生成とライブFirebaseワークフローは、利用終了後に**双方とも従来の手動専用設定**に復帰した。学校Google Sites直接埋め込み版の変更はしていない。
