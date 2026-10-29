# ゴッドフィールド再現ゲーム｜開発担当AI 引き継ぎ【最新・入口固定】

**最終更新：2026年10月30日（日本時間）**  
**ユーザーが新しいチャットで「ゴッドフィールドの開発引き継いで」とだけ言ったら、この文書から開発を再開する。** チャットの過去ログや古いREADMEを読めない状態でも、このファイル・GitHubのコード・CI・資料で引き継げるようにしている。

> **この文書は引き継ぎ入口であり、実装の真実は常に開発ブランチの最新コードとGitHub Actions。** コミットSHA・テスト件数・カード数は作業のたびに変わる。本文の日付や数値を確認せず永久に正しいと扱わないこと。

## 2026-10-30 最新実装：G3/G7 HP吸収の共通エンジン

**作業の入口をここに更新（この節が2026-10-29の旧スナップショットより新しい）。**

- 実コード：`v2/foundation.mjs`の型付き`afterHit/absorbHp`、`v2/legacy-adapter.mjs`、`v2/ordered-attack.mjs`、`v2/basic-resolution.mjs`、`v2/effect-runner.mjs`に共通のHP吸収を接続。命中後のHPを回復し、反射／弾きで変わった**現在の攻撃元**だけが吸収。自己吸収で一瞬HP0になってもお守りは使わない。
- 原作資料を照合した`w048`**ゴーストソード（攻7）**、`w049`**リアルゴーストソード（攻12）**を追加。**部分研究台帳は118種類／307参考枠**に拡張。全353種類／500枠の正規山札ではない。
- [原作資料・処理順・制限・テスト](docs/V2_G3_G7_ABSORB_HP_2026-10-30.md)。二次資料のHP1→自己攻12→HP12、HP99上限、防具での軽減、反射の攻撃元、オーバーキルを根拠としている。現行2026年本家の直接プレイ検証ではない。
- 新規`tests/lifesteal-weapon-v2.test.mjs`**14件**。従来の境界契約12件も維持。**Node 790/790 PASS**（実コードHEAD`8081881902`、run`40904084895`）、**Chromium 28/28 PASS**（run`40904085019`）、**WebKit 295/295 PASS**（run`40904085055`）。両単体HTMLを再生成し、V2は**30モジュール**。Google Sites本番・iPad実機試験ではない。
- `tests/v2-webkit-smoke.browser.mjs`に**新カードのタップ操作8チェック**を追加（命中・防具・反射の390×430固定iframe）。実コードHEAD `6f2930e01214830f5d610480e9c92a8722996812` のCIで **Node 790/790**（run 40904686686）・**Chromium 28/28**（run 40904686835）・**WebKit 303/303**（run 40904686620）の全成功を確認。画面試験はLinuxブラウザで学校のiPad実機ではない。後続の文書のみのコミットのHEADは必要なら改めてCIを確認する。
- **今後のG3/G7**：新WebKit追加8件のCI→吸収奇跡と物理＋奇跡の処理順→2回攻撃の複数命中キュー→災い状態機械→カード全体。**他人への致死吸収＋太陽のお守りの処理順は未確認のため拒否継続。** 自己吸収とは別。
- 既存G4（取引／夢）とG6（無料オンライン）の未完成範囲は維持。main・学校Google Sitesは変更禁止、Draft PR #1継続。学校iPad試験前に研究用ホットシートを公開用と呼ばない。

## 2026-10-30 引き継ぎ後の最新差分：G3/G7命中境界契約

