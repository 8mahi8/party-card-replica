# G7｜奇跡〈泉〉・〈財宝〉／資源回復と習得再使用

2026-10-31、開発ブランチ `refactor/v2-foundation-review-20261027`。

## 原作照合
- [Piong原作奇跡一覧](https://w.atwiki.jp/piong/pages/20.html)（ページ本文は2021年の更新日を表示）：〈泉〉MP7→HP+10、〈財宝〉MP5→所持金+10、いずれも0.2%（1/500）。使用した奇跡を習得し、以後MPがあれば再利用可能。唱えると1枚補充。
- [GFGA奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)（2024年）：同じMP/資源値・1/500。
- [Game Breeze 2026-09奇跡解説](https://toroccowars.jp/21523/)：上記と整合。
- [Piongタイマン攻略](https://w.atwiki.jp/piong/pages/21.html)：〈泉〉は旧MP6からMP7に変更されたと記録。〈財宝〉はMP5で¥10を得る。

**今回の研究範囲**：1vs1で使用者自身に使う資源奇跡を実装。「相手/味方へ使った場合」の原作操作と防御順は未確認なので今回の研究版では他者ターゲットを明示拒否する。自分への使用に防御機会は設けない。他の攻撃と同じく自分の攻撃手番を終える実装は、現行原作の画面録画から逐語確認したわけではない。

## 実装
- `src/verified-basic-cards.mjs`：`m015`〈泉〉・`m016`〈財宝〉、無属性・MP7/5・回復10・参考枠各1。カード名別分岐ではなく`role:'resource'`＋`resourceGain:'hp'|'money'`の定義。
- `v2/legacy-adapter.mjs`：必要な効果データの検証を経て、既存の`onDeclare:restoreResource`へ型付き変換。
- `v2/foundation.mjs`・`v2/effect-runner.mjs`：既存のHP/MP共通回復を所持金にも拡張。資源は99を上限とする研究版の既存制限に従う。MP支払い→習得→所持資源回復→固定補充→手番交代の既存キューを再利用。
- `v2/staging-room.mjs`・`v2/miracle-resolution.mjs`：0攻撃である資源奇跡の物理カード・習得済みからの単独使用と、直後の精霊によるMP免除を認める。他者へ向けたコマンドは既存revisionを進めず拒否。非資源奇跡と同じMP不足チェックを維持。
- `v2/demo/firebase-online-lab.html`：研究手札`resourceMiracles`追加（19セット）。資源奇跡を選ぶと「奇跡を使う」、HP/¥+10とMPコストを表示し、使用者自身へのコマンドを送信。習得済み奇跡の横スクロール位置が選択ごとの再描画で戻らないよう調整。
- `tests/helpers/research-catalog-contract.mjs`：部分台帳の集計は **176種類・437/500参考枠**、`complete:false`。正規の確率抽選は引き続き使用禁止。

## 回帰
- `tests/g7-resource-miracles-v2.test.mjs`：2カードの定義・MP・攻撃0・原作参考入手率、初回使用、習得後の再使用、精霊でMP免除、MP不足、他者ターゲットの拒否、資源99での打ち止め、相手手札非公開を検査。
- `tests/g7-online-loadout-presets-v2.test.mjs`：新しい19番目の研究セットの4枚が存在することを検査。
- `tests/v2-firebase-online-webkit.browser.mjs`：Playwright WebKit 2タブ模擬RTDB上で、両奇跡それぞれを使う→相手が攻撃→習得済みをもう一度使うタップ試験。横スクロール位置の回帰も追加。
- 単体HTML3本は既存ビルダーで再生成。**GitHub Actions全成功**：Node **1041/1041 PASS** [run 41170214530](https://github.com/8mahi8/party-card-replica/actions/runs/41170214530)、Chromium **PASS** [run 41170214548](https://github.com/8mahi8/party-card-replica/actions/runs/41170214548)、WebKit **オンライン2席275/275 PASS＋既存画面339/339 PASS** [run 41170214532](https://github.com/8mahi8/party-card-replica/actions/runs/41170214532)。

## 正規山札へ進む前のデータ検証課題
Piong wiki [ゲーム仕様](https://w.atwiki.jp/piong/pages/16.html)は「**500枠・353種類**」と記載する。しかし現在の研究用台帳は176種類で437枠を消費し、**あと63枠の中に少なくとも177種類を追加することは数学的にできない**。現在の参考出現率、総種類数、参照する原作の版の少なくとも一部に齟齬がある。2024年の[別プレイヤー研究](https://note.com/penspin_act/n/n0bde7586d68e)では237枚という異なる数字も見つかるが、こちらも完全な一次証拠ではない。**353を勝手に237へ変更することはしない**。各資料の年代とカード別の重み・カテゴリ分布を改めて監査し、実際の原作に合うデータセットを確定するまで、ランダム山札を公開用に有効化しない。

## 未検証
学校iPad実機 Safari／学校Google Sites直貼り／今回の新奇跡の実Firebaseは未検証。原作の未確認特殊防御や資源奇跡の他者指定は未完成として扱う。学校版HTML、main、Firebase Security Rulesは変更していない。
