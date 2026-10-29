# G6｜オンライン2人対戦の配布・HTTPS試遊経路（2026-10-30）

## 目的と現状

実FirebaseでホストAの攻撃→ゲストBの空防御→双方のHP30/revision3まで成功したG6オンライン研究版を、学校版のGoogle Sites HTMLへ触れずにiPad Safariで試すための配布経路を作る。

- リポジトリ：`8mahi8/party-card-replica`
- 開発ブランチ：`refactor/v2-foundation-review-20261027`
- 研究HTML：`v2/demo/firebase-online-lab.html`（外部の同一オリジン配信で動くES Modules版）
- **新配布方式**：`v2/demo/build-online.mjs` → `v2/demo/firebase-online-standalone.html`（生成される1ファイル。Firebase compat SDK2本は実行時にgstaticから読み込む）。
- **共有のモジュール順序**：`v2/demo/bundle-modules.mjs`。既存のオフライン`v2/demo/build.mjs`とオンラインビルダーが同じ31モジュールを使い、オンライン用の2モジュール（`local-room-host-fixture`、`firebase-two-seat-transport-fixture`）のみ追加。既存のオフラインバンドルの内容・ゲームルールは変えていない。

## ビルド・テスト

```bash
node v2/demo/build-online.mjs
node v2/demo/build-online.mjs --check
node --test tests/g6-online-bundle-v2.test.mjs
```

既存回帰を含むGitHub Actions [run 40935224345](https://github.com/8mahi8/party-card-replica/actions/runs/40935224345)は成功し、**新しく生成した1ファイル版**に対して390×430のWebKitタッチ2画面の操作を実施（ルーム作成→参加→A攻撃→B防御→両者HP30）。FirebaseはこのWebKitテストではmockであり、実Firebaseネット接続の証明は別の既存run `40934112303` が担う。

単一HTMLはworkflow artifact `g6-online-standalone-html`、ID `12924716292` として保存済み。GitHubからZIPを入手できる：[配布用HTML ZIP](https://github.com/8mahi8/party-card-replica/actions/runs/40935224345/artifacts/12924716292)。Actions成果物は保持期限があるため、期限が切れた場合は開発版のCIを再実行して再生成する。

Node自動試験は [run 40935224335](https://github.com/8mahi8/party-card-replica/actions/runs/40935224335)で **899/899 PASS**。新規2件はビルド結果にESMの動的importが残っていないこと、スクリプトがJavaScriptとして構文解析できること、同じ入力から決定的に同一HTMLが生成されることを確認。

## GitHub Pagesの状態と代替経路

GitHub公式[Pages公開元の設定方法](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)を参照。Pagesは任意のブランチのルートを公開元にできるが、現リポジトリで2026-10-30にGitHub REST `GET /repos/8mahi8/party-card-replica/pages`と `https://8mahi8.github.io/party-card-replica/v2/demo/firebase-online-lab.html`を読み取り確認した結果、**双方HTTP 404**（CI run `40935432804`）。設定を変更したり、実在未確認のPagesリンクをユーザーへ提示しない。

**一時的な外部HTTPS候補**：`https://raw.githack.com/8mahi8/party-card-replica/refactor/v2-foundation-review-20261027/v2/demo/firebase-online-lab.html`。読み取り専用CI run `40935644067`ではHTTP 200とHTML実体の取得を確認（GitHub純正のPagesではなく第三者のHTML代理配信サービス）。**ブラウザ実行と学校Safari接続まで確認できたとはまだ言えない**。外部サービスの可用性・学校のフィルターに依存する。GitHub Pagesを有効化する場合は既存の公開内容への影響を考慮して、`main`に触れず開発ブランチのルートを指定する。

## 追加検証と確定事項（2026-10-30）

- **単体HTMLのGitHub保存成功**：GitHub Actions run [`40936099663`](https://github.com/8mahi8/party-card-replica/actions/runs/40936099663)で`node v2/demo/build-online.mjs`と`--check`、Nodeテストを実行し、生成した `v2/demo/firebase-online-standalone.html`（約276,000文字）を開発ブランチにコミット`e0adb7963e4167ffe8d44d8ce24fc7cf024b76f6`。GitHubソースの[単体HTML](../v2/demo/firebase-online-standalone.html)はダウンロード・コピー可能。ただしGitHubコード表示画面自体はプレイURLではない。
- **実ブラウザでの単体HTML成功**：WebKit Actions [`40935224345`](https://github.com/8mahi8/party-card-replica/actions/runs/40935224345)にて、生成した単体HTMLをlocalhostで配信し2つの画面をタップ操作。模擬Firebase上でルーム作成/参加/攻撃/空防御/双方のHP更新を確認。CI artifact `g6-online-standalone-html`（ID `12924716292`）として配布ZIPを保存。Nodeテスト899/899も確認。
- **GitHub Pages は未設定または未アクセス可能**：読み取り専用CI run `40935432804`と`40935644067`でPages API/試遊パスとも404を確認。`Settings → Pages → Source=Deploy from a branch → refactor/v2-foundation-review-20261027 → /(root) → Save` で有効化できる仕組みをGitHub公式資料で確認。ただしユーザー設定をAIのGitHubコネクタから変更する手段はなく、**設定自体は未変更**。有効化した後は`/v2/demo/firebase-online-standalone.html`をHTTPSで試す（公開の成功まではURLを「動く」と断定しない）。
- **非公式なHTML代理配信は採用しない**：`raw.githack.com`でHTMLのHTTP 200取得までは成功したが、実際のPlaywright WebKit起動テストは`#status`に到達せずタイムアウト（run `40935814977`、`40936269151`、`40936520261`）。原因は未確定で、ユーザーに遊べるURLとして提供しない。
- **運用**：単発の配布コミット・Pages状態確認・外部HTTPSブラウザ検証用ワークフローは通常PRによる再実行を停止し、必要時の手動起動に変更。通常のNode/Chromium/WebKit自動回帰は継続。学校のGoogle SitesとFirebase Rules、`main`は変更していない。

## 次に検証すること

1. 外部HTTPS候補のWebKit上で、`firebase-online-lab.html`のインポート解決・起動可否を確かめる。フォームで実Firebaseデータを書き換える必要はない。
2. 学校iPad2台から開発版へアクセスし、5桁コード・カードのタップ・攻撃・空防御・次手番、切断時の案内を実際に確認する。学校Google Sites版の更新ではない。
3. 学校で動かなければ、その時点でGoogle Sites貼付用の単一HTMLに切り替えるなど、最小の代案を選ぶ。実機試遊前に認証やDB Rulesを変更しない。

**未完成・未検証**：原作353種500枠の正規山札、完全原作再現、学校iPad/iOS Safari実機、実Google Sitesでの配布、ホスト再読込復旧。Google Sites本体、Firebase Rules、`main`は変更していない。