- 今回のGitHub開発branch更新：`v2/hit-outcome-boundary.mjs`、`tests/hit-outcome-boundary-v2.test.mjs`（**新規12ケース**）、[設計・出典・未解決事項](docs/V2_G3_G7_POST_HIT_EFFECT_BOUNDARY_2026-10-30.md)。
- **重要：これは純関数の境界レビューであり、HP吸収・複数回攻撃・災い付与の実カードをプレイできる状態にはまだしていない。** 116種類/305参考枠、29モジュールの研究用単体HTML、同端末ホットシートという基本状態は不変。
- `damage`と実際の`hpLost`を分離し、0ダメージ、通常命中、オーバーキル、闇の即死、HP0後の復活を区別。無効なHP算術や壊れた入力は拒否。既存の`effect-runner`には未配線なので公開/研究画面の挙動を変更しない。
- 次は**原作の特殊ケースの出典照合→物理カードIDと最終命中イベントを紐付けた一度きりの`afterHit`キュー実装→最小のHP吸収カード→反射・復活・再送の回帰→二回攻撃→災い状態機械**の順。単純なダメージ2倍、0ダメージで災い付与、オーバーキルを無検証のままHP回復量に流用する実装は禁止。
- 2026-10-30の最初の実装コミット：`5165a3ec67dc2ffdbd15da1bc71b239376b9569a`、テスト追加：`72f4d08a237fc722556010c536a9161a0ec7a072`、設計資料：`28d94d3a0d6a59ab86c39b18a1b09bcb555b8f73`。**新HEADのNode/Chrome/WebKit結果はActionsで別途確認すること**。下に記載の764/28/295は2026-10-29検証済みの旧スナップショットであり新HEADの実測と混同しない。
- main/学校Google Sites公開版は未変更、PR #1はDraft。学校iPad Safari・オンライン試験は未実施。

## 0. GitHub上の唯一の入口と最初の操作

- **Repository**：https://github.com/8mahi8/party-card-replica
- **開発branch**：`refactor/v2-foundation-review-20261027`
- **Draft PR #1**：https://github.com/8mahi8/party-card-replica/pull/1
- **固定引き継ぎURL（必ず branch を指定する）**：
  https://github.com/8mahi8/party-card-replica/blob/refactor/v2-foundation-review-20261027/HANDOFF_LATEST.md
- PRは **Draft** のまま、base は **main**。**mainと学校のGoogle Sites公開版は本人の明示許可なく絶対に変更しない**。作業は上記既存開発branchにコミットする。
- 引き継ぎ確認時は **(1) このファイル (2) PR #1の最新HEADと最新コメント (3) src/v2/tests/docsの実ファイル (4) HEADのGitHub Actions** を順番に確認する。古いREADMEの「77種類」「318件」などは**当時の履歴**であり、最新版ではない。
- 当面の作業は独立した原作再現 **V2エンジン／研究用ホットシート**。旧`src/match.mjs`や`demo/`は参考・互換維持用。旧デモと新V2を無計画に結合しない。
- ユーザーの「任した／任せた」は**資料調査→設計→実装→テスト→レビュー→GitHub開発branchへ保存**の自律進行許可。細かな許可は毎回尋ねない。**公開版変更は別途明示許可が必要**。

## 1. 最重要の完成目標と非目標

- **目標**：学校のiPad（Safari）で友達と遊べる、原作『ゴッドフィールド』の対人戦を可能な限り**忠実に再現**した、無料のブラウザゲーム。まず原作の挙動を再現し、勝手なゲームバランス調整や独自ルールを入れない。
- UIはiPadの短い埋め込み枠でもカード選択・確認・防御が少ないタップでできること。ゲーム中に音声は不要。
- **学校配布方式**：Google Sitesへ**単体HTML/CSS/JSのコードを直接貼る**。GitHub Pagesを学校用の埋め込み方式と混同しない。公開版は今も未更新。
- 現在の`v2/demo/standalone.html`は**同じ端末でP1/P2が交代**する検証版。**2台オンライン1vs1、本家全カード、原作出現率、BOT、原作クライアントそのものの動作証明、学校iPad実機検証は未完成**。完成と称しない。
- 学校iPadでの外部認証や通信方式を決めつけない。オンライン化するときは過去の学校での匿名認証問題を考慮し、接続方式・真正性・相手の手札秘匿・再送対策を分けて設計する。

## 2. 引き継ぎ時点の検証済みスナップショット

**実装コードの検証済みHEAD（この引き継ぎ文作成前）**：`cfa20f39a698894594ac8158c235cd76658bd348`

