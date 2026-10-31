# G6｜防御画面に相手の宣言済み神器を表示（2026-10-30）

## 原作比較と課題

原作ブラウザ版の防御画面は、攻撃側の使用神器と攻撃力を参照しながら、防具を選ぶか「許す」かを判断できる構成。

参考： [原作画面の説明とスクリーンショット](https://godfield-beginner.game-info.wiki/)、[ゴッドフィールドwiki：攻撃・防御と「許す」](https://w.atwiki.jp/piong/pages/16.html)、[武器の実際の印字値](https://w.atwiki.jp/piong/pages/15.html)。

直前のG6オンラインUIは攻撃元`P1 → P2`だけを表示し、**相手がどの神器で攻撃してきたか/攻撃力がいくつかを防御者が見られない**問題があった。これは防御判断の基本情報が不足するため、優先して修正した。

## 設計と実装

- `v2/staging-room.mjs`に **`declaredAttackFixture(state,catalog)`** を追加し、G6の `partial-reference-v2-lab` **2人戦・phase=defense・pending.type=attack** の時だけ宣言済みの物理神器を公開情報へ投影。
- 投影先は`viewStagingRoom(...).pending.declaredAttack`。内容は`cards:[{definitionId, printedAttack, element}]`と`printedAttackTotal`のみ。攻撃側の**未使用カードのID、手札、内部乱数、処理済みコマンド履歴は含まない**。カードの宣言順は`attackInstanceIds`の順で保持する。
- `v2/demo/firebase-online-lab.html`の防御時の中央表示に、たとえば **「相手の攻撃：ワンダーソード ／ 攻10（記載値）」** を表示。攻撃が終わったら表示は消える。「記載値」は属性・特殊効果・反射・多段攻撃を含む最終ダメージ計算ではない。
- 研究用`wiki-2025-lab`や3人〈蜃気楼〉、夢・反射が絡む未検証の公開タイミングまで勝手に拡張しない。**ゲームルールとダメージ計算には変更なし**。正式な原作ゲーム完全再現ではない。
- ネット通信は変更不要。ホストだけが権威状態を持ち、公開ビューを自席別にFirebaseへ送る既存方式を使う。

## テスト

- `tests/local-room-host-fixture-v2.test.mjs`：BにはAが使った`w016`と攻10が公開される一方、未使用の`w017`や他人の手札自体は公開されず、攻撃処理後に表示が消えることを検証。
- `tests/v2-firebase-online-webkit.browser.mjs`：A攻撃後、Bの画面で「ワンダーソード」「攻10」を読めること、ホストAも同じ公開攻撃を見られること、防御後に消えることを390×430の2画面タップで確認。
- `tests/firebase-online-lab-page-v2.test.mjs`：防御UIは公開された`pending.declaredAttack`だけを使って表示することを構造上チェック。
- ソース変更が共通バンドルに含まれるので、`v2/demo/build.mjs`と`build-online.mjs`の**両方**でオフライン研究版/オンライン版HTMLを生成し、CIで一致確認。開発ブランチへ生成物コミット`b0dd6f2a3f7e80092e892e65d3de2bc8145e14c2`。

## 範囲と次の課題

実Firebaseの基本2人対戦は以前のCIで成功しているが、**今回の攻撃情報表示そのものはまず模擬RTDBとWebKitでの検証**。学校iPadのSafari実機と外部HTTPS公開URL、ホスト再読み込み後の復帰は未検証。

次は学校iPadで実際の防御選択画面が430px程度の高さに収まるか確認し、攻撃情報の見やすさを評価。原作カード全353種と正規500枠の山札、全攻防効果の再現は別工程として続ける。

学校Google Sites上のHTML、GitHub`main`、Firebase Security Rules・認証設定は変更していない。
