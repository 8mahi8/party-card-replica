# G6 オンライン対戦｜通知欠落・カード選択エラーからの復帰（2026-10-30）

## 背景と根拠

学校iPad Safariで遊ぶオンライン2人研究版は、実Firebase RTDBでA攻撃→B防御まで検証済み。ただしゲストが操作を書き込んでも、ホスト処理後の`acks/B`通知だけが失われた場合、UIの`waiting=true`が解除されず、手札や次の操作がずっと無効になる問題があった。これまでのホスト層は`commandId`による重複処理防止に対応していたが、ゲーム画面に再送手段が存在しなかった。

Firebase公式[Webでの読み書き](https://firebase.google.com/docs/database/web/read-and-write)では、Realtime Databaseは端末内のローカルデータに先に書き込み、通信の状態によってサーバー/他端末への反映と通知が遅れるため、画面側で送信・反映の違いを意識する必要がある。

## 最小の改善

1. `v2/demo/firebase-online-lab.html` の戦闘画面に「同じ操作を再送」ボタンを追加。送信中は操作内容と`commandId`を`pendingCommand`として保持。通知が来ない場合は同じ内容を再送し、`ack.id===pendingId`を受信した時点で待機状態を解除。新しい攻撃・防御として再発行しない。
2. `v2/firebase-two-seat-transport-fixture.mjs`のゲスト配送メールボックスに、送信ごとに変わる`deliveryId`を追加。**操作IDとJSON内容を同一に保ったまま、RTDBの値を更新してリスナー通知を発生させる**。これにより、同一データの再書き込みがno-op扱いになっても再送が届く。実際の戦闘効果は既存エンジンの処理済みID台帳により二重実行されない。
3. ホスト側の`A.submit()`が「カード選択が不正」と判定したケースのみ`commandRejected=true`を付けてUIへ返す。ゲームルール違反なら画面の待機を解除してカード選び直しを可能にする。一方、戦闘処理後に`room.update()`が失敗した場合は元の操作IDでの再送を維持する。
4. 画面のエラー文言を「操作エラー」と「通信エラー」で区別。余計な認証/ルール変更、難しいオフラインキューやホスト交代の基盤は増やしていない。

## 検証項目

- Node結合テスト：同じ`commandId`の2回配送で`deliveryId`だけが変わり、同一mailbox値をno-opとする模擬DBでも再送が届くこと、BのHPが二重に減らないこと。
- Node結合テスト：不正なホストカード選択は`commandRejected`で戻り、部屋のrevisionは変化しない。正しいカードならその後に攻撃可能。
- WebKit 2画面タッチ：模擬DBでBの防御成功後の成功通知`acks/B`を1回だけ落とし、Bの「同じ操作を再送」をタップ。成功通知が戻り、HPが30のまま維持されること。またAが不正カードを選んだ後、選び直して通常攻撃できること。
- 生成HTMLを`build-online.mjs`で更新し、`--check`とWebKitの生成物タッチ試験を実施。学校iPadの実機、実Firebaseで意図的な通知欠落、公開Pagesは別途未検証。

**重要な範囲**：これは既存のG6実通信研究版と単体HTMLの操作性改善で、原作カードデータや戦闘ルールには触れていない。`main`、学校Google Sitesに埋め込んだHTML、Firebase Security Rules・認証設定は変更しない。

## 実行済みテストと配布状況（最終確認）

- **検証コード・テストHEAD**：`c11d2b340f7041bb58bc7be71090da3a680d7a56`。**Node 903/903 PASS**（GitHub Actions run [`40939172568`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172568)）。追加テストで同一mailboxのno-op書き込みを再現し、異なる`deliveryId`で同じ`commandId`を再送できること、ホストの不正選択を訂正できること、保存済み配布HTMLとソース生成物のバイト一致を確認。
- **WebKit**：run [`40939172511`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172511)。**オンライン2画面14/14 PASS**（模擬Firebaseで成功`acks/B`通知を1回だけ落としてからBが再送ボタンをタップし、最新の同一HPを維持）。**既存のタッチUI回帰339/339 PASS**。
- **Chromium**：run [`40939172489`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172489)、**28/28 PASS**。WebKit/Chromiumの既存スタンドアロンチェックもPASS。
- **新しい配布ZIP**：run `40939172511` の [`g6-online-standalone-html`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172511/artifacts/12926102283)。ソースとしての`v2/demo/firebase-online-standalone.html`も開発ブランチに同期済み。従来のZIPよりこの最新版を優先。
- **次回以降の再生成**：`.github/workflows/g6-commit-portable-html.yml`は`workflow_dispatch`から**開発ブランチを選んで手動起動できる**ように修正した（設定やRulesの変更ではない）。自動テストが古いHTMLを検知すると失敗するので、配布ファイルの更新忘れを把握できる。

**留保**：今回の「通知が1回失われる」再現はMock RTDBとWebKitを使うテスト。以前の実Firebaseの2人対戦成功は維持されるが、実ネットワークを故意に断線したテスト・学校のiPad実機試験・Google Sites組み込み版の更新は**実施していない**。
