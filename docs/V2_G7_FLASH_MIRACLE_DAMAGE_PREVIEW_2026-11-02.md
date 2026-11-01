# G7｜〈閃光〉の命中・光属性防御・災い付与プレビュー（研究専用）

作業日：2026-11-02。対象ブランチ：`refactor/v2-foundation-review-20261027`。

## 原作との照合

- [Piong 奇跡一覧](https://w.atwiki.jp/piong/pages/20.html)、[2026年まかろん神器一覧](https://macarongamemo.com/entry/godfield-artifact)、[2026年 Game Breeze](https://toroccowars.jp/21523/)による〈閃光〉の仕様：**光属性、MP3、25%全体攻撃、攻1、実際にダメージを与えた対象に「閃光」を付与**。
- [アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html)および[初心者向けガイド](https://godfield-beginner.game-info.wiki/)による25/50/75%全体攻撃：各相手に独立した命中判定。
- [Piong ゲーム仕様](https://w.atwiki.jp/piong/pages/16.html)：**光属性攻撃は通常の防具で防げず、虹のカーテンで無属性化した後は通常防御できる**。
- 参考資料は二次資料。本家で直接、命中しなかった相手の防御画面と反射後の再抽選順序を確認した証拠ではない。

## 今回追加した処理

`v2/flash-miracle-research.mjs` の `FLASH_MIRACLE_RESEARCH` は〈閃光〉の検証済みカード数値を定義するが、**正式カタログにはまだ登録しない**。`planFlashMiracleResearchFixture` は既存 `planAreaAccuracyResearchFixture` と `src/rules.mjs` の `calculateHit`／`sumLegalArmor` を再利用する。

- 各生存相手に独立25%命中判定。外れはダメージ0／災いなしとして数値計算を表示。
- 命中後に、事前に指定した**仮想防御**で属性・守備力を計算。防具を使用したとの事実を生成せず、カード消費もしない。
- 防御0なら命中時は攻1相当、HPが残る場合だけ `wouldInflictFlash:true`。虹のカーテン＋守3なら命中してもダメージ0／閃光なし。
- MP3以上の研究用詠唱者だけを受け入れるが、**MP消費・奇跡習得・手札補充・ルーム画面・ターン進行・Firebase書込は一切実行しない**。
- ガードの不正データや無効な対象IDは拒否。研究対象はチーム情報なしの2〜9席FFAに限定。
- `tests/g7-flash-miracle-research-v2.test.mjs` の8テストで、参考定義、命中／外れ、全防御、光防具不可、HP0、対象別乱数、拒否と入力不変を検証。

## 実戦接続で未確定の事項

1. **外れ時の防御UI・防具使用の可否**。今回の「仮想防御」は、原作で外れ時も防御ができることを意味しない。
2. **全体攻撃を受けた各相手の防御・反射・弾きの処理順**、反射先の再命中抽選有無。
3. 暗雲による全体攻撃必中とチーム戦の対象、実際の内部RNG消費順。

確認が取れたら `miracle-resolution`／`room-transition` に最小限で接続し、カードを登録する。現時点で原作不明の動作を勝手に補って試合中に使えるものとして扱わない。

研究用台帳 **182種類／443参考枠、complete:false** を維持。開発ブランチへソースとテストのみ追加し、学校Google SitesのHTML・GitHub main・Firebase Security Rules・認証を変更しない。

## 実測テスト

CI完了後にGitHub Actions runと合否を最新の引き継ぎ資料へ記録する。GitHub Actionsのブラウザ回帰テストは今回の〈閃光〉奇跡をプレイした実機テスト**ではない**。
