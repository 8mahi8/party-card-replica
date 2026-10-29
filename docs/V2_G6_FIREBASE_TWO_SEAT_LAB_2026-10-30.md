# G6｜Firebase 2人対戦オンライン研究版（2026-10-30）

**開発専用。既存の学校公開版・`main`・Firebase Security Rulesを変更していない。**

## 何を実装したか

- `v2/firebase-two-seat-transport-fixture.mjs`：学校で使用していた小国戦線IIIの `online-net.js` と同じFirebase Realtime Database compat SDKを前提に、**2人・ホストA主導**の通信層。
- `v2/demo/firebase-online-lab.html`：iPad向けの研究用ブラウザ画面。5桁ルーム作成/参加、HP・MP・手札表示、カード選択、攻撃、防御、祈る、捨てるを用意。学校へ公開するHTMLではない。
- `tests/firebase-two-seat-transport-fixture-v2.test.mjs`：RTDBのイベント通知、トランザクション、書き込みを模擬した6件の結合テスト。
- `tests/firebase-online-lab-page-v2.test.mjs`：ブラウザ側モジュールの構文と最低限の操作要素3件を検証。

## 既存の成功例と公式資料

GitHubの[小国戦線III・オンライン通信](https://github.com/8mahi8/shokoku-sensen/blob/main/online-net.js)を確認。学校向けの開発ではFirebase compat SDK、別ゲームのルームを避ける専用ルート、ホストが権威を持ちゲストの入力を受け取る方式を運用している。ゴッドフィールドはターン制なので高頻度の世界スナップショットを必要としない。

Firebase公式：[Webでのデータ読み書き](https://firebase.google.com/docs/database/web/read-and-write)は`on('value')`の継続監視、トランザクションでの競合更新と再実行、複数パス`update`の原子的な反映を説明。[オフラインと接続](https://firebase.google.com/docs/database/web/offline-capabilities)では切断時のイベント、ネット状態の監視が可能。現実装は必要最小限の読み書きのみで、プレゼンス管理は追加していない。

## 通信の動作

専用DBルート：`godfieldV2LabRooms/<5桁番号>`。既存の`shokokuRooms1v1`とは分離。Firebaseの実プロジェクト内に作る部屋は試遊専用データ。

1. ホスト：新ルームの`transaction`で番号衝突を拒否。従来の`createStagingRoom`と`createLocalRoomHostFixture`を使用し、**正式な戦闘計算はすべてホストだけ**で実行。
2. ゲスト：`meta/guestId`の`transaction`で未参加の席Bに登録。同じタブの更新時は`sessionStorage`でIDを再利用。
3. ゲストは`commands/B`に`{senderId,command}`のみ送信。ホスト側が順番に読み、既存の`authorizedSeatId` / `expectedRevision` / `commandId`検証とG3の効果処理へ渡す。
4. 処理成功後にホストが**単一`update`**で`views/A`と`views/B`と応答ID`acks/B`を更新。各プレイヤーには`viewStagingRoom`の自席ビューのみを配送。失敗したコマンドは状態を更新せず、理由を`acks/B`に返す。
5. 同じコマンドを再送しても、既存の処理済みID台帳により二重ダメージ・二重手番にならない。ホスト送信後のDB更新が失敗した場合に備え`retryPublish()`で最新画面を再配信可能。

## 検証の範囲

実コードと試験コミットはGitHubの[Draft PR #1](https://github.com/8mahi8/party-card-replica/pull/1)で追跡。

- Fake DBによる新規通信6件：2席で攻撃→防御→双方HP/手番更新、同一操作再送、部屋番号衝突、席二重参加の拒否、誤操作後の回復、専用DBルート限定。
- ページ構文とUI静的検証3件。既存戦闘回帰を含む全Node試験を実行。
- WebKit / Chromium の従来研究版テストは継続。ただし**今回の新規オンラインページを2つのブラウザタブでタップして通信する試験ではない**。
- **実Firebaseへの作成・読取・書込はこの作業で行っていない**。学校iPad実機・Google Sites本体での接続確認も未実施。次工程の主要課題。

## 新規オンライン画面のWebKit実タップ（追加）

`tests/v2-firebase-online-webkit.browser.mjs` を追加し、CIのWebKitフローに組み込んだ。390×430のタッチ画面を同一ブラウザコンテキスト内に2枚開き、**ローカルストレージを共有する模擬Firebase**でルーム作成、5桁コード参加、ホストによるカードタップ→攻撃、ゲスト防御、両画面のHP30への同期を実操作する。JavaScript例外・横はみ出し・各自の手札の件数も確認。画面スクリーンショットはGitHub Actionsの`v2-webkit-touch-evidence`に出力する。

初回CI `40930048161` では「カード選択前に攻撃ボタンが有効になる」と誤って待っていたためタイムアウトした。カード選択後にボタン有効を検証するようにテスト条件を修正し、タイムアウト時の両画面・模擬DB診断を追加。**原作の戦闘仕様や実ゲームUIの挙動は変更していない。** 修正したコード/テストHEAD `a314144e57981d894d9c35e3b7455a5b389ba377`で、**新オンライン2画面WebKit 9/9 PASS**（run `40930592083`）、既存WebKit **339/339 PASS**（同run）、Node **894/894 PASS**（run `40930592209`）、Chromium **28/28 PASS**（run `40930592089`）を実測。新しいホスト・ゲストのスクリーンショットを同runの artifact `v2-webkit-touch-evidence`に保存。AIが画像内容を直接目視検証したわけではない。

この試験の成功も**実Firebase/異なる物理iPadの接続成功ではない**。実Firebaseのルール・ネットワーク状態は未検証のまま。

## 2026-10-30｜G6 ホスト/ゲスト同時更新の同期ずれ対策（最新）

**実装**：`v2/firebase-two-seat-transport-fixture.mjs`。すでに存在する権威エンジンは再実装せず、Firebaseへ配信する `views/A`・`views/B`・`acks/B` の変更パケットを作成時点のrevisionとひもづけ、単一の非同期キューで**送信順に直列化**した。ホストAの公開が遅い最中にゲストBの解決が進んでも、古いrevisionの書き込みが後から完成状態を上書きしない。

**もう1件のバグ予防**：Bの防御などがエンジン内で正常にコミットされた後、Firebase `update` だけが失敗したときは、「操作が失敗した」という否定的な受領通知を返さない。通信失敗として `onError` を通知して保留し、**同一コマンドIDの再送**でエンジンは二重実行せずに最新のビューと成功受領情報を再配信する。ゲーム上の不正コマンドは従来通りエラー応答し、状態を更新しない。

**新規2件の回帰**：`tests/firebase-two-seat-transport-fixture-v2.test.mjs` で(1)AのFirebase送信を意図的に遅延させたままBが防御しても、後続更新が先を追い越さず、最終revision 3/HP30になること、(2)Bの防御解決後のFirebase書き込みだけ一度失敗させ、偽の失敗受領を出さず同一IDの再送から復帰することを検証。revision=3はエンジンの攻撃宣言・防御宣言・解決の3更新に基づく。初回の新テストがrevision=2を期待して失敗したのはテストの値の誤りで、修正後のCIで成功。

**実測**（コード＋テストコミット `37907e0ae8db7242f7d3a2bc81860fa7da93eb27`）：
- Node **896/896 PASS**：GitHub Actions run `40931833573`
- Chromium **28/28 PASS**：run `40931833732`
- Playwright WebKit既存画面 **339/339 PASS** ＋新規オンライン2画面模擬Firebase **9/9 PASS**：run `40931833561`
- スタンドアロンHTML生成整合性検証もPASS。**本物のFirebaseへのネット接続や異なる2台の実機iPadでの対戦を検証したものではない。**

**静的配信の現状**：GitHub公式[Pages配信元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)によれば任意の開発ブランチのルートを公開元にできる。ただし既存Pagesの設定を切り替えると公開内容へ影響が及ぶため、現行構成の確認なしに切り替えない。**現在有効なPages配信URLは確認できていない**。新しいオンライン画面はES Modulesの相対参照を使うため、GitHubのソース表示やローカル`file://`ではなく、同一オリジンでJSファイルを配信するHTTPSサーバーが必要。学校に直接貼るための1ファイル化はまだ行っていない。

次は開発版のHTTPS配信経路の確定 → 実Firebaseで2端末のルーム作成・参加・攻撃・防御検証。実際に遅延や断線を経験するまで複雑な復旧基盤は作らない。学校Google Sites版やFirebase Rulesは変更しない。

## 試遊前提と明示した制約

- 2台とも同じ`firebase-online-lab.html`を同一オリジンから読み込み、学校で既に使えているFirebase SDKへ接続する必要がある。GitHubのソース表示画面からは動かない。開発ブランチの静的配信/試遊URLが必要。
- ホストのタブを閉じると権威状態が消失する。更新後の復元やホスト交代は**未実装**。試験中はホストを開いたままにする。
- 認証は導入していない。研究用`hostId`/`guestId`はログイン認証ではない。信頼できる少人数の友人向けであり、DB内部は各席の投影を分けているが**DBルールによる厳格な他席情報隔離を保証しない**。通常の画面では他人の手札を表示しない。
- 研究用120種／固定カード補充。現行の原作全353種・500枠、全カード特殊効果、確率、原作対戦の100%再現ではない。原作未確認の〈蜃気楼〉3人挙動は通常2人接続へ持ち込まない。
- Firebase Security Rulesの変更や匿名認証は**実施していないし必須の前提にしていない**。既存Rulesの実際の可否は次のDB接続試験で確認する。

## 次にする仕事

1. 開発版だけをブラウザで配信できる経路を確認し、**本物のFirebaseへ2端末でルーム作成→参加→攻撃→防御**を試験する。開発版公開の権限・設定は`main`や学校サイトへ勝手に反映しない。
2. SDKの初回接続、ルーム参加/操作後の即時表示、接続切断時のUIを目視確認。画面が止まれば通信ログの順序とsnapshot通知を調べ、必要最小限だけ修正する。
3. 正規の山札/補充と原作固有効果は戦闘エンジン側の別工程で調査し、研究用固定抽選のまま完成扱いしない。
