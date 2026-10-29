# G4｜取引「売る」の宣言 → 応答 → 決済を共通状態機械へ接続

2026-10-29。開発ブランチ：`refactor/v2-foundation-review-20261027`、Draft PR #1。

## 原作との照合・証拠の限界

- [ゴッドフィールドwiki（取引戦術）](https://w.atwiki.jp/piong/pages/21.html)：原作では「売る」にスーパーミラーを使う対策、値段・ターゲット選択、商品を売り返す戦略がある。
- [2021年実戦攻略](https://ameblo.jp/shibransk/entry-12647363984.html)：買う／売るに対抗できる神器はスーパーミラー。支払いは所持金→MP→HP。スーパーミラーは金銭・資源を逆方向へ動かす。
- [2026年2月実戦記事](https://ikamaki767.hatenablog.com/entry/2026/02/19/113917)：売るに対し相手がスーパーミラーを持つ可能性を想定した長考・読み合いに言及。
- [取引の手札補充記録](https://note.com/hixiragi/n/n47365b74f372)：売るカード分は補充、売った商品の分は補充されず、相手の手札に商品が移る。
- 上記は**第三者の解説・実戦観察**。最新原作で「連続反射」「HP0での精算」「18枚手札」「いつカードが補充されるか」の個別操作を直接録画・API取得した証拠はない。推測でゲーム本番へ統合しない。

## 実装したもの

**LAB-ONLY**の2コマンド状態遷移を追加：

1. **`declareSale`**：攻撃手番のAが、手札の実物`saleInstanceId`（定義済み「売る」カード）と`soldInstanceId`（商品）を指定し、生存中の相手Bへ取引を宣言する。カードの重複・未所持・tradeカードの売却を防御。ルームは`phase:'tradeDefense'`となり、Bが次の能動プレイヤーに。
2. **`respondSale`**：認証済みBだけが、「鏡なし＝受け入れる」か、実際の手札にあるスーパーミラーの`mirrorInstanceId`を指定。通常武器の反射剣、他人のミラー、偽IDを拒否。状態は`phase:'resolving'`へ。
3. **`resolveStagedSaleFixture`**：`v2/staged-sale.mjs`。受け入れなら`previewUncontestedSale`、1回ミラーなら`previewSingleMirrorSale`を使い、それぞれの既存処理を**同じ共有`runEffectQueueFixture`**の`spend→sale/reflectedSale→refill→advance`に変換。ソースに裏付けのない致死的・上限超過の決済はエラー扱い。
4. **入力前に成立可能性を検査**：売り手が取引を宣言した時点で、受け入れ・実際に持っているミラーの**少なくとも1つが検証済みの範囲で決済可能か**を確認。どれも成立しなければ相手を応答不能な待ち状態にしない。例えば買い手がHP1／MP0／¥0でも、ミラーにより払う側を売り手へ移せるなら取引宣言可能。
5. **`v2/staging-room.mjs`の認証と再送防止を共用**：`commandId`、`expectedRevision`、`actorId`、所有者のカード個体ID、相手IDのfingerprintを確認。途中失敗は元状態不変。同じコマンドを再送すれば重複扱い、新しい内容で同じコマンドIDなら拒否。
6. **公開投影**：`viewStagingRoom()`は相手の手札の**個体IDを出さず**、受信側へ商品の参照IDと価格と`awaitingTradeResponse`を公開する。内部のカード移動・決済計画・原本stateは返さない。

変更箇所：
- `v2/staging-room.mjs`：2コマンド、`tradeDefense`、fingerprintの対象ID、公開状態。
- `v2/staged-sale.mjs`（新規）：取引前の成立可能性チェックと2応答の決済。
- `v2/room-transition.mjs`：既存`submitAndResolveFixture`へ**LAB_ONLY**接続。
- `v2/effect-runner.mjs`：実行する売る／鏡の決済効果が、保留中の**認証された応答のseller/buyer/item/mirror**と一致することを照合。従来の独立研究用決済APIも維持。
- `v2/demo/build.mjs`：取引処理の3依存モジュールを定義順に配置、`v2/demo/standalone.html`再生成。WebKitの固定エイリアスによりモジュール数の追加でもテストが壊れない。

## テスト

`tests/staged-sale-v2.test.mjs`：新規11テスト。

- 2手続の手番・revision・決済前のカード・HP・MP・所持金が変わらないこと
- **受け入れる**→元の商品のインスタンスIDでBへ移動し、Aへ貨幣、Bへ所持金→MP→HPの請求
- **ミラー1回**→Aが代金を負担し商品を保持、Bが貨幣を受け取る。両アクションカード分だけ補充。
- 受け入れられない致死的売却でもミラーがあれば宣言可能。Bが受け入れを選ぶと状態不変のエラー、ミラーで安全に決済可能。
- 安全な決済経路が皆無なら宣言時点でエラー、相手を防御待ちにしない。
- 偽カード／他人のミラー／間違った相手／偽装コマンド／stale revisionを拒否、元状態維持
- **宣言側と防御側の双方のコマンドID再送**が冪等。不一致コマンドを識別するfingerprintは売る相手IDも含む。
- 3人戦でCが買い手でも次の手番はAの次のB、無関係者のHP・MP・所持金・手札ID不変。
- 他人の手札・内部乱数・処理記録が公開ビューから漏れない。
- `labOnly:true` + Trusted authorized seat 必須。勝手なライブ移行は禁止。

最終コード`67c57041bdd7466424dc4beb3dd603eccec46d53`のCI：
- Node Rules Lab **570/570 success** — run `40836451424`
- Chromium real-browser **28/28 success** — run `40836451468`
- Playwright WebKit touch **161/161 success** — run `40836451431`
- WebKit artifact：`v2-webkit-touch-evidence` ID `12880343736`。390px幅の既存対戦UI（捨てる／攻撃ボタン）などを**スクリーンショット目視確認**。**取引専用の新UIは未作成**なので、今回の取引画面の実タップ試験はしていない。

## 未完成のまま残すこと（重要）

- **連続ミラーに対する応答**：元売り手がもう1枚ミラーを持つ場合に、原作がどんな順序で反応を出し、途中補充があるか直接証拠なし。研究用状態遷移は1回反射で決済し、連続反射機能を実装しない。
- **致死的・18枚以上になる売却**：双方の取引決済プレビューで未確認ケースは拒否。正しい死亡／超過処理は原作API・実録画で検証する。
- **ゲームUIへの接続とオンライン**：`declareSale`と`respondSale`は研究用APIだけ。学校のブラウザ画面に売る専用操作をまだ出さない。友達との通信G6未完成。
- **カード台帳**：91種類・229参考枠の不完全研究デッキ。抽選は固定`d001`で、本家353種類・500枠の再現ではない。
- **Google Sites公開版・`main`は一切変更なし**。

次は原作実操作／動画から「連続ミラー」「死亡・18枚上限」を確認し、確定した仕様に限って取引UIを追加する。状態機械・コマンドと支払いエンジンは汎用に維持する。
