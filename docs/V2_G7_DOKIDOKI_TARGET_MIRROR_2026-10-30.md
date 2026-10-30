# G7｜ドキドキ涙：相手への使用・スーパーミラー（2026-10-30）

## 発見と原作照合

前段階のG7実装はドキドキ涙を**自分専用**として扱い、50%の回復または自傷ダメージを即時確定していた。しかし原作攻略情報を再確認すると、この雑貨は相手への使用が可能で、スーパーミラーは**効果が決定する前**に反射を選ぶ。

- [ゴッドフィールド攻略（縛りプレイ中心）](https://ameblo.jp/shibransk/entry-12647363984.html)：対象の変更、自分への使用、ドキドキ涙を対戦相手に使って50%で撃破する例、スーパーミラーによる事前反射。
- [強い神器の使い方（2025）](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)：敵への雑貨使用（ドキドキ涙・夜空のホウキ等）はスーパーミラーの対象。ただし自分への雑貨使用には反射機会がない。
- [Piongその他神器](https://w.atwiki.jp/piong/pages/19.html)、[GFGA](https://w.atwiki.jp/gfplusa/pages/18.html)：HP+10または10ダメージ（各50%）、価格1円、確率0.4%を引き続き照合。

**原作忠実性を優先**し、自分向けの既存動作を残しながら相手指定／反射を追加した。通常のHP/MP回復雑貨については、他者使用の詳しい対象仕様を再検証するまで従来の自分限定を維持する。勝手な原作アレンジはしない。

## 変更範囲

- `v2/staging-room.mjs`：`useItem.targetId` は省略可能（既存送信互換）。ドキドキ涙のみ他者指定可。他者指定では `itemDefense` を開き、`respondItem` で許すか自分が所有するスーパーミラー1枚を指定する。対象変更を伴う同一commandId再送は拒否。
- `v2/room-transition.mjs`：`respondItem` の後で**権威ホストが一度だけ**seed付き乱数を引く。許す→選んだ相手、スーパーミラー→元の使用者にHP+10または10ダメージ。既存共通の `spend`、`hit`、`restoreResource`、`refill`、太陽のお守り、勝敗判定を再利用。途中で手札を補充したり、反射前に結果を抽選したりしない。
- `v2/staging-room.mjs` の席別ビュー：宣言された雑貨の**カード定義のみ公開**し、相手の非公開手札は引き続き見せない。
- `v2/demo/firebase-online-lab.html`：ドキドキ涙を選んだときに「対象：自分／相手」の切替を表示。相手は「許す／スーパーミラー」をタップで選択。研究用tearセットのゲストにスーパーミラーを配置。
- 研究カタログ、カードの個数・抽選率、Firebase Rules・認証、学校Google Sites版には変更なし。旧研究HTML・V2オフライン・V2オンラインの3つの単体HTMLは再生成して開発ブランチに保存済み。再生成workflowは手動起動に戻している。

## 検証

- `tests/g7-dokidoki-target-mirror-v2.test.mjs`：8件。自分/相手向け、効果選択より前の防御待ち、許す後の当たり／外れ、鏡の反射と消費、0HPでの勝敗と太陽のお守り、非公開手札とコマンドの冪等性、普通の回復アイテムを相手に使わない制約。
- `tests/v2-firebase-online-webkit.browser.mjs`：既存の模擬RTDB上の2画面WebKitタップ試験に、相手への使用→許す、相手への使用→スーパーミラーの2ケースを追加。固定seed=71で当たり側を確認。
- Node回帰 **945/945 PASS**（生成単体HTML復帰後 [Actions run 41054436648](https://github.com/8mahi8/party-card-replica/actions/runs/41054436648)）。Chromium **PASS**（[run 41054436614](https://github.com/8mahi8/party-card-replica/actions/runs/41054436614)）。WebKitオンライン **69/69 PASS**、既存画面 **339/339 PASS**（[run 41054436880](https://github.com/8mahi8/party-card-replica/actions/runs/41054436880)）。WebKit初回の失敗はUIが`respondItem`へ不要な`orderedInstanceIds`を送った実不具合で修正・追加回帰テスト済み。
- **本物のFirebaseでも成功**：[run 41054723700](https://github.com/8mahi8/party-card-replica/actions/runs/41054723700) で `G6_LIVE_TWO_BROWSER_SUCCESS`（基本対戦）、`G7_LIVE_RECOVERY_SUCCESS`（通常回復）、`G7_LIVE_TARGET_MIRROR_SUCCESS`（相手に使いスーパーミラーで反射、両席revision3/秘密手札非公開）を確認。3ルームの `G6_LIVE_CLEANUP_SUCCESS` もログ確認。1回限りのPRトリガーを使用後に元の手動`workflow_dispatch`へ復帰。
- **学校iPad Safari＋Google Sites実機は引き続き未検証**。CIのWebKitはデスクトップ上のiPadサイズ・タッチ模擬であり実機とは区別する。

## 次の作業

WebKitの結果を確定して必要なら修正。学校実機での操作性を確認しつつ、まだ未登録の神器について原作資料と共通エンジンを照合する。353種/500枠完全抽選は依然として研究未完のため無効。
