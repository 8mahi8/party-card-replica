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
