# G7｜実Firebase回復セット検証を追加（2026-10-30）

## 目的

G6の最新版HTMLでの実Firebase 2席試験（Actions run 40973710968）は基本4枚セットで成功した。しかしG7のHP/MP回復アイテムと同手番での攻撃は、模擬RTDB＋WebKitまでの成功記録しかなく、本物のRTDBでのG7試験が未実施だった。

## 実装

- 既存の tests/v2-g6-live-firebase.browser.mjs に、以前成功したG6の基本セットによるA→B→Aの双方向試験をそのまま残した。
- G6検証後、一時ルームのmeta.hostIdを照合して削除し、新しい一時ルームを作成する。既存ルームや他ゲームのRTDBノードは変更しない。
- G7のrecovery固定セットで、ホストAがHP+5→MP+5→ワンダーソード攻撃→ゲストBが許す、次にゲストBがHP+10→MP+10→反射剣攻撃→ホストAが許すまで、2つの独立WebKitブラウザコンテキストで操作する。
- 本物のgodfieldV2LabRooms配下で、両席のHP/MP、revision=14、相手の未使用手札が表示用ビューへ含まれないことを確認する。
- 新たな通常Nodeテスト tests/g7-live-probe-syntax.test.mjs は、実Firebase用テストの構文、両ケースと手動専用トリガーの保持を検査する。
- GitHubの既存手動ワークフロー g6-live-firebase-probe.yml をそのまま使用。Firebase Security Rules・認証・学校Google Sites埋め込み版・mainの変更はない。

## 出典と境界

- [Piong その他神器（2026-10-24）](https://w.atwiki.jp/piong/pages/19.html)、[GFGA神器一覧](https://w.atwiki.jp/gfplusa/pages/18.html)で回復データを二重照合。対応エンジンの範囲は[G7回復資料](V2_G7_PLAIN_RECOVERY_ITEMS_2026-10-30.md)参照。
- [Firebase RTDBのWeb公式資料](https://firebase.google.com/docs/database/web/read-and-write)を確認したが、既存のWeb SDKと通信方式を維持し、新たな認証等は導入しない。
- **今回、実FirebaseのG6基本対戦とG7回復対戦を本当に実行し、両方とも成功した。** 一時的に開発PRでlive workflowを一度起動させ、完了後に元の `workflow_dispatch` のみに復帰。 [Actions run 41050294774](https://github.com/8mahi8/party-card-replica/actions/runs/41050294774) の実行ログに `G6_LIVE_TWO_BROWSER_SUCCESS`（revision6）、`G7_LIVE_RECOVERY_SUCCESS`（revision14）、2回の `G6_LIVE_CLEANUP_SUCCESS` が存在し、ジョブ全体もsuccess。G7模擬WebKitの49/49は独立した以前の根拠である。

## 検証結果と次の作業

- **実Firebase検証：成功**。[run 41050294774](https://github.com/8mahi8/party-card-replica/actions/runs/41050294774) のジョブ成功と明示ログを確認。G6 basic 2往復とG7 recovery双方が通過し、各試験用ルームはホストID照合後に削除した。
- **常時CIの状態**：試験トリガーを一時変更したコミットでは、手動限定を監査する通常Nodeテストが意図どおり失敗した。ライブ検証後にworkflowは元の手動限定へ復帰。復帰後のCIを確認すること。
- **残課題**：学校iPad SafariとGoogle Sitesコード埋込の実機確認、正規の353種類/500枠の原作カードデータ、残りの個別効果と9枚の本番配布。
