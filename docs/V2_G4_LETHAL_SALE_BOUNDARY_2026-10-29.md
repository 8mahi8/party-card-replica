# G4｜致死売買の検証境界と自己取引・反射の根拠調査（2026-10-29）

## 今回の結論

**「売る」で相手のHPが0になり得ることは確認できたが、致死時の取引全体は未確定。**

原作の検証済み部分と未検証部分を混ぜず、独立した純関数で分類する。死亡時のカードの持ち主、補充、太陽のお守り発動順、全資源を超える価格の売り手入金額が確定するまでは、**ゲームの決済エンジンで致死売買を勝手に完結させない**。

## 原作照合

| 観測・記述 | 根拠と証拠強度 | 現在の対応 |
| --- | --- | --- |
| 売るの代金は ¥→MP→HP | [アニヲタWiki取引と具体例](https://w.atwiki.jp/aniwotawiki/pages/47010.html)、[ひぃらぎ実践解説](https://note.com/hixiragi/n/n47365b74f372)（独立した二次説明） | `planForcedSalePayment`で計算済み |
| 取引代金が総資源を超えても、HPは0になり得る | [アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html)、[経済でヒトは殺せる](https://idea427.hatenablog.com/entry/2023/07/31/192159)（二次説明） | `inspectForcedSaleLethalityFixture`で shortfall を区別 |
| HPが0になると太陽のお守りで復帰することがある | [アニヲタWiki「太陽のお守り」](https://w.atwiki.jp/aniwotawiki/pages/47010.html)（二次説明） | zeroHpRecoveryOrResurrectionとして**保留** |
| 自分の神器を自分へ「売る」と幻覚確認に利用できる | [2024年の実戦攻略](https://note.com/tohma_kaimera/n/ndb5619ce0748)（単一実践記述） | 現行2026年版の直接観測なし。自己売却の結果を実装しない |
| 売るに使える防御はスーパーミラー | [2021年実践記事](https://ameblo.jp/shibransk/entry-12647363984.html)、[2026年2月の対戦記事](https://ikamaki767.hatenablog.com/entry/2026/02/19/113917) | 非反射・単一反射の研究版のみ。重複反射の細かな進行は保留 |
| 売るが返されたときの支払い／カード所有 | 2025年資料を以前確認。ただし連続反射・致死・自己売却は不明 | 非致死の単一反射ラボは既に実装。一般化しない |

**いずれも現行原作クライアントの一次トレースではない。** 本家に忠実であると称するのではなく、二次資料間で矛盾しない範囲の実装を積み上げる。

## 今回のコード

- `v2/trade-lethal-review.mjs` 新設：`inspectForcedSaleLethalityFixture(state,catalog,selection)` は**手元の実際の「売る」個体**・売る商品・対象者を厳密に照合し、既存の純関数`planForcedSalePayment`に基づく料金プランを解析する。
- 結果は `survives` / `hp-zero-exact` / `hp-zero-shortfall` の3種類。前者は通常の決済に進める可能性があるが、手札枚数や入金額の別条件もあり、通過を保証するものではない。後2種類は**必ず needsZeroHpReview=true**で未確定の処理を列挙。
- `hp-zero-shortfall` のときは、`sellerCredit` が既存計算の通り `null`。名目価格満額か実際の徴収額かを捏造しない。
- pure/immutable：入力roomの変更、カード移動、ターン進行、仮の配当は一切しない。RNGも変えない。
- `v2/staged-sale.mjs` の取引宣言検証へ接続。死亡可能な売買で安全な通常決済も反射決済も成立しない場合、相手に防御応答を要求する前に `Lethal forced sale requires original zero-HP settlement verification` と明示して**ルームを元のターンから動かさない**。
- `v2/lab-controller.mjs`：該当エラーを日本語へ変換。**「売る自体が原作で無効」と誤解させない説明**に変更。
- `tests/staged-sale-v2.test.mjs` の期待値を更新し、`tests/trade-lethal-review-v2.test.mjs` に **10テスト追加**：普通の¥25売買、正確なHP0、支払い不足HP0、低資源の系統試験、価格・個体の真正性、pure性、¥0奇跡、宣言の早期拒否、鏡があれば反射経路へ進める境界。
- `v2/demo/build.mjs`のモジュール依存順へ新機能を追加し、`v2/demo/standalone.html`を**25モジュール**から再生成。旧UI操作の変更はしない。

## 残る判断

1. 原作対戦で「売る」により相手の資源がちょうど0になるケース、および総資源を超えるケースの**画面上の順番・売り手の増額・神器移動・補充**。
2. 相手に「太陽のお守り」があるとき、HP0になってからの復活順、取引の再開有無。
3. 「売る」を自分に使ったときのアイテム個体ID、幻覚解除のタイミングと支払い。
4. 「買う」に対するスーパーミラー連続反射後の購入者・提示品・選択権。

**現時点のゲーム本体は研究用・オフライン1端末交代制。** 原作全353種/500参照枠と正規ドロー、学校Safari端末での動作、G6オンラインは未完成。main・公開Google Sitesは変更しない。

## 検証証拠

当日の最終コミットとNode/Chromium/WebKit CI結果は[Draft PR #1](https://github.com/8mahi8/party-card-replica/pull/1)に追記する。途中コミットのテストではなく、**最終HEADの3系統成功**を確認して報告する。
