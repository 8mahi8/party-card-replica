# G7｜原作に寄せたカード研究をオンライン対戦で試すための固定手札セット

2026-10-30｜開発ブランチ `refactor/v2-foundation-review-20261027`

## 問題と今回の判断

G6ではルーム作成時の手札がA/Bそれぞれ固定4枚で、G7で新しく照合した闇属性の武器や通常防具を研究台帳に登録しても、**オンライン試遊画面から実際に使う方法がなかった**。

本家には353種類・500枠の神器があるとされ、各回に復元抽選する方式。しかし現行の研究台帳は155種類・357参考枠にすぎず、既存の`src/catalog-audit.mjs`も`complete:false`。未完成のカタログからランダムに抽選しても原作確率を再現できない。

そこでゲームルール、Firebase接続、権威ホスト、カード分布を変更せず、**原作データの研究に使う明示的な固定手札セットを3種類**作った。新しいセレクターは部屋を作る人だけが操作する。選択は部屋の作成時に一度確定し、ゲストは選択せずに参加する。これは原作ルールの改変ではなく、完成前の実装/試験を進める開発限定機能。

## 実装

`v2/demo/firebase-online-lab.html` に `LAB_PRESETS`を宣言し、既存の`createStagingRoom`で選択した両席のカードを配る。デフォルトは従来の固定4枚と完全に同一。ルームに接続する前に各IDが現在の共通カタログに存在することを確認。

| 試遊セット | A（先手） | B（後手） | 狙い |
|---|---|---|---|
| 基本対戦 | ワンダーソード／革の帽子／氷／アイアンガントレット | 反射剣／アイアンガントレット／壁／革の帽子 | 前G6と同じ操作・通信の回帰 |
| 属性防御 | たいまつ／つらら／フレイムシールド／アイスアーマー | つらら／たいまつ／アイスアーマー／フレイムシールド | 火と水の攻防、属性防具の実操作 |
| 闇属性と高防御 | コブラ／死神のカマ／はがねのよろい／コアプロテクター | さよならの剣／キラーフォーク／はがねのよろい／コアプロテクター | 闇の即死と防具による無効化 |

すべて`partial-reference-v2-lab`の研究用4枚、ドローは従来の固定`d001`補充で変更なし。カードはすでに`src/verified-basic-cards.mjs`とV2共通エンジンに登録されている。新しい属性/効果ルールは追加しない。セレクターには「**原作の山札ではありません**」と明記。

### 原作資料の確認

- [Piong・単体武器（2026-03-18）](https://w.atwiki.jp/piong/pages/15.html)：たいまつ、つらら、コブラ、さよならの剣、キラーフォーク、死神のカマ
- [GFGA・武器／防具と原作操作](https://w.atwiki.jp/gfplusa/pages/18.html)：通常防御、火・水の防具
- [まかろん・神器一覧（2026-02-28）](https://macarongamemo.com/entry/godfield-artifact)：上記数値・属性の二次照合

注：これらは二次資料であり、原作クライアントの2026-10-30現在の実測値ではない。資料間で意見の異なる**旧石器ジャベリンの参照価格（Piong/GFGA: ¥4、まかろん: ¥10）**、木刀／竹ヤリの旧版表示は今回変更しない。今後個別の資料の正しさを確認してから調整する。

## 自動テスト

- `tests/g7-online-loadout-presets-v2.test.mjs`：3セットの選択肢、全定義ID存在、各4枚、相手手札の非公開、基本セットの同一性、`complete:false`を確認。
- `tests/v2-firebase-online-webkit.browser.mjs`：既存の基本対戦（紛失ack再送含む）に加え、`390×430`の2画面WebKitで属性セット/闇セットをルーム作成から各1回プレイ。Aの攻撃をBが専用防具で防ぎ、BのHP40が維持されること、横スクロールや画面幅の溢れがないことを確認。
- 従来のNode、Chromium、WebKit回帰も継続。
- 生成物：`node v2/demo/build-online.mjs`で`v2/demo/firebase-online-standalone.html`を開発ブランチに更新。GitHub Pages公開・学校のGoogle Sites版への反映はしていない。

## 次の改善

実機iPad2台で**研究用セットの切替→5桁コードで参加→攻防タップ→HP同期**を試してから、原作の正式カード効果・通常配布山札への道を進める。完全な353種類/500枠のデータ・効果監査が完了するまでは、本家確率の抽選は導入しない。1度の試合で任意の155種をすべて試せる自由デッキ編集は作らず、実際に検証する組み合わせに絞ってシンプルさを優先。

**未検証**：学校のiPad実機、最新UIでの実Firebase双方向通信（G6の旧基本手札での成功は別途あり）、GitHub Pages HTTPS公開。学校Google Sites埋め込みHTML、`main`、Firebase Security Rules・認証は変更しない。

## 最終CI・配布状態（確定）

- Node（研究データ、共通エンジン、オンライン手札設定など）**923/923 PASS**：[GitHub Actions run 41038901304](https://github.com/8mahi8/party-card-replica/actions/runs/41038901304)。
- Chromium **28/28 PASS**：[run 41038901206](https://github.com/8mahi8/party-card-replica/actions/runs/41038901206)。
- Playwright WebKit 既存UI **339/339 PASS**＋オンライン2画面 **41/41 PASS**：[run 41038901697](https://github.com/8mahi8/party-card-replica/actions/runs/41038901697)。今回追加の2種類の固定手札では、双方の部屋参加、神器の表示、攻撃宣言、カード防御によるHP40維持を確認。
- **最新版単体HTML**：`v2/demo/firebase-online-standalone.html` は開発ブランチ上で再生成・コミット（`cd47c485f552be6dc40accb8f4598b99b776c059`）。[配布ZIP artifact](https://github.com/8mahi8/party-card-replica/actions/runs/41038901697/artifacts/12969371993)。ビルドは1回だけ実施し、通常のPR更新で配布ZIPやFirebase書込が連続しないようworkflowを`workflow_dispatch`へ戻した。
- 先行のNode実行は旧HTMLを参照して`checked-in online single HTML`の一致検査のみ失敗（その他922/922成功）。再生成後の正式結果が上記923/923。
- **未検証**：新しい2種類のセットを**本物のFirebase**で使用した2台実機、学校iPadのSafari、Google Sites直接埋め込みでの操作、画面キャプチャの開発者による目視評価。CIの模擬RTDBと実機環境を混同しない。
