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

## 次に検証すること

1. 外部HTTPS候補のWebKit上で、`firebase-online-lab.html`のインポート解決・起動可否を確かめる。フォームで実Firebaseデータを書き換える必要はない。
2. 学校iPad2台から開発版へアクセスし、5桁コード・カードのタップ・攻撃・空防御・次手番、切断時の案内を実際に確認する。学校Google Sites版の更新ではない。
3. 学校で動かなければ、その時点でGoogle Sites貼付用の単一HTMLに切り替えるなど、最小の代案を選ぶ。実機試遊前に認証やDB Rulesを変更しない。

**未完成・未検証**：原作353種500枠の正規山札、完全原作再現、学校iPad/iOS Safari実機、実Google Sitesでの配布、ホスト再読込復旧。Google Sites本体、Firebase Rules、`main`は変更していない。
