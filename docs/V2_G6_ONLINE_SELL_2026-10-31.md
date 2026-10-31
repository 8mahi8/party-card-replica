# G6｜オンライン取引「売る」の研究用2人操作（2026-10-31）

## 目的と原作根拠
『ゴッドフィールド』の「売る」は相手に神器を売り付け、価格を相手の所持金→MP→HPの順で徴収する。スーパーミラーのみが取引に対応可能。参照した記録：
- https://note.com/hixiragi/n/n47365b74f372
- https://ameblo.jp/shibransk/entry-12647363984.html
- https://w.atwiki.jp/piong/pages/21.html
- https://toroccowars.jp/21551/

原作現行版を直接操作して網羅検証した証拠ではない。HP0を伴う売却、複数反射、自己売却、手札18枚の細部は未確定であり、既存の`staged-sale.mjs`が研究用に扱えるケースだけを利用する。

## 実装
- `v2/demo/firebase-online-lab.html`の研究手札に`sale`を追加（16種類目）。A：売る（t001）・金のこん棒（w003、¥25）・アイアンアーマー・ワンダーソード、B：スーパーミラー（i002）・通常防具2種・反射剣。4枚ずつの固定研究用、正規抽選ではない。
- Aは`売る→売却する神器`の順で2枚をタップし、「売る」専用ボタンで`declareSale`を送信。通常攻撃ボタンは売る選択中に無効。正確な価格を事前に表示。
- Bは`tradeDefense`で公開商品名・価格を確認し、無選択なら`respondSale`（受け入れる）、手札のスーパーミラー1枚選択なら`respondSale({mirrorInstanceId})`。通常防具と習得済み奇跡による応答は禁止。
- 2人オンラインの既存コマンドID・revision・座席固有表示・ホスト戦闘エンジンを流用。`viewStagingRoom`にはもともと`pending.offer`があり、商品名・価格を追加で秘密状態から直接読んでいない。
- エンジンの`validateSaleDeclarationFixture`と`resolveStagedSaleFixture`は変更なし。実験範囲外の致死売却は既存のエラーで拒否して状態を保持する。Firebase Security Rules・匿名認証方式も変更していない。

## 検証
- `tests/v2-firebase-online-webkit.browser.mjs`に、2画面模擬Firebase RTDB上での売却受入／単反射を追加。価格・公開提示、不要防具の無効化、HP/MP/¥、売却したカードの移転有無、ターン遷移、390px幅を確認。
- `tests/firebase-online-lab-page-v2.test.mjs`にUI／送信コマンド検査を追加。
- `tests/g7-online-loadout-presets-v2.test.mjs`に16種類の手札と売却額検査を追加。
- ソースから`node v2/demo/build-online.mjs`でオンライン単体HTML再生成。旧オフライン・V2オフライン単体HTMLも同一ビルダーで同期。生成用workflowは利用後に手動専用へ復帰。
- Node成功：1028/1028（run https://github.com/8mahi8/party-card-replica/actions/runs/41088807761 ）。Chromium成功： https://github.com/8mahi8/party-card-replica/actions/runs/41088807932 。WebKit（実2ページ・模擬RTDB） **オンライン231/231、既存画面339/339 PASS**： https://github.com/8mahi8/party-card-replica/actions/runs/41088723615 。学校の実iPad Safariや実Firebaseでこの操作を検証したものではない。

## 未検証／次
本物のFirebaseで今回新設した売買を両方の学校iPad Safariから操作したことはない。Google SitesにHTMLを直接貼った試験も未実施。現状は固定4枚＋固定補充の研究対戦。
次はWebKit全スイートの完了確認と、売却価格が画面内に収まるかのiPad実機試遊。機能追加では通常のプレイに重要な「買う」「両替」を既存研究エンジンから移す候補とする。原作の未確認ケースは独自に実装しない。

**Google Sites学校埋込版とFirebase Security Rulesは未変更。GitHubの開発ブランチのみ更新。**
