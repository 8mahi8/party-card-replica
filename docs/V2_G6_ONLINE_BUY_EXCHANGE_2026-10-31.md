# G6｜オンライン「買う」「両替」の2人タップUI（2026-10-31）

## 原作との対応と現在の制約
調査対象：
- [ゴッドフィールドwiki：取引](https://w.atwiki.jp/piong/pages/19.html)：両替はHP・MP・¥の1対1振り分け、「買う」は相手の持つ神器を無作為に1つ抽出、所持金が足りなければ「貧乏」
- [ゴッドフィールド解説](https://w.atwiki.jp/aniwotawiki/pages/47010.html)：買うか買わないかを購入者が選択、所持金で支払い、未使用奇跡は無料
- [2026年9月 両替攻略](https://toroccowars.jp/21547/)：HPを確保してMP/所持金へ適宜振る

既存研究エンジンに `declareBuy`→`buyDefense`→`buyDecision`→`decideBuy`、`exchange` が存在。効果・乱数・所持金増減・補充はこれらのステージング/決済を再利用し、新しい独自計算をエンジンに追加しない。

**買うをスーパーミラーで反射した後の効果・優先順位は現行原作の直接確認に不足**。現状エンジンも `respondBuy` のMirror応答は拒否する。本オンライン研究UIではこの制約を明記して、相手は「購入依頼を通す」経路のみ操作できる。フルハンド時の購入・相手の手札が空の場合、特殊な購入枠処理も未確認のまま。これを原作に完全一致した取引仕様と宣伝しない。

## 実装
- `v2/demo/firebase-online-lab.html`：16種から **18種**に研究用固定セットを増設。`buy` （Aが買う／Bが反応）と`exchange`（Aが両替）を追加。
- 買う：物理カード`t002`を選ぶと`declareBuy`、Bがパスすると、A **だけ** に商品名・価格を公開。所持金不足なら購入ボタンを無効化して「貧乏」を示す。Aが`decideBuy({accept:true|false})`で確定。Bの画面にAの購入判断用の`pending.offer`は出さない。元からある座席別投影をそのまま使う。
- 両替：`t003`を選ぶとHP・MP・¥の3つの数字入力を提示。整数・HP1以上・合計保存でのみ確定できる。コマンド`exchange`に`exchangeInstanceId`と明示的な`allocation`を指定。サーバーは既存`previewExchangeFixture`で同じ合計と生存条件を再検証。
- 一般攻撃ボタンでは取引カードを打てないようにし、認可された「買う」「売る」「両替」専用操作へ分ける。各手番のrevision更新で選択中の両替入力を破棄し、古い配分が次手番に残らない。
- 手札/状態の大規模改修、Firebase Security Rules／認証方式は無し。既存のオンライン単体HTMLをソースから再生成。

## テスト
- `tests/g7-online-loadout-presets-v2.test.mjs`で18セットの4枚・カード定義と初期条件を検査。
- `tests/firebase-online-lab-page-v2.test.mjs`で、購入候補の公開先、購入・見送りと両替命令、合計保全・ボタンの存在を検査。
- `tests/v2-firebase-online-webkit.browser.mjs`で、2タブ＋模擬Firebase＋390×430画面。買うの購入・見送り、公開タイミング・所持金・手札枚数・手番、両替の入力変更・不正合計のブロック・確定後のHP/MP/¥を操作試験。
- GitHub Actions：Node **1030/1030 PASS**（https://github.com/8mahi8/party-card-replica/actions/runs/41090645823）、Chromium **PASS**（https://github.com/8mahi8/party-card-replica/actions/runs/41090645886）、WebKit **2人オンライン257/257 PASS、既存画面339/339 PASS**（https://github.com/8mahi8/party-card-replica/actions/runs/41090418243）。このWebKitは本物の学校iPadや実Firebaseではなく、模擬Firebase上のPlaywright WebKit操作試験。

## 未検証と次
学校のiPad実機／Google Sitesに直接埋め込んだHTML／今回の買う・両替の実Firebase試合は未検証。正規山札は `complete:false` の研究台帳174種類・435/500参考枠の段階。次はオンラインUIとオフライン原作表示の比較、ボタン密度・入力の操作性、未実装カードを優先して試す。

**開発ブランチだけ更新。学校Google Sites版・main・Firebase Security Rulesは変更しない。**
