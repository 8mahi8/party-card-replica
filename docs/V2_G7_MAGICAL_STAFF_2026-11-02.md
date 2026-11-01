# G7｜マジカルステッキ（残MP×2）を2席研究版で実戦接続（2026-11-02）

## 原作資料と不確定範囲
- [Piong 単体武器](https://w.atwiki.jp/piong/pages/15.html)・[まかろん2026神器一覧](https://macarongamemo.com/entry/godfield-artifact)が一致：**マジカルステッキ、無属性、価格10、参考0.2%（1/500）、残りMPをすべて消費してその2倍の攻撃力**。
- **単独使用**の基本処理だけ接続。0MPからの使用可否、追加武器・オーラ・＋攻奇跡・精霊補助との組み合わせの原作操作順は未確認。誤って本家仕様として確定させず、本研究版では拒否。
- 2026年現行の原作ゲームを直接操作して全分岐を検証したものではない。

## コードと効果キュー
- `src/verified-basic-cards.mjs` に `w062`（攻撃基礎値0、`mpAttack:true`）を追加。専用の武器名による分岐は作らず、`v2/legacy-adapter.mjs` と `v2/foundation.mjs` の型付き `onDeclare:spendMpForAttack({multiplier:2})` に変換。
- `v2/ordered-attack.mjs` で**宣言時のMP**に2を掛け、MP消費を共通 `queuedAttackCosts` の `mp` 効果へ載せる。実際のHPダメージは従来の `v2/basic-resolution.mjs`・`v2/effect-runner.mjs` を利用し、数値防具、鏡反射、補充、手番進行を変更しない。
- 反射時は解決済みの不変 `attackContext` を使い、MP消費とカード使用を二度行わない。攻撃力を再計算するとMP0×2となるバグを避ける。
- 2人オンライン研究版の27番目の固定プリセット `magicalStaff`（A MP8・霧などの状態なし）を追加。防御者には「攻MP×2（宣言時）」、攻撃選択時も数値0ではなくMP依存攻撃と表示。原作正式抽選には接続しない。
- 研究台帳は **186種／447参考枠、`complete:false`**。他版の正規総数・確率不一致を推測で埋めず、正式なランダム山札は依然禁止。

## テストと効率改善
- `tests/g7-magical-staff-v2.test.mjs` 新規7件：型付きカードと原作値、MP8→攻16/全消費、守3防御による13ダメージ、スーパーミラー反射後のMP再徴収なし、未知連携の状態不変拒否、MP0の状態不変拒否、従来通常武器の回帰。
- `tests/v2-firebase-online-webkit.browser.mjs` に独立2タブの模擬RTDB WebKit タップ検証を追加。宣言時の攻MP×2表示→許す→HP24・MP0→手番進行と390×430画面収まりを検査。
- 過去の実カード追加で、古い台帳数値をコピーしたテストが十数件失敗する問題を繰り返していた。そのため個別カードのテストから固定186/447を取り除き、`tests/helpers/research-catalog-contract.mjs`の単一スナップショットを参照するよう整理。**ただしカテゴリごとの型付き参照分布は独立監査を維持**し、誤った版の確率を正当化しない。
- GitHub ActionsのNode/Chromium/WebKit実行結果は最終HEADで別途確認する。CI合格と本家原作仕様の一次確認、および学校iPad Safari実機検証は異なる。
- Firebase Security Rules・認証・GitHub main・学校Google Sites HTMLに変更なし。

## 次
1. 最終HEADのCI、WebKit 2画面・タップ表示と旧UIの回帰を確認。
2. 原作の未確定連結ルールを調査。0MP、武器・奇跡の合成は元ゲームの操作情報が得られた場合にのみ拡張。
3. 原作裏付けが強い次のカード／状態効果を既存の共通処理で追加。部分台帳を完全版の抽選として公開しない。
