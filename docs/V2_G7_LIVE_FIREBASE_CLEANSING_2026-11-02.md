# G7｜〈音色〉〈歌声〉実Firebaseオンライン2席検証

実施：2026-11-02（日本時間）｜開発ブランチ `refactor/v2-foundation-review-20261027`

## 目的と既存実装

前回G7で追加した〈音色〉（`m017`, MP2、軽い災い解除）と〈歌声〉（`m018`, MP5、現在実装済みのすべての病気を解除）について、模擬RTDB WebKit2席試験は295/295合格済。しかし**本物のFirebaseに対する両席の通信・実操作は未検証**だった。

新規 `tests/v2-g7-live-cleansing.browser.mjs` は既存G6実Firebase取引検証（`tests/v2-g6-live-trades.browser.mjs`）と同じアプローチで、現在の **開発用単体HTML** `v2/demo/firebase-online-standalone.html`・本物のFirebase compat SDK・独立したWebKitブラウザ2セッションを利用する。ゲーム本体／Firebase Security Rules／認証方式／学校に貼ったHTMLの変更なし。

## 実行シナリオ

〈音色〉と〈歌声〉を**それぞれ別の一時ルーム**でテスト。

1. ホストが`cleansingMiracles`研究プリセットでルームを作成、ルーム固有の`meta.hostId`と`meta.version===1`を保存。ゲストが別WebKitブラウザで入室。
2. 両席の公開ビューで初期熱病とMP25を確認。相手の手札／習得奇跡の非公開を確認。
3. ホストが物理カードから奇跡を詠唱。雑貨ボタンを使用しない。両席で熱病解除、HP40維持、MP23／20、奇跡習得、4枚へ補充、ゲスト手番を検証。
4. ゲストが通常武器で攻撃、ホストは防御なしでHP30に。次のホスト手番に、習得した奇跡を物理カードなしで再使用。
5. 両席でMP21／15、HP30、物理手札5枚（再詠唱時の1枚補充）、ターンとrevision整合、他席への手札非公開を検証。
6. 各シナリオ終了時、**保存した作成者IDとルームのmeta.hostId/versionが一致した場合のみ**その一時ルームをDELETE。既存の友達のルームや他のデータには触れない。ルームコードを固定せず毎回別の5桁コードを発行。

## 実行結果

- **成功**：GitHub Actions [run 41323117337](https://github.com/8mahi8/party-card-replica/actions/runs/41323117337)。
- ログ：`G7_LIVE_CLEANSING_M017_SUCCESS checks=14`、`G7_LIVE_CLEANSING_M018_SUCCESS checks=30`、`G7_LIVE_CLEANSING_ALL_SUCCESS checks=33`。
- 2つの一時ルームについて所有者一致を確認し、それぞれ削除リクエストの成功も検査した。試験中のJavaScript例外なし。
- **最初の試験はテストの誤判定**：[run 41322971112](https://github.com/8mahi8/party-card-replica/actions/runs/41322971112) は、実Firebaseが保存する`null`値をJSONオブジェクト上で省略する点を考慮せず、治癒後の`disease===null`を要求して失敗。実際の通信の表現は`undefined`として返ることがあるため、テストを`disease==null`に修正して成功。**ゲーム本体の処理を変更したのではない**。初回試験の一時ルームは`finally`で所有者確認後に削除する設計で、クリーンアップ失敗ログはなかった。
- 最新のNode／Chromium／模擬RTDB WebKit回帰は独立のGitHub Actions CIで確認する（本実通信試験をそれらの代替にはしない）。

## 影響・制約・引き継ぎ

- **新しいゲーム効果、カード仕様変更、正規山札、デッキ確率の変更なし**。台帳は**181種類／442/500研究参考枠、`complete:false`**。
- 実行専用workflow `.github/workflows/g7-live-cleansing-20261102.yml` は、試験を一度自動起動したあと**手動起動専用`workflow_dispatch`に戻して保存済み**。環境変数`G7_LIVE_CLEANSING=1`も必要で、通常のCIから実Firebaseを書き込まない。
- **未検証**：実際の学校iPad SafariとGoogle SitesへHTMLを直接貼り付けた環境、本家2026年版での霧・閃光などの挙動、〈音色〉〈歌声〉の対人治癒の可否。
- 次に価値が高い作業：原作と現行ゲームの未実装要素を検討し、完成度の高い試遊に近づける。原作の裏付けのない例外処理やセキュリティ追加はしない。
