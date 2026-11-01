# V2 G3｜カード追加に強いテスト基盤へ整理（2026-10-28）

## 背景と狙い

直近の参考カード台帳追加（85→86→90種類）で、**同じ総数・抽選枠数を9件以上の旧テストに手入力して更新していた**。この重複は追加漏れ、古いエラーメッセージ、CIの反復失敗を誘発し、今後の353種の研究を遅くする。

外部エンジニアリング資料:
- [Martin Fowler, The Practical Test Pyramid](https://www.martinfowler.com/articles/practical-test-pyramid.html) — duplicate test cost と低レイヤでの検証の重要性。
- [Node.js official test runner](https://nodejs.org/api/test.html) — built-in `node:test` でパラメータ・動的ケースを実行できる。追加依存は不要。
- [God Fieldガイド＋α 奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html) — 習得済み奇跡は6つまで、7つ目で最古を忘れる、MP再使用・1ドローを明示。
- [2025年の実際のAPI選択研究](https://note.com/oreapo_note/n/n7791e8e30943) — 「火の玉・流星は先頭で単体奇跡として使用可」「ちからの粉は先頭不可」「粉→オーラ→精霊は合法」。2026年の一般向け解説記事には「火の玉を単独攻撃として扱わない」という**矛盾する説明**があるが、APIを実測した具体的報告を上位根拠とし、変更しない。今後も版差に注意する。

## 今回のコード構造

1. **単一の独立した台帳スナップショット** `tests/helpers/research-catalog-contract.mjs`
   - `RESEARCH_CATALOG_CONTRACT={unique:90,slots:209,complete:false}`。
   - 10件の既存テストがこの1定義を参照。今後原作で証拠の取れた新規カードが増えたら、この値を**1ファイルだけ**改訂すればよい。
   - 期待値をカタログ自体から自動生成してテストを通すことはしない（欠落・誤追加の検出力を失うため）。
   - 完全デッキは元資料353種・500枠だが、これらの数字はゲームの本番抽選を許可する条件ではない。従来の`auditCatalog`が参照分布の独立マトリックスで`complete`を検証する。

2. **カード形状から自動増殖する戦闘契約テスト** `tests/generic-solo-miracle-contract-v2.test.mjs`
   - `family==='miracle'`、`cast`可、攻撃力正、`effects.length===0`の全カードを動的に列挙。
   - 各定義ごとに必ず
     1) 手札使用→MPコスト・学習・攻撃ダメージ（闇なら即死）・固定補充・原状態不変、
     2) 習得済み詠唱→MPコスト・+1ドロー・既存手札保持、
     3) MP不足→コマンド拒否・原状態不変
     の3件を走らせる。
   - `m002,m003,m008,m009,m010,m011` は今回網羅を確認。
   - 7番目の習得で最古の奇跡を忘れる／習得済み再詠唱で順序が変わらない2件を追加。
   - **確率攻撃・状態異常・反射・複合支援などはこの条件から除外**。原作仕様の数値が確定してから個別の効果クラスのcontractを用意する。現時点で推測した共通化はしない。

## 次にカードを追加するとき

1. 本家の行動例・API・動画を優先して原作のルールを確認。出現率は対象バージョンを特定し、出典を資料に記録。
2. 既存の`CardDefinition`・`legacy-adapter`の効果タグで表現できるなら、まず`src/verified-basic-cards.mjs`にデータを追加。カード名を`room-transition`や`effect-runner`にハードコードしない。
3. `tests/helpers/research-catalog-contract.mjs`の`unique`と`slots`を検証済みの追加分だけ更新する。**他の10テストは修正しない**。
4. 汎用ソロ奇跡なら既存の自動テストに乗る。未知の効果だけ個別にgolden testを用意。
5. `node --test`でルール検証し、`node demo/build.mjs`・`node v2/demo/build.mjs`を実行し単体HTMLを同期。`--check`で再生成の再現性をCI確認。
6. 新しいUI操作が必要ならWebKitのタップテストを**1～2件**追加し、テストで表示されたスクリーンショットを目視確認。すでに下位層で済ませた全組合せを全てUI再テストしない。
7. 3系統のGitHub Actions（Node・Chromium・WebKit）が通ったHEADのみPRに記録する。元の`main`とGoogle Sites公開版はユーザーの明示指示があるまで触らない。

## 未実装・既知の限界

- 現状は「90カード／209参照枠」の研究用デッキ。**実戦用ランダム抽選として使用禁止**、現在の固定補充`d001`は開発用。
- 身内1v1オンラインG6、完全カード/確率G7は未実装。
- 「パンチ→ちからの粉→オーラ」の**最終ダメージの直接証拠**がなく、選択合法性が確認されているにもかかわらず計算を未実装。今後の高優先研究項目。
- このPRのテストはLinux Chromium/WebKit。学校iPad Safari実機の検証は別工程。