| 項目 | 2026-10-29確認結果 |
| --- | --- |
| 参照済み研究用カード | **116種類**（以前の94種類に通常16＋追加6を登録） |
| 研究表ウェイト合計 | **305/500参考枠**。353種類／500枠は別版の参照分布であり、未達 |
| Node Rules Lab（GitHub Actions） | **764/764 PASS**、run **40887491871** |
| Chromium 実ブラウザ | **28/28 PASS**、run **40887491875** |
| Playwright WebKit 実タップ | **295/295 PASS**、run **40887491901** |
| V2単体HTML | **29モジュール**、チェックインした`v2/demo/standalone.html`とビルダー出力が一致 |
| 学校iPad Safari・Google Sites実ページ・2台オンライン | **未検証／未実装** |
| mainと学校公開版 | **変更なし** |

**注意**：この引き継ぎファイル自体やREADMEのコミットでPR HEADが変わる。**コードのテストを証明したSHAは上記**。新しいAIは必ず最新HEADのCIを確認し、資料更新後のCIも必要に応じて確認する。

### 実行・確認

```sh
npm test
node v2/demo/build.mjs --check
# 必要ならデモ再生成
node v2/demo/build.mjs
# 実ブラウザ・WebKitは専用GitHub Actionsのrunと証拠画像を確認
```

実ブラウザはデスクトップLinux上の Chromium／Playwright WebKit、**1024×460と390×430の固定iframe**等を使用。**iOS Safari・Google Sitesそのものではない**。画面検証は実際のスクリーンショットも目で見て、ボタン重なり・文字潰れ・エラー表示を評価する。

## 3. まず確認すべき実コードと証拠

| ファイル | 役割 |
| --- | --- |
| [src/verified-basic-cards.mjs](src/verified-basic-cards.mjs) | **116種類の部分研究カード**。名前・攻・守・価格・属性・参考重み。正規山札ではない |
| [tests/helpers/research-catalog-contract.mjs](tests/helpers/research-catalog-contract.mjs) | 部分台帳の独立スナップショット **116種類/305参考枠** |
| [src/catalog-audit.mjs](src/catalog-audit.mjs) | 原作参照版の353種／500枠／カテゴリ・属性別マトリクス監査。部分山札からの**本番抽選を拒否** |
| [v2/foundation.mjs](v2/foundation.mjs) | 凍結されたカード定義、真の物理カード個体ID、効果タグ、決定的PRNG |
| [v2/legacy-adapter.mjs](v2/legacy-adapter.mjs) | 旧カードデータから共通V2定義へ移行。新カードは既存factory/アダプタを再利用 |
| [v2/staging-room.mjs](v2/staging-room.mjs) | ターン、攻撃・防御・売買、seat認証、revision、手札のプレイヤー別投影 |
| [v2/room-transition.mjs](v2/room-transition.mjs) | 原子的な操作受付→解決への共通入口 |
| [v2/effect-runner.mjs](v2/effect-runner.mjs) | ダメージ、消費、復活、補充、移動、手番前進をイベントキューとして解決 |
| [v2/ordered-attack.mjs](v2/ordered-attack.mjs)、[v2/basic-resolution.mjs](v2/basic-resolution.mjs) | 選択順、攻・防のルール、複数枚処理 |
| [v2/dream-appearance.mjs](v2/dream-appearance.mjs) | **夢の見た目と本物のカードの分離**、本物の所有権・相手への秘密維持、売買時の真偽確定 |
| [v2/dream-candidate-audit.mjs](v2/dream-candidate-audit.mjs) | 原作で明記された夢の免疫例外と研究用の保守的グループ。**確率抽選はしない** |
| [v2/zero-hp-recovery.mjs](v2/zero-hp-recovery.mjs) | HP0時の太陽のお守りによる自動復活の一部 |
| [v2/trade-self-sale.mjs](v2/trade-self-sale.mjs)、[v2/staged-sale.mjs](v2/staged-sale.mjs)、[v2/staged-buy.mjs](v2/staged-buy.mjs) | 「売る／自分に売る／買う／両替」の研究版処理・不明な致死処理のガード |
| [v2/lab-controller.mjs](v2/lab-controller.mjs)、[v2/lab-ui.mjs](v2/lab-ui.mjs) | 研究用ホットシートの状態とタップUI |
| [v2/demo/template.html](v2/demo/template.html)、[v2/demo/build.mjs](v2/demo/build.mjs)、[v2/demo/standalone.html](v2/demo/standalone.html) | Google Sites型の短いiframeでも動く外部依存なしの研究用単体HTML。**学校公開用ではない** |
| [tests/v2-webkit-smoke.browser.mjs](tests/v2-webkit-smoke.browser.mjs)／[tests/v2-browser-smoke.browser.mjs](tests/v2-browser-smoke.browser.mjs) | WebKit実タップ／Chromiumクリック、スクリーンショット証拠 |
| [docs/SOURCE_LEDGER.md](docs/SOURCE_LEDGER.md) | 研究時に裏付けた外部資料、**撤回した主張、未確認の仕様**。採用前に必読 |

