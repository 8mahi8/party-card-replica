# G7｜乱気流の弾き先と病→治療の2人通し試合（2026-10-31）

## 原作の確認と実装選択
- [GFGA奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)・[Piongタイマン攻略](https://w.atwiki.jp/piong/pages/21.html)：〈乱気流〉はMP5で奇跡を「弾く」。**必ず攻撃者に反射するわけではなく**、自分や他の生存者に飛ぶリスクがある。
- [Piong武器・防御リダイレクト](https://w.atwiki.jp/piong/pages/17.html)：弾き先は生存プレイヤーから無作為で選択され、**弾いた本人へ戻った場合は二度目の防御がない**。反射と弾きは別の処理。
- [2025年の初心者攻略](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)では奇跡を「弾く」は50%反射効果相当として説明される。2人対戦においては結果的に攻撃者か防御者へ分かれるが、サイコロを固定割合で独自実装せず、既存`v2/redirect-route.mjs`の生存者選択＋host RNGをそのまま再利用する。
- **今回新しい戦闘効果エンジンは書き直さない**。既存で〈乱気流〉の弾き・MP/習得・乱数・二次防御は実装済み。まだ原作ゲームを直接操作して全演出は確認していないため、推測で挙動を追加しない。

## 今回の実作業
1. `tests/g7-turbulence-and-infection-cure-v2.test.mjs`：8件の回帰試験を追加。seed12345では〈風〉が乱気流の**使用者自身へ戻り**再防御なし、seed71では**元の攻撃者に戻り**反射した奇跡に対してエンゼル防具で再防御可能。元攻撃者が許した場合の風邪+当ターンのHP-1、習得済み乱気流のMP5・追加1枚・コマンド再送、MP4不足による防御宣言不成立、〈風〉→次ターンスマイル貝がら治療→反撃、〈天国風〉→ハート貝がら→反撃、**習得〈天国風〉の2回詠唱による天国病発作KO**を検査。
2. `v2/demo/firebase-online-lab.html`：研究用固定4枚セット`turbulenceSelf`（rngSeed12345）、`turbulenceBack`（rngSeed71）を追加。攻撃側に風/天国風/対奇跡停止、守備側に乱気流/治療貝がらなどを配り、どちらへの弾き返しか試せる。研究プリセットは12→**14種類**。出現率に関与する元カード台帳は変化なし、**174種類・参考435/500枠、`complete:false`**。
3. `tests/v2-firebase-online-webkit.browser.mjs`：2画面WebKitで乱気流が自分へ戻るケース、元攻撃者へ戻ってエンゼルで停止するケース、元攻撃者が受けて風邪+HP-1になるケースの3つを追加。MP減少・習得・手番移行・画面表示を検証。
4. `tests/v2-g6-live-firebase.browser.mjs`：実際のFirebase RTDBで上記3ケース、さらに〈風〉／〈天国風〉を相手に付与→相手がハートの貝がらで解除→相手が通常攻撃→元攻撃者が防御せず受ける、という2種類の**一試合通し試験**を追加。
5. **実際のUIバグを発見・修正**：乱気流で奇跡が攻撃者に戻ったとき、元の奇跡は使用済みで手札から消えているため、`viewStagingRoom`が防御側に「戻ってきた奇跡名」を示せなかった。戦闘処理は正しくても表示が空白だった。修正では、すでに公表済みの`pending.attackContext`の**元の奇跡定義／攻撃値／属性を検証して再表示**し、未公開手札や習得奇跡を露出しない。**単独奇跡の反射・弾きだけ**に絞った。合成武器等の未照合の公開順序は勝手に変更しない。テストには反射後のカード名の表示とプライバシーを追加。

## 結果
- Node `tests/g7-turbulence-and-infection-cure-v2.test.mjs` 8件追加、**1026/1026成功**（GitHub Actionsを参照）。既存エンジンの隠れた壊れを作らない方針。
- GitHub Actions実Firebase [run 41080143334](https://github.com/8mahi8/party-card-replica/actions/runs/41080143334)：**27/27シナリオ成功**。従来22ケース＋新規`G7_LIVE_TURBULENCE_SELF_SUCCESS`、`G7_LIVE_TURBULENCE_ANGEL_SUCCESS`、`G7_LIVE_TURBULENCE_ACCEPT_SUCCESS`、`G7_LIVE_WIND_CURE_WIND_SUCCESS`、`G7_LIVE_WIND_CURE_HEAVEN_SUCCESS`。ホストIDを照合して27件とも`G6_LIVE_CLEANUP_SUCCESS`、学校ルームや他ゲームには触れていない。このライブ実行は表示修正の直前であり、表示修正後はWebKitで追加検証している。
- WebKit 2画面・旧画面の合否は最新GitHub Actionsを参照。実学校iPad SafariとGoogle Sites直貼りHTMLは引き続き未検証。
- Firebase Security Rules・認証方式、学校のGoogle Sites直接埋め込みHTML、GitHub mainを変更しない。試験時のみPR起動にしたビルダー／Firebaseプローブworkflowは**手動専用へ復帰**した。

## 次の作業
原作版ゲームの乱気流の実画面と比較したうえで、習得済み乱気流のタップUIからの選択（現UIは習得一覧の表示までで、全種類の習得済み奇跡をすぐ発動できる画面は未完成）、複数人での弾き先・弾きの連鎖、反射した複合攻撃の公開表示、他種の災いの実装可否を優先順で検討する。まずは学校Safariの実機での操作性と友達と遊べる完成度の確認を重視し、低確率な特殊例外のための大規模リファクタリングは行わない。

## WebKit再検証・最終確認
- 一時的なWebKitテスト失敗 [run 41080143381](https://github.com/8mahi8/party-card-replica/actions/runs/41080143381) は、乱気流で元攻撃者へ戻された奇跡が防御画面の`incomingAttack`に表示されない**実UI不具合**を発見したもの。元の詠唱奇跡は手札から除去済みのため、古い表示機構が公開済みの奇跡を復元できなかった。エンジンの感染・反射・MP処理は正しかった。
- `v2/staging-room.mjs`の`declaredAttackFixture`を、**すでに攻撃宣言で公表された単独奇跡に限り**不変`pending.attackContext`（奇跡ID、攻撃値、属性）から表示を再構成するよう修正。未公開手札は見せない。新テストに「戻ってきた天国風の表示」「手札秘匿」を追加。
- 修正後のWebKit [run 41081035588](https://github.com/8mahi8/party-card-replica/actions/runs/41081035588)：**オンライン192/192 PASS**、既存WebKit固定サイズ画面**339/339 PASS**。Chromium [run 41081035417](https://github.com/8mahi8/party-card-replica/actions/runs/41081035417) PASS、Node [run 41081035693](https://github.com/8mahi8/party-card-replica/actions/runs/41081035693) 1026/1026 PASS。
- **実Firebase 27ケース成功** [run 41080143334](https://github.com/8mahi8/party-card-replica/actions/runs/41080143334) は表示不具合の修正前の実行。表示修正後はWebKitで確認済みであり、実Firebaseの27ケースをあらためて実行したとは**報告しない**。
