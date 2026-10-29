# V2 G6準備｜座席別ビューを返すローカルホスト検証

更新：2026-10-30（日本時間）／**開発ブランチ限定・ネット通信なし**

## 目的

学校iPadで友達と遊ぶときのオンライン実装に向けて、**既存のG2/G3戦闘エンジンをコピーしない**で、ホスト1つとプレイヤー別の操作口を接続する。

新規 `v2/local-room-host-fixture.mjs` では `createLocalRoomHostFixture({initialState,catalog})` が1つの状態を所有。信頼済みのローカル試験セットアップが `connectSeatFixture('A')` / `connectSeatFixture('B')` を作り、各席は `read()` / `submit(command)` だけ使用する。

- 書き込みは `submitAndResolveFixture` に統一。既存の `commandId`、`expectedRevision`、`authorizedSeatId` 判定とG3のダメージ、カード補充、次手番進行を再利用する。UI側に戦闘計算を再実装しない。
- `submit` が例外なら、保持する状態は更新しない。重複コマンドは1回だけ適用。各席が再接続に相当する新しいハンドルを得ても同じ状態を読む。
- `read()` と `submit()` の結果は `viewStagingRoom` 由来。自分の手札と全員の公開HP/MP等を持ち、他人の実手札、乱数seed、処理済みコマンド、内部効果イベントや実状態を返さない。
- 元の `initialState` はJSONスナップショットとしてコピーしてから保持する。準備コードが元オブジェクトを変更しても試合に影響させない。
- 単体HTML、既存ホットシートUI、`main`、Google Sites、Firebase設定は変更しない。

## 公式資料からの通信設計上の注意

Firebase公式[Realtime Database JavaScript API](https://firebase.google.com/docs/reference/js/database)と[データ読み書き](https://firebase.google.com/docs/database/web/read-and-write)では、`runTransaction` は競合時に更新関数を**再実行**し、`set`/同パス`update`との混在に注意と説明される。またクライアントトランザクションには対象データへの `.read` も必要。

従ってネットワーク化する際には、**ユーザー端末すべてが秘密手札を含む権威状態全体を読み書きする方式を安易に使わない**。まず既存の学校用Firebase構成・ルールを読み取りで確認し、友達同士で必要な最小構成を設計する。ルールの変更・匿名認証の導入を前提条件にしない。必要ならホストが1か所でコマンドを順に処理し、ゲストには席ごとの投影だけを返す方式を比較する。

このローカルモジュールの `connectSeatFixture` は任意の席名でハンドルを作れるので、**認証済み接続を意味しない**。遠隔クライアントにこのファクトリーをそのまま公開しない。ブラウザ間の接続、競合する別端末による実DB書き込み、持ち主確認、ログ切れ復旧の保証はまだない。

## 新しい回帰試験

`tests/local-room-host-fixture-v2.test.mjs`（6ケース）：

1. 2席で攻撃→防御を経てHPと手番が正しく更新、双方には自分だけの手札を渡す。
2. 重複送信と再接続時の同じ防御IDは、二重ダメージや補充を起こさない。
3. 違う席を名乗るコマンド、古いrevision、同じIDの別ペイロードを拒否し状態不変。
4. 不正な複数主武器によって相手側が防御待ちで固まらない。
5. 初期状態オブジェクトや読み取り結果の変更でホスト状態は変わらない。
6. 3人の研究用〈蜃気楼〉1周でB/Cが順番に防御し、各席に他人の手札を公開しない。

**CI実測：コード＋6テストコミット `cef8d15e8cad35501fab5b4578db48dbc4f97a09` で Node 885/885 PASS（run `40927755363`）、Chromium 28/28 PASS（run `40927755334`）、Playwright WebKit 339/339 PASS（run `40927755339`）。** V2単体HTMLの生成整合性チェックもChrome/WebKit CIで成功。これは学校実機・本家現行版の証明ではない。

## 次工程

- まず6件と既存Node/Chromium/WebKitの全回帰を通す。
- G6：既存Firebase接続方法・実際に学校で動いたゲームの通信コードを比較したうえで、**ローカルホストの小さいAPIを流用できる実端末2席プロトタイプ**に進める（開発版限定）。ネットワーク試合では座席ビュー、更新番号、重複コマンド処理を分離する。
- 原作再現のカード抽選・個別効果の研究は別軸で継続し、固定ドローのラボを完成版と誤認しない。
- **main / 公開 Google Sites / Firebase Security Rules は勝手に変更しない。**
