# G7｜〈閃光〉と全体攻撃の命中判定調査（2026-11-02）

## 結論・出典

- [Piong／神器一覧・奇跡](https://w.atwiki.jp/piong/pages/20.html)：〈閃光〉＝**MP3、25%攻1＋閃光、授かり率0.2%**。
- [まかろん2026神器一覧](https://macarongamemo.com/entry/godfield-artifact)：〈閃光〉＝光属性、**25%全体攻撃**。**ダメージを与えた対象**を閃光状態にする。
- [アニヲタWiki ゴッドフィールド](https://w.atwiki.jp/aniwotawiki/pages/47010.html)：全体攻撃は25/50/75%で、**相手一人一人について個別に命中判定**。同じ乱数結果を全体へ流用してはいけない。
- [Piong／災い一覧](https://w.atwiki.jp/piong/pages/23.html)：暗雲状態は確率全体攻撃が必ず命中、閃光は防御神器1個制限。
- [初心者向けルール](https://godfield-beginner.game-info.wiki/)：暗雲の必中と閃光の防御制限を独立確認。以上は**外部二次資料**であり、現在稼働する本家の実操作検証ではない。

## 今回の実装

- `v2/area-accuracy-research.mjs`：研究専用・副作用なしの `planAreaAccuracyResearchFixture`。2〜9席のFFAで、詠唱者と既に敗北した席を除いた各相手に**独立した25/50/75%判定**を実施。既存 `drawRandom32` を再利用し、固定seedで再現可能。対戦状態（HP、MP、手札、災い）は変更しない。
- `tests/g7-area-accuracy-research-v2.test.mjs`：個別サンプリング、決定性、生存席選別、各確率での単調性、1vs1、異常入力拒否、HP／状態未変更を検証。
- あくまで命中候補を算出する**検証専用の計算器**。正式山札にカード`m019`を追加していない。オンラインルーム、攻撃、防御、反射、補充には**接続していない**。学校版／GitHub Pages／Firebase Security Rules／認証方式には変更なし。

## 検証結果（今回の研究コード）

- Node.js **1,082/1,082成功**：[Actions #41329729074](https://github.com/8mahi8/party-card-replica/actions/runs/41329729074)。今回追加した純粋命中判定の5テストと従来のゲームエンジンの回帰。
- Chromium **28/28成功**：[Actions #41329728983](https://github.com/8mahi8/party-card-replica/actions/runs/41329728983)。
- Playwright WebKit **模擬RTDBオンライン2席310/310＋既存画面339/339成功**：[Actions #41329729077](https://github.com/8mahi8/party-card-replica/actions/runs/41329729077)。
- 対象コードは研究用命中判定モジュールの追加のみ。**今回のWebKit検証は〈閃光〉奇跡を画面から使ったテストではない**（実戦接続未実装）。学校iPad Safari実機・実Firebaseでの今回の動作は未検証。

## 次に必要な検証と実装順

1. 原作の**命中・はずれの確定時点**を確認する。はずれた相手にも防御UIが表示されるか、全員の命中結果をいつ公開するか、同時／順次処理、反射・弾く先が全体ルートへどう戻るか。現状不明のため「ミスでも先に防御カードを消費」といった独自挙動を実装しない。
2. 原作の**チーム戦対象**と**暗雲の必中判定**、消費乱数の順序を確認する。今回のローカルfixtureの座席順サンプリングは**再現性のための仮定**であり、原作の内部RNG順序の証明ではない。
3. 仕様確定後、既存 `staging-room`／`miracle-resolution`／`effect-runner` に段階的に統合する。攻1・光属性の防御計算、ダメージが正の場合にのみ既存 `inflictAffliction('flash')`、MP3・習得・補充の共通キューを再利用。オンライン2席WebKit／実Firebase／学校Safariでそれぞれ試験。
4. 原作の正規山札は未完成（研究カード182種／443参考枠、`complete:false`）。原作の確率抽選を有効化しない。

今回の目的は、今後実装する予定がある全体攻撃の共通部分を**必要最小限で確定**すること。意味のない汎用化や原作未確認の効果拡張はしない。
