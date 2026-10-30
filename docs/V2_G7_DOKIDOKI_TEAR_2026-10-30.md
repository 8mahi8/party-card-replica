# G7｜「ドキドキ涙」50%回復／50%自傷ダメージ（2026-10-30）

## 原作資料と採用値

- [Piong その他神器](https://w.atwiki.jp/piong/pages/19.html)：ドキドキ涙は取得率0.4%、価格¥1、HP+10または10ダメージ（各50%）。
- [GFガイド＋α](https://w.atwiki.jp/gfplusa/pages/18.html)：同じ取得率・価格・2種類の効果。
- [まかろん2026神器表](https://macarongamemo.com/entry/godfield-artifact)：独立した照合資料。原作サーバーでの各分岐の発動順序を直接測定したものではない。

カード定義は `i013`（0.4% = 500分母の2枠）。研究台帳は**163種類・408/500参考枠**、正規353種と500枠の完全抽選には未達。部分カタログは従来どおり `complete:false`。既存アイテムに対する効果を改変しない。

## 実装

- `src/verified-basic-cards.mjs`：カードデータのみ。
- `v2/legacy-adapter.mjs`：`coin_flip_hp` を `onDeclare:flipHpRisk` に変換。`v2/foundation.mjs` が `heal:10,damage:10,healChance:0.5` の型を検証。
- `v2/staging-room.mjs`：既存 `useItem` コマンドで物理インスタンス1枚に限定し、相手の手札・他人の手番や再送衝突を拒否。
- `v2/room-transition.mjs`：権威ホストの `rngSeed` から1回のみ抽選し、回復なら既存 `restoreResource`、ダメージなら既存 `hit` を通す。乱数を別端末で再実行せず、確定した1つの新状態を各席に通知する。HP0時の太陽のお守りと補充は共通の `hit` 処理へ委譲し、死亡時はターンを再開せず勝敗・次プレイヤーへ進む。
- `v2/demo/firebase-online-lab.html`：開発用「ドキドキ涙・運試し」の4枚固定セットと、HP±10（50%）、選択後の両結果表示。従来の研究4セットと原作抽選機能の状態を保持。

## 検証

- `tests/g7-dokidoki-tear-v2.test.mjs`：両分岐を固定seedで試験、同手番攻撃、HP0での勝敗、太陽のお守りによるHP10復活、二重送信・不正な効果パラメータの拒否、手札の非公開。
- `tests/v2-firebase-online-webkit.browser.mjs`：2画面の模擬RTDBと実WebKitタップで、固定seedにおける回復結果・選択UIと両端末のHP同期を検証。
- 今回の実Firebaseオンライン試験と学校iPad Safari実機試験は**まだ実施していない**。以前のG7基本HP/MP回復7種に関する実Firebase成功を、この新カードの成功と混同しない。
- 公式原作での「HP0直後の太陽のお守り」「道具を使用した後の手番継続」「実際の抽選と戦闘優先順」の全組合せは未実測。現状は出典が示す効果と既存V2共通処理の合成であり、この確度を記録して研究範囲に限定する。

## 運用

旧研究版・V2オフライン・V2オンラインの単体HTMLを3種再生成し、開発ブランチへ保存する。学校Google Sitesに貼っているHTML、main、Firebase Security Rulesや認証は変更しない。HTML生成は終了後に手動起動へ戻す。

次はCIの回帰結果を確認したうえで、正規カード台帳の未登録データを効果の有無で分類し、個別特殊効果の再現を続ける。
