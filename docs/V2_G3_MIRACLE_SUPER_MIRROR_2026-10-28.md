# V2 G3｜スーパーミラーによる単体奇跡の反射（2026-10-28）

## 原作資料と確度
- https://w.atwiki.jp/piong/pages/17.html : スーパーミラーの「何でもはね返す」、はね返す＝元の攻撃者に返す
- https://kankurou53.hatenablog.com/entry/2025/07/19/165703 : 奇跡も反射対象に含む説明
- https://w.atwiki.jp/gfplusa/pages/19.html : 奇跡のMPと習得、精霊の適用順

第三者資料に基づく。現行原作サーバーとの同条件実機照合はまだない。

## 今回の実装
- 単体攻撃奇跡に対するスーパーミラー単独防御を反射として処理
- 元の攻撃者へ戻り、再防御ができる。複数回反射しても最初の詠唱コスト・MP・習得は一度だけ
- 初回反射時に共通効果キューで費用を処理、補充と次ターンは最後の命中まで保留
- 鏡と防具の併用は未検証として拒否。既存の武器/壁の処理はそのまま

変更：`v2/miracle-resolution.mjs`、`v2/room-transition.mjs`、`tests/miracle-resolution-v2.test.mjs`、`v2/demo/standalone.html`。
追加検証：反射して自分で防御、反射2回、混合選択での原状態不変。

## 未実装と次工程
〈乱気流〉の「弾く」、スカイ防具、月光のよろい、全体奇跡、奇跡以外のスーパーミラー反射対象は今後。現行原作との照合、学校iPad Safari/Google Sites確認、オンラインは未完了。

CIは実行結果を個別に確認。mainと学校Google Sites版には触れない。