## 4. ロードマップと実際の現在地

- **G1カード定義**：部分台帳の共通定義とレガシー移行、出典監査済み。**116種／305参考枠にとどまる**。
- **G2共通状態・秘密・認証済みコマンド**：card instance ID、revision、command ID、プレイヤー別手札投影を研究用に整備。オンラインの本番サーバー認証は未完成。
- **G3通常戦闘／奇跡／効果共通化**：攻撃・防御・追加武器・属性、壁／氷／闇／オーラ／火の玉／流星／乱気流など、スカイ・月光・エンゼル、虹・精霊、反射・弾く、選択順とMP/補充を**確認済みの組み合わせに限定して**実装。全カードの特殊効果は未実装。
- **G4売買・特殊状態**：売る／自分に売る、買うの反射なし取引、両替、HP0のお守り、夢の見た目と真のカードの分離・売買移動・免疫候補監査が**研究版で進行中**。正規夢抽選や全災いではない。
- **G5研究用タッチUI**：同端末ホットシート、短いembed内の独立手札スクロール、重ならない確定ボタン、操作エラー表示を実装。**学校公開不可の研究画面**。
- **G6無料オンライン1vs1**：**未実装**。部屋、サーバー権威、プレイヤー識別、匿名認証を要するか、通信断・再送・revision同期、手札秘匿が必要。
- **G7全カード・正規出現率**：**未完成**。全353種・500枠は照合対象の参照版であり、2026現行版と常に同一と仮定しない。部分台帳を**正規抽選・夢の50%偽表示抽選へ流用しない**。

### 直近で完了した作業：特殊効果なし武器22種

