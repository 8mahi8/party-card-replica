# G7｜フラッシュダガー：1以上のダメージ後に閃光を付与

作業日：2026-11-02｜開発ブランチ `refactor/v2-foundation-review-20261027`

## 原作照合

- [2026年まかろん神器一覧](https://macarongamemo.com/entry/godfield-artifact)：**フラッシュダガー**攻2、光、¥15、授かり率0.2%、ダメージを与えた対象が閃光状態になる。
- [Piong 単体武器一覧（2026年更新）](https://w.atwiki.jp/piong/pages/15.html)：攻2、光、¥15、0.2%に一致。**対象へ1以上のダメージを与えた時**という条件を明記。
- [Game Breeze 災い一覧（2026年）](https://toroccowars.jp/21531/)：フラッシュダガーで閃光が付くことと、閃光状態では防御神器が1つに制限されることを記載。
- 原作現行版の実操作による一次確認ではない。**〈閃光〉奇跡は25%全体攻撃であり、単体武器とは別経路**。全体攻撃の確率／対象処理を推測で実装しない。

## 実装内容

1. `src/verified-basic-cards.mjs` に新ID **w060**：攻2／光／¥15／参考重み1、`afflictionOnHit:'flash'` を登録。既存病系4段階とは別の非病系状態として扱う。
2. `v2/legacy-adapter.mjs` と `v2/foundation.mjs` で型付き `afterHit:inflictAffliction({affliction:'flash'})` を検証。未確認の他状態・追加効果は拒否。
3. `v2/ordered-attack.mjs` は通常の単一武器攻撃として取り込み、未確認の蜃気楼／オーラ／追加武器／病効果との混用を拒否。任意のコマンドから閃光を直接注入できない。
4. `v2/basic-resolution.mjs` は既存の算出済み実ダメージが正の場合のみ `inflictAffliction` をキューに追加。`v2/effect-runner.mjs` は宣言された元の武器効果・命中・現在の対象を確認してから、ダメージを受けた生存者へ付与。**反射後は攻撃者側に付与**、防御でダメージ0なら付与なし。既に閃光なら重複追加なし。
5. `v2/demo/firebase-online-lab.html` に23番目の研究セット `flashDagger`。ホストがダガーで攻撃、ゲストが受けてからスマイルの貝がらで治療する固定手札。正規山札でのランダム抽選は使用しない。
6. `tests/g7-flash-dagger-v2.test.mjs`：カード定義、敵の選択前の非付与、防御による0ダメージ、重複防止、反射後の適用先、被弾から治癒、死亡時の扱い。 `tests/v2-firebase-online-webkit.browser.mjs`：2つのWebKit画面と模擬RTDBで、ダガー宣言から被弾・閃光付与・貝がら治療をタップ。

## 範囲・優先順位

- 研究部分台帳：**182種類／443参考枠、complete:false**。2024/2025確率表と2026神器一覧の版差は維持し、見かけの500枠を強制的に作らない。
- **未実装**：全体攻撃〈閃光〉、天王の指輪などの反撃付与、霧・夢・暗雲、原作の正規山札、学校iPad Safari実機およびGoogle Sites直接貼り付け実測。
- Firebase Rules、認証方式、学校Google Sites、mainへの変更なし。GitHubの単体HTMLは開発・試遊版。
## 最終CI検証（2026-11-02 日本時間）

- [Rules Lab Tests run 41328918477](https://github.com/8mahi8/party-card-replica/actions/runs/41328918477)：**Node 1,077/1,077 合格**。
- [Chromium run 41328918449](https://github.com/8mahi8/party-card-replica/actions/runs/41328918449)：**28/28 合格**。短いiframe・横向き相当の画面を操作。
- [WebKit run 41328918484](https://github.com/8mahi8/party-card-replica/actions/runs/41328918484)：模擬Firebase Realtime Database・**独立2ブラウザで310/310合格**、従来画面**339/339合格**。フラッシュダガーの宣言時には閃光なし→防御なしでHP38と閃光付与→スマイルの貝がらを使うとHP38維持で閃光だけ解除、という手番を実際にタップして検証した。
- `v2/demo/firebase-online-standalone.html` と `v2/demo/standalone.html`、旧研究デモ `demo/standalone.html` をGitHub開発ブランチで再生成し同期。ビルドワークフローを**手動専用へ復帰済**。
- 中間CIの失敗は旧カード181/442と新182/443の期待値差分、古い単体HTML、光属性攻撃に対して光防具を選んだテスト誤り（光攻撃は普通の防具で防げないため虹のカーテン＋守3へ修正）。**最終コードでは全合格**。
- 実Firebase書き込み・学校iPad Safari実機・Google Sites直貼りは未検証。研究用固定補充の成功を本家の山札や学校本番の保証と混同しない。
