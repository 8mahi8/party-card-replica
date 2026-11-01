# V2 G3｜4属性の単体攻撃奇跡をテンプレートで追加（2026-10-28）

## 原作資料

- [ゴッドフィールドwiki：奇跡一覧](https://w.atwiki.jp/piong/pages/20.html) — 炎・大木・岩・滝の各攻、属性、MP、0.2%。
- [God Fieldガイド＋α：奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html) — 同じ4種の数値、習得後再使用と使用時の手札増加、精霊の直前奇跡のみ割引。
- [2026年の神器一覧](https://macarongamemo.com/entry/godfield-artifact) — 数値と属性の独立照合。
- すべて第三者情報。**原作のAPIや手動対戦での直接検証は未実施**。バージョン差があり得る。

## 追加したカード（V2研究用台帳のみ）

| ID | 奇跡 | 属性 | 攻撃力 | MP | 参照抽選率 |
|---|---|---|---:|---:|---:|
| m008 | 炎 | 火 | 10 | 5 | 0.2% |
| m009 | 大木 | 木 | 6 | 3 | 0.2% |
| m010 | 岩 | 土 | 8 | 4 | 0.2% |
| m011 | 滝 | 水 | 25 | 12 | 0.2% |

価格は0、重み1（参考500枠中1）。**90種／209枠の部分サンプル**であり、353種・500枠の本番分布が完成したわけではない。絶対に実戦デッキ抽選に流用しない。

## 実装方法と設計目的

- `src/verified-basic-cards.mjs` の `role:'attack'` データを**4レコード追加しただけ**。カードIDによる戦闘分岐は増やしていない。
- `v2/legacy-adapter.mjs` は既存の `CardDefinition`（family miracle／playModes cast／stats attack・mpCost）へ変換。
- `v2/miracle-resolution.mjs` 既存共通ソロ奇跡コンパイラが、攻・属性・MP・習得・同奇跡再詠唱・直後の精霊割引・防具・ダメージを扱う。
- `v2/room-transition.mjs` と `v2/effect-runner.mjs` に固有ロジック追加なし。
- UIはラベル生成・選択処理を自動で引き継ぐ。カード名は研究用の参照名。商用の原作素材や絵を転用していない。
- `demo/standalone.html` と `v2/demo/standalone.html` はソース由来のビルドとして再生成。
- 研究用既存テストの台帳スナップショット（90種／209枠）を更新。デッキ未完成状態 `complete:false` を維持。

## 検証

- `tests/four-element-solo-miracles-v2.test.mjs`：各カードの参照値、手札から使用後のMP/HP/learn/refill、習得済み奇跡の再使用と+1ドロー、MP不足での完全ロールバックを検証。加えて滝→精霊のMP0使用、粉との未確認コンボの拒否、ホットシート画面表示を検証。
- `tests/v2-webkit-smoke.browser.mjs`：固定高さ iframe で **炎→水盾でHP33／MP5**、**滝→精霊→無防御でHP15／MP10** の実タップシナリオを追加。画面証拠を CI artifact に保存する。
- 最終的な総テスト数、Chrome/WebKitの成否はPRにGitHub Actionsログとともに追記。

## 未確認事項と次の作業

「武器→ちからの粉→オーラ→精霊」は原作API研究で**選択可能**と確認されるが、最終攻撃の数値・演算順を記録した直接資料は見つかっていない。推測で乗算順序を定義しない。

次はG3で未確認の原作選択順と演算優先度を**具体的な戦闘ログ・動画・実操作**から確認。G4では確認済みの原作挙動をゴールデンテスト化、G6はオンライン接続、G7は全カード・抽選プールの網羅。

GitHubの **Draft PR #1** の開発ブランチのみ変更する。`main`、学校Google Sites公開版は無変更。WebKitはLinux上の自動試験であり実機iPad Safariではない。
