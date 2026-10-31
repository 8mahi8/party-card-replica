# G7｜通常HP・MP回復雑貨の対象指定・反射（2026-10-30）

## 原作根拠・優先理由

前回の実装は `i006`～`i012` の7種類を自分にしか使用できなかったが、原作の雑貨は他のプレイヤーにも使用できる。

- [初心者向け God Field ルール](https://godfield-beginner.game-info.wiki/)：チーム戦では味方を選択してHP/MP回復できると明記。
- [アニヲタWiki ゴッドフィールド](https://w.atwiki.jp/aniwotawiki/pages/47010.html)：雑貨は相手にも使用可能。
- [Piong 神器一覧－その他](https://w.atwiki.jp/piong/pages/19.html)（2026-10-24更新）と [GFGA神器一覧](https://w.atwiki.jp/gfplusa/pages/18.html)：7種類のHP/MP回復量・価格・参考取得率を照合。
- [原作タイマン攻略](https://w.atwiki.jp/piong/pages/21.html)：雑貨を使って手札を入れ替えた後、攻撃できる手番の存在。
- スーパーミラーは「何でもはね返す」と記録されているが、**実際の原作ブラウザで回復雑貨7種類すべての反射を実演・実測したわけではない**。今回は既存エンジンの「対象が別プレイヤーの雑貨→反射/許す」処理を流用している。必要なら原作画面で追加検証する。

## 実装

- `v2/staging-room.mjs`：7種類の `restoreResource` にも `useItem.targetId` を許可。他の生存プレイヤーを選ぶと `itemDefense`。自分への使用は従来通り即時解決。対象が落ちている場合や、所持していない物理カード、他席の操作を拒否。
- `v2/room-transition.mjs`：他席への回復ならその席の `respondItem`（許す／実物のスーパーミラー1枚）を待つ。許すと指定先、鏡を使うと元の使用者へHP/MP回復。既存の `restoreResource` を使うため99上限も維持。アイテムと鏡の補充、攻撃手番の継続は既存共通キューで処理。普通の回復に不要な乱数抽選をしない。
- `v2/demo/firebase-online-lab.html`：`対象：自分／相手` の切替を7種類にも表示。「相手への回復と反射」研究用固定4枚セットを追加（ホスト：HP+5、MP+5／ゲスト：スーパーミラー）。旧5種類の研究セットは維持。
- 正規353種・500枠の抽選には手をつけず、部分カタログは **163種類・408/500参考枠、`complete:false`** のまま。

## 検証

- `tests/g7-targetable-plain-recovery-v2.test.mjs`：各7種類について相手への宣言と手札秘匿、許す後の回復量、反射で回復先が戻ること、99上限、1枚ずつの補充、同一操作の再送が無効、回復後の攻撃。
- `tests/g7-dokidoki-target-mirror-v2.test.mjs`：以前「通常回復は相手に使えない」と決めつけていた期待値を原作調査後の仕様へ更新し、反射札偽装の拒否を維持。
- `tests/v2-firebase-online-webkit.browser.mjs`：2つの独立WebKitページ、390×430タッチ画面・模擬RTDBで、HP+5を相手に使用→許す/鏡、さらにMP+5を相手へ使い、攻撃手番に戻るまで検証。
- 通常CIは Node **952/952成功**、Chromium **成功**、WebKitオンライン **87/87成功**＋旧画面 **339/339成功**を確認。
- 実Firebaseは一時ルーム4つを使う検証 `tests/v2-g6-live-firebase.browser.mjs` に新たな「HP+5の反射→MP+5の許す」を追加。初回は最終revision=6を5と誤記したテスト期待値だけが失敗し、実画面ではHP45/40、ゲストMP15で正しく同期。**再実行成功を確認**：[GitHub Actions run 41056408728](https://github.com/8mahi8/party-card-replica/actions/runs/41056408728) に `G7_LIVE_SUPPORT_RECOVERY_SUCCESS`（revision6・HP+5反射・MP+5許す・秘匿手札）と、既存のG6/G7成功ログ、4回の一時ルーム削除成功を確認。workflowは従来の手動起動へ復帰した。

## 設定と次の作業

学校のGoogle Sites直接貼付HTML・GitHub main・Firebase Security Rulesと認証は変更しない。開発版の旧/V2オフライン/V2オンライン単体HTML3種類はGitHub開発ブランチへ再生成済み。HTML生成とFirebaseライブ検証のCIワークフローは、検証後に元の手動起動へ戻す。学校の実iPad Safari＋Google Sites埋込でのテストは別途必要。

次は本物のFirebaseの結果を確認し、未登録の特殊雑貨・神器を原作資料とエンジンの実装状況に合わせて進める。一般的な雑貨の対象仕様から、未実装の天国草や状態異常まで推測で処理しない。
