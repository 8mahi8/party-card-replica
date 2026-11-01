# G7｜邪神の大剣・与えたダメージ分の反動（2026-11-02）

## 原作情報と留保
- [Piong 単体武器一覧](https://w.atwiki.jp/piong/pages/15.html)（2026-03掲載）と[まかろん 神器一覧](https://macarongamemo.com/entry/godfield-artifact)（2026-02-28）の記述が一致：**無属性／攻14／価格¥1／0.2%（1/500）／与えたダメージ分を自分も受ける**。
- [ゴッドフィールド攻略記事（2021頃）](https://ameblo.jp/shibransk/entry-12647363984.html) は「邪神の大剣を弾いた結果、自分に戻ると通常ダメージと反動を両方受けて倍の被害になる」ケースを説明。原作の2026年版を直接操作した一次証拠ではない。
- 本実装は**固定2席の研究版の単独武器のみ**。他の武器／追加攻撃／奇跡との組み合わせは「未確認」として拒否。弾く・反射の現在源泉を保持する共通戦闘処理を利用する。

## 実装
- `src/verified-basic-cards.mjs`：`w063`邪神の大剣、攻14・¥1・重み1、`hpRecoil:true`。
- `v2/legacy-adapter.mjs` → `v2/foundation.mjs`：型付き`afterHit:recoilHp({amount:'damage'})`。未知の組み合わせやデータは通さない。
- `v2/ordered-attack.mjs`：攻撃効果コンパイルから`recoilsHp:true`。単独攻撃だけ許可。
- `v2/basic-resolution.mjs`：既存の属性・防御・最終ダメージ算出と同じ`hit.damage`を使い、`hit`の直後に`recoil`効果キューを置く（別のダメージ公式は作らない）。
- `v2/effect-runner.mjs`：正しい武器由来であること、`pending.sourceId??originalAttackerId`が反動受け手であること、先行`hit`とダメージ値が一致することを検査。HP0に達した場合は既存の太陽のお守り蘇生経路を再利用。後続の補充／試合終了判定は元の共通ルート。
- 原作「弾く」で自分へ返した場合、現在の攻撃源／被弾者が同一になり、直接ダメージと反動を二回受ける。ミラー反射で別の人へ返す場合には、反射した人が新たな攻撃源となり反動を負う。
- 研究オンラインUI `recoilSword` は28番目の**固定手札セット**。正式な確率抽選ではない。
- 研究台帳は**187種類／448参考枠**、`complete:false`。2025年353種の古い公表分類と2024年237種の別資料は集計が不整合で、全種類を網羅したとは主張できない。

## 検証
- `tests/g7-recoil-sword-v2.test.mjs`：数値・データ検証、無防御14/14、守3で11/11、完全防御0/0、ミラー反射、双方0HPで引き分け、攻撃側への致命的反動と太陽のお守り蘇生、未検証連携の無変更拒否、従来武器の回帰。
- `tests/v2-firebase-online-webkit.browser.mjs`：2独立タブ＋模擬RTDBで邪神の大剣をタップし、相手の許可から双方HP26、手番進行、390px内の画面収まりを確認するシナリオを追加。
- **GitHub Actionsで検証した実測**：Node **1,136/1,136成功** [run 41361455922](https://github.com/8mahi8/party-card-replica/actions/runs/41361455922)、Chromium **28/28成功** [run 41361455863](https://github.com/8mahi8/party-card-replica/actions/runs/41361455863)、WebKit **模擬RTDB2画面333/333＋旧UI339/339成功** [run 41361455893](https://github.com/8mahi8/party-card-replica/actions/runs/41361455893)。HTML3本を開発ブランチで再生成して同梱し、ビルドWorkflowは元の手動専用設定に戻した。
- 本物Firebaseを用いた今回のカードの通信と**学校iPad実機 Safari・Google Sites貼付版は未検証**。Firebase Rules・認証、学校HTML、mainは変更しない。

## 次の作業
1. Node/Chromium/WebKitとオンライン2タブ模擬RTDBの結果を確認。失敗したら原因から修正。
2. 既存の属性・奇跡・治療ロジックを使える特殊武器や病の効果を原作確認の上で拡張。
3. 実際の原作で「夢」「暗雲」の挙動を一次検証できるまでは表示錯覚・必中の詳細を推測で実装しない。