- **資料**：[V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md](docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md)
- [Piong 2026-03-18](https://w.atwiki.jp/piong/pages/15.html) と [GFGA 2024-06-17](https://w.atwiki.jp/gfplusa/pages/18.html) の2資料の**攻・価格・属性・参考重みが一致するものだけ**を登録。
- **通常武器16種**：`w032-w047`、**追加武器6種**：`a016-a021`。
- 専用の名前判定を作らず、共通の`main`／`add` factory と既存攻撃エンジンにデータ追加。22カード個別の確認、追加武器の複合攻撃、部分デッキの抽選拒否、WebKitタップも検証。
- 研究台帳は`94/270 → 116/305`へ。**Node 764/764、Chromium 28/28、WebKit 295/295合格**。
- **未採用**：HP吸収、複数回攻撃、災い付与、MP比例攻撃など本体効果が未実装のカード。原作と異なる「数値だけ武器」に落とすのは禁止。
- **資料の相違**：`木刀／竹ヤリ`、`エンゼルナイフ攻11／攻9`など。証拠なしに片方へ上書きしない。

## 5. 次に開発担当が行うべき具体的タスク

**現在のボトルネックは「数値だけで表せない特殊効果の共通処理」であり、G7の数値武器を機械的に増やすだけでは本家には近づかない。次はその基盤を優先。**

1. **G7/G3共通「命中後効果」の設計レビュー**：既存の`v2/effect-runner.mjs`、`v2/basic-resolution.mjs`、`v2/ordered-attack.mjs`、`v2/foundation.mjs`、`v2/room-transition.mjs`、関連テストを読んで、カード個体消費・防御・反射・命中・HP0・復活・補充の**1回だけ実行される境界**を確認する。設計文書を残す。
2. **外部資料で1種類ずつ効果を照合**：HP吸収（ゴーストソード系）、複数回攻撃（のこぶんぶん）、災い付与（地獄のハサミ等）を候補とする。ただし**正確な処理順と例外が不明ならすぐゲームロジックへ組み込まない**。
3. **名前分岐ではなくデータ駆動の効果**：`onHit`／`afterHit`等の型付き効果、結果イベント、再入時に二重発動しないための制約を設計。まず原作で裏付けた限定ケースと安全な架空fixtureで自動テストを作る。新しい共通カード定義へ効果タグを追加してから実カードを収録する。
4. **既存処理の回帰**：通常武器＋追加武器、属性、反射・弾く、奇跡、スーパーミラー、太陽のお守り、夢のprivate見た目、18枚押し出し、同時リクエストとrevisionを壊さない。可能な限り**同コスト帯以外も含む戦闘ケース**で確認。
5. **UI/CI検証**：研究画面を壊さず、必要なら`node v2/demo/build.mjs`で単体HTMLを再生成。Node/Chromium/WebKitの**新HEADの実測結果**とスクリーンショットを確認し、資料とPRへ保存する。
6. **並行して残カード調査**：特殊効果のない数値カードを追加する場合も、出典と版差を記録。部分台帳のsnapshotと夢の監査テストを更新。**500枠を埋めるために不明値を作らない**。
7. **G4の未解決難所は保留を維持**：致死「売る」時の売り手入金額・HP0復活・商品移動・補充順、「買う」へのスーパーミラー反射の最終処理、夢の正規抽選と治療、特殊防御複合優先順位。第三者資料の矛盾・未確認を都合よく確定しない。

### 手を出さないこと

- 本人の許可なしに**mainへpush/PRマージ、学校Google Sites配布HTMLの更新、学校公開の切替**をしない。
- 研究用の`fixtureDrawDefinitionId:'d001'`（革の帽子固定補充）を正規抽選だと表示しない。
- UI試験用の暗黙のセキュリティをオンラインの本人認証とみなさない。
- 資料にない仕様・数値・「本家を実際に操作した」などの証拠を作らない。
- 原作画像・ロゴ等の流用を避ける。再現するのは**ゲームルール**で、配布用の見た目は独自素材。

## 6. 次のAIの実務手順と報告形式

ユーザーが新チャットで**「ゴッドフィールドの開発引き継いで」**と言ったら、次の行動を順に実施し、そのまま新しい開発に進む。

1. GitHubコネクタから`8mahi8/party-card-replica`の**Draft PR #1と開発branch HEAD**を取得し、この`HANDOFF_LATEST.md`を読む。チャットの古い記憶よりGitHub実ファイルを優先。
2. `docs/SOURCE_LEDGER.md`、最新の`docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md`、`docs/V2_G4_DREAM_CANDIDATE_CLASSIFICATION_2026-10-29.md`、`docs/ARCHITECTURE_V2_PLAN_2026-10-27.md`、CIと未確認仕様を確認。
3. **何をしたか、どこまでできているか、次に何をするか**をユーザーに簡潔に説明。古いREADMEの過去の成功件数に惑わされない。
4. 原作の外部資料とコードの両方を確認し、**実装→テスト→GitHub開発branchへ保存**まで実施。ユーザーの「任した」に対して毎回設計確認を要求しない。
5. 最後に現在のロードマップ上の工程、今回の差分、テストの**正確な数値と成功／失敗**、コミットSHA、次工程を報告。学校実機確認は行われていなければ未実施と明記する。
6. 作業の終わりに**このファイルを必要に応じて最新版に更新**。GitHubのREADME冒頭とPR #1からここへのリンクは維持する。過去の長大なチャットがなくても次の担当へ引き継がせる。

### すぐ参照する正規リンク

- [GitHub repository](https://github.com/8mahi8/party-card-replica)
- [Draft PR #1](https://github.com/8mahi8/party-card-replica/pull/1)
- [最新の原作調査・採否一覧](docs/SOURCE_LEDGER.md)
- [直近22武器の実装・資料差異](docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md)
- [夢の分類と免疫例外](docs/V2_G4_DREAM_CANDIDATE_CLASSIFICATION_2026-10-29.md)
- [初期V2アーキテクチャ](docs/ARCHITECTURE_V2_PLAN_2026-10-27.md)
- [旧いロードマップ（**日付・数量は古い**）](docs/NEXT_STEPS.md)

**以後の恒久ルール：この固定ファイルを最新版に更新し続ける。古い handoff 名の増殖やチャット依存の引き継ぎはしない。**
