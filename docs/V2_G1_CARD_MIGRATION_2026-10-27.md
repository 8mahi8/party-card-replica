# V2 G1：既存68カードのテンプレート移行（2026-10-27）

## 達成したこと

- `v2/legacy-adapter.mjs`：旧カード68種類を `v2/foundation.mjs` の型付きカード定義へ変換する**開発時限定アダプタ**を実装。
- `tests/legacy-adapter-v2.test.mjs`：10件の新しい回帰テスト。GitHubから実コードを取得して同一内容のテストを実行、10/10成功。コンテナのNode.js 22でもこの新テスト10/10成功。
- ローカル検証用ワークツリーで従来ルールテストを含む `npm test` 130/130成功。GitHub Actions全体での成功は未確認。
- 旧カード68種類／抽選重み186枠の数値・ID・属性を保持。**旧版の抽選確率をそのまま本番用に使えるという意味ではない**。
- 変更は `refactor/v2-foundation-review-20261027` 専用。main・検証デモ・学校の公開版には変更なし。

## 新テンプレートへの変換規則

| 旧形式 | V2の種類／使い方 | 追加効果 |
|---|---|---|
| `weapon slot:main` | weapon / mainAttack | 攻防兼用ならdefendも可 |
| `weapon slot:addon` | weapon / addAttack | なし |
| `weapon reaction:reflect/deflect` | weapon / mainAttack + defend | onDefense: redirectAttack(scope:neutralWeapon) |
| `armor guard` | armor / defend | 鬼の装備ならaddAttack＋攻撃補助数値 |
| `armor stopScope:miracle` | armor / defend | onDefense: stopAttack(scope:miracle) |
| `miracle role:attack` | miracle / cast | plusAttackならaddAttackも可 |
| `miracle role:stop` | miracle / defend | onDefense: stopAttack(scope:neutralWeapon) |
| `miracle role:boost_weapon` | miracle / cast | onDeclare: multiplyAttack(factor:2,scope:weapon) |
| `defense_item` | item / defend | stripElement または redirectAttack(scope:any) |
| `support_item` | item / support | onCost: waivePreviousMp |

今後、カードデータを編集する人は基本数値・使用モード・効果IDを登録する。処理順と相互作用は**共通の戦闘エンジン側**で実装する。カードのデータに任意のJSを混ぜる設計にしない。

## 明示的な限界

- これは**形式変換の成功**であり、効果エンジンが完成したことを意味しない。反射や精霊の「実際の発動」は今までのエンジンに依存している。
- 参照名は研究用の旧カードにのみ保存。新規のUI表示用名称や画像の設計は別途必要。
- `summary.complete=false` のまま。353種類の完成や現行原作の確率一致を主張しない。
- 旧データに知らないフィールドが増えた場合は**自動で無視せずエラー**にする。誤ったルールを静かに取り込まないため。
- V2 `createInstance()` は番号の重複を自分で検出しない。G2では一意な通し番号をルーム状態側で管理し、revisionや冪等性を保証する。
- V2のカード分類を抽象化しすぎて、原作固有の細かい選択順を失わないよう、次のG2/G3では合法性コンパイラと効果順序テストを優先する。

## 次の作業とゲート

**G1合格条件**：68種類全数の数値・効果タグ変換、重複ID/未知フィールドを拒否、同種カードを別instanceIdで区別、検証成功。今回これを達成。

**G2（次）**：1つのコマンド受け口、revision付き純粋状態遷移、順序つき選択、合法手チェック、カードinstanceIDの重複なし発行、プレイヤー別の秘密手札view。違反操作が状態に影響しないこと、二重送信が二重適用されないことをテスト。

**G3（その次）**：効果キューを実装し、旧コードの攻撃→防御→反射→補充・奇跡→精霊の複合ケースをV2でも再現。旧コードとの差分が出れば原因を記録し、資料で確認する。

mainへはG3の主要回帰ケースとSafari試験を通した後に段階的マージする。自動テスト合格だけで完全再現や実機で遊べると宣言しない。
