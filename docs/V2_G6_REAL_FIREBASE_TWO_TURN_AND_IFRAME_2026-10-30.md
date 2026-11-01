# G6｜最新版の実Firebase 2往復対戦とGoogle Sites埋め込みの準備（2026-10-30）

## 目的・位置付け

G6では最初の実Firebase対戦を以前に試していたが、当時のテスト`tests/v2-g6-live-firebase.browser.mjs`は旧UIの文言で停止する構成だった。原作風HUDと防御時の宣言済み攻撃神器表示を備えた**最新版の配布用1ファイルHTMLそのもの**を、本物のFirebase RTDBで試し、学校のGoogle Sites HTML埋め込みが考えられる保存領域制限も個別に検証する。

**対象**：`v2/demo/firebase-online-standalone.html`（生成ソース`v2/demo/firebase-online-lab.html`）。開発ブランチ`refactor/v2-foundation-review-20261027`のみ。正規山札・全カードの完全再現ではなく、`partial-reference-v2-lab`の固定手札テスト。

## 実Firebaseでの検証【完了】

`tests/v2-g6-live-firebase.browser.mjs`を現行UIへ更新し、サーバーはlocalhost静的配信、通信先は**実Firebase Realtime Database**の`godfieldV2LabRooms/<テスト専用の5桁番号>`に限定。

1. 独立したPlaywright WebKitブラウザコンテキスト2つを起動し、単体HTMLを開く。
2. Aが部屋を作り、Bが番号で参加。Aがワンダーソードで攻撃し、Bが宣言済み「ワンダーソード・攻10」を見る。実Firebaseの`views/B.pending.declaredAttack`も検査。
3. Bがカードなしの「許す」で応答。両画面のHPと revision 3 が一致し、公開攻撃情報が消える。各席の未使用相手手札は公開されない。
4. 次にBが武器でAを攻撃し、Aが「許す」で応答。**逆方向まで2往復**確認。双方の revision が6になり、以前のHPが維持されたままA側にもダメージが反映されることを確認。
5. テストで作ったルームだけをREST経由で削除。削除前に**作成直後に読み取った元の`meta.hostId`と一致すること**を再確認し、他人のルームは削除しない。

**実行結果**：GitHub Actions [run 40973710968](https://github.com/8mahi8/party-card-replica/actions/runs/40973710968) **success**。ログは`G6_LIVE_HOST_CREATED`、`G6_LIVE_TWO_BROWSER_SUCCESS: portable HTML, real RTDB, A-to-B and B-to-A, revision6, public attack HUD, private hands`、`G6_LIVE_CLEANUP_SUCCESS`。これは**本物のネット通信の成功**だが、学校iPad実機ではなくCIのWebKit2ブラウザ環境。

## iframeの保存領域制限対策【完了】

埋め込みiframeが`sessionStorage`を許可しない場合、従来はBの部屋参加時に`sessionStorage.getItem()`が例外で止まった。MDNの[iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)と[Storage Access API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API)では、sandboxとオリジンにより保存領域が制限され得ると説明されている。ただし**学校Google Sitesの実際のsandbox構成を確認したわけではない**。

- B参加時の前回guestIdの読み込みは`try/catch`で保護し、取得不可なら新しいランダムIDを使う。
- join成功後の`sessionStorage.setItem()`も失敗しても通信を妨げないようにする。匿名認証やFirebase Security Rulesは変更しない。
- `tests/v2-firebase-online-webkit.browser.mjs`ではBページの`sessionStorage` getterを`SecurityError`にして、**それでも部屋に参加し、攻撃・防御を進行できる**ことを検証。これは保存領域エラーを模したWebKitブラウザテストで、Google Sites本体の検証ではない。
- ストレージ使用不可の場合、同じB席IDによる**リロード後の再参加は保証しない**。現時点ではそもそもホストタブの再読み込み復帰も非対応。使用不可でも初回に友達と遊べることを優先した最小限の対応。

## テストと保存

- Node **908/908 PASS**：run [40973992022](https://github.com/8mahi8/party-card-replica/actions/runs/40973992022)。新規のiframe保存領域制限ガードを確認。
- Chromium **28/28 PASS**：run [40973992018](https://github.com/8mahi8/party-card-replica/actions/runs/40973992018)。
- WebKitオンライン2画面 **28/28 PASS**（Bにストレージ禁止を注入）＋旧UI **339/339 PASS**：run [40973992092](https://github.com/8mahi8/party-card-replica/actions/runs/40973992092)。
- 単体HTMLは`node v2/demo/build-online.mjs`によって更新され、開発ブランチへ生成コミット`fde4f6c`で保存済み。オフラインの`standalone.html`は今回は変更なし。配布HTMLのソースコードと生成内容はNode回帰で一致確認。
- 本番Firebaseの専用workflow`g6-live-firebase-probe.yml`と単体HTML再生成workflow`g6-commit-portable-html.yml`は、完了後に通常PR更新では反復起動しない手動起動へ戻した。
- **学校Google Sites上で友達が遊んでいるHTML、GitHub`main`、Firebase Security Rules・認証は変更していない。**

## 次工程

現時点で「**最新版単体HTMLの本物のFirebaseによる2人対戦が成功**」までは確定。「**Google Sites内の学校iPad Safariで実際に遊べる**」ことまでは未検証。学校の2台のiPadでiframe内接続・画面レイアウト・ルーム参加・攻防・リロード時の挙動を確認する。GitHub PagesのHTTPS公開URLはまだ確認できていない。実機接続に問題がなければ、原作再現にとって最も大きい未完部分である正規カード山札と効果再現へ作業を移す。
