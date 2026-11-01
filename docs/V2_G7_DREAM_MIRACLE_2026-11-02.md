# G7｜奇跡〈夢〉・2席の状態付与と治癒（2026-11-02）

## 原作資料と実装の境界
- [Piong奇跡一覧](https://w.atwiki.jp/piong/pages/20.html) と[まかろん神器一覧（2026）](https://macarongamemo.com/entry/godfield-artifact) が一致：奇跡〈夢〉は**木属性／MP6／参考0.2%**。
- [Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)、[まかろん「夢状態における確率・期待値」（2026-04-05）](https://macarongamemo.com/entry/godfield-dream)、[2023のプレイヤー記事](https://idea427.hatenablog.com/entry/2023/07/31/192159)：夢の**後に授かった神器**が約50%で別のものに見える。既存手札はそのまま。偽物は使用タイミングを合わせ、奇跡・取引・スーパーミラーなどは除外。夢の治療は**歌声／ハートの貝がら**（音色・スマイル貝がらでは治らない）。治療時は本物の情報へ戻る。
- **厳守した未実装境界**：当プロジェクトのカタログは原作の全候補をまだ持っていない。正規の50%偽装抽選／候補の重みと新規授与時の自動付与は今回**未実装**。本家と同じ見た目混乱まで完成とは報告しない。研究用に以前からあった`attachDreamAppearanceFixture`を用いた**ホスト固定の偽物テスト**だけ、治癒したら正体が現れる挙動を接続。原作の50%乱数として公開しない。

## 変更点
- `src/verified-basic-cards.mjs`に`m021`〈夢〉（木／MP6／重み1）を追加。`legacy-adapter` → `foundation`の型付き`onDeclare:inflictAffliction({affliction:'dream'})`を共通化。
- `miracle-resolution`と`effect-runner`：固定2席・単独〈夢〉に限り、既存の奇跡消費、精霊、習得、エンゼル防御、スーパーミラー、補充、ターン進行を再利用する。反射時に効果対象を付け替える。3人以上の標的決定は原作調査が必要なため拒否。
- `disease-rules`：独立の`dream`災いを導入。軽度治療では維持、全治療では除去。`effect-runner`は全治療で既存ホスト固定偽装を同時に消して実物へ表示を戻す。物理カード定義は不変。
- オンライン2席研究版に29番目の固定試験`dreamMiracle`を追加。UIには**偽装抽選は研究中**と明示。A奇跡、Bスマイル/ハート貝がら・エンゼル/鏡でテスト可能。習得済み災い奇跡の攻撃ボタン表示も修正（以前の霧も対象）。
- カタログ **188種類／449参考枠、`complete:false`**。正規ランダム山札は禁止。異なる時点の公表総数（353種類vs237種類）の矛盾を解決済みとはしない。

## 自動テスト
- `tests/g7-dream-miracle-v2.test.mjs`：ソース値・型、付与タイミング、元の手札不変、軽度/全治療、エンゼル無効化、スーパーミラー反射、精霊でMP免除、習得済み使用、MP不足の原子性、ホスト指定偽装の治療による表示復帰。
- `tests/v2-firebase-online-webkit.browser.mjs`：独立WebKitタブ＋模擬RTDBで夢宣言→防御→状態付与→スマイルでは維持→ハートで解除、390px iframeの表示をタップ確認。
- **GitHub Actions実測**：Node **1,145/1,145成功** [run 41362759626](https://github.com/8mahi8/party-card-replica/actions/runs/41362759626)、Chromium **28/28成功** [run 41362759596](https://github.com/8mahi8/party-card-replica/actions/runs/41362759596)、WebKit**模擬RTDB2画面338/338＋従来UI339/339成功** [run 41362759611](https://github.com/8mahi8/party-card-replica/actions/runs/41362759611)。その後の変更はテスト待機DOMセレクタ・文書・一時workflow元戻しのみで、ゲームの戦闘仕様は変えていない。**学校iPad Safari実機と本物のFirebase対戦の成功は未検証**。
- 学校Google SitesのHTML、Firebase Security Rules/認証、mainブランチは未変更。開発ブランチの単体HTML3種は原始モジュールと同期して生成。
  
## 次の作業
1. 完全候補の調査と、原作の重み・同タイミング抽選ルールが検証できたら**受け取る瞬間だけ**の夢偽装を正しく有効化。未確認なら本番仕様として追加しない。
2. 〈暗雲〉は**確率全体攻撃の必中化**を伴うため、対象決定・命中判定・防御タイミングが再現できる技と合わせて研究する。状態だけで効果完成とは呼ばない。
3. 主要オンライン機能とUIの動作を安定化し、学校Safari実機試遊で最終確認する。
