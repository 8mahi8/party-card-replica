# ゴッドフィールド再現ゲーム｜開発担当AI 引き継ぎ【最新・入口固定】

**最終更新：2026年10月30日（日本時間）**  
**ユーザーが新しいチャットで「ゴッドフィールドの開発引き継いで」とだけ言ったら、この文書から開発を再開する。** チャットの過去ログや古いREADMEを読めない状態でも、このファイル・GitHubのコード・CI・資料で引き継げるようにしている。

> **この文書は引き継ぎ入口であり、実装の真実は常に開発ブランチの最新コードとGitHub Actions。** コミットSHA・テスト件数・カード数は作業のたびに変わる。本文の日付や数値を確認せず永久に正しいと扱わないこと。

## 2026-10-30 G6｜原作ブラウザ版を参照したオンラインUI再設計【現行最新】

- **外部資料を実際に照合**：[ゴッドフィールド初心者向け・ブラウザ画面](https://godfield-beginner.game-info.wiki/)、[原作の攻撃/防御の操作方法（Piong wiki）](https://w.atwiki.jp/piong/pages/16.html)、[原作画面のプレイ写真](https://note.com/moe_axera/n/n77ed29fe154d)。原作らしさの中心は淡い水色/緑背景、HP・MP・所持金のプレイヤー帯、中央で選択神器と攻撃防御を確認するエリア、下端の横長・横並び神器手札、「許す」の防御辞退表記。
- **開発版UI更新**：`v2/demo/firebase-online-lab.html`で暗色2列カードの管理画面をやめて水色〜緑系の戦闘盤面に変更。上部プレイヤー状態、中央に選択神器トレイと手番表示、下部に横一列の小さい神器カードを配置。選択中の神器名・強調表示、攻/守/MP/価格、手札スクロール位置の保持、タップしやすいボタン、未選択防御の「許す（防御なし）」、自分/相手の行動待ち文言を追加。実カード画像は転載せずカテゴリ別の簡単な仮記号。
- **テスト**：検証コードcommit `59b94837fd0be1ad9b53384c9d78663a88c1ce9d`、GitHub Actions **Node 904/904 PASS** run `40941029006`、**Chromium 28/28 PASS** run `40941028870`、**WebKit既存画面339/339 PASS ＋ 新オンラインUI実タップ19/19 PASS** run `40941028890`。新WebKitは390×430画面で神器選択・中央プレビュー・横スクロール手札構造・HPパネル・「許す」・A攻撃→B防御・再送復旧まで確認。初回テストは旧UI文言を待ってタイムアウト、テストを新UIの文言へ更新してPASS。ゲームルールは変更なし。
- **配布**：`v2/demo/firebase-online-standalone.html`を同じ新UIから自動再生成し、開発ブランチに保存（bot commit `1e76e8f278887b85416aaeb1573c841579e63407`）。[最新HTML ZIP artifact](https://github.com/8mahi8/party-card-replica/actions/runs/40941028890/artifacts/12925774641)。`g6-commit-portable-html.yml`は完了後手動起動専用へ戻した。
- **仕様と制約**：研究用の固定4枚/固定補充を原作の9枚手札や本来の山札と混同しない。原作の個別カード画像、中央の詳細な攻防演出、全353種類/500枠の正規デッキは未完成。**学校iPad Safari実機/ネット環境は未検証**、GitHub Pages HTTPS公開も未設定または未確認。今回のUIはlocalhost上のCI WebKitで確認済み、AIによるスクリーンショット実画像の目視は未実施。本物のFirebase2ブラウザ通信の基本動作は旧run `40934112303`で検証済みだが、新UIそのものを実通信/学校実機で再確認したわけではない。
- **資料・次**：[`docs/V2_G6_ORIGINAL_INSPIRED_UI_2026-10-30.md`](docs/V2_G6_ORIGINAL_INSPIRED_UI_2026-10-30.md)。次の優先はiPad実機で表示/手札タップ/攻撃・防御の感覚を試すこと、また原作の個別神器素材と選択確定の情報量を整理して原作再現度を高めること。**main、学校Google Sites HTML、Firebase Security Rulesと認証の変更なし**。

## 2026-10-30 G6改善｜送信成功通知の欠落から復帰＋配布HTML検証【最新】

- **実際に解消したUI進行不能**：2人オンライン試遊版`v2/demo/firebase-online-lab.html`で、ゲスト操作をホストが処理したのに`acks/B`の受領通知だけが届かない場合、`waiting=true`で操作不能になっていた。「同じ操作を再送」ボタンを追加し、元の`commandId`と操作を保持して再送可能にした。
- **通信層の根本修正**：`v2/firebase-two-seat-transport-fixture.mjs`がゲストメールボックスへ`deliveryId`（送信ごとに変わる番号）を付加。**同じコマンドID/JSON内容でもDBの値が更新され、listenerに再送が届く**。エンジン側の処理済みコマンドIDにより二重のダメージ・手番進行を抑止。原作カード効果は変更なし。
- **別の進行不能も回避**：ホスト側の不正なカード組み合わせは`commandRejected=true`でUIへ返し、送信中状態を解除。ネットワーク更新が失敗した場合だけ元のコマンドIDを保持して再送。エラー表示を「操作エラー」と「通信エラー」で区別。
- **テスト/配布一致**：最新ソース＋回帰テスト検証コミット `c11d2b340f7041bb58bc7be71090da3a680d7a56`で、**Node 903/903 PASS** run [`40939172568`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172568)、**Chromium 28/28 PASS** run [`40939172489`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172489)、**WebKit旧UI 339/339 PASS + 新オンライン2画面14/14 PASS** run [`40939172511`](https://github.com/8mahi8/party-card-replica/actions/runs/40939172511)。新オンラインWebKitは**成功ackを1回捨てる模擬Firebase**で手動再送後にHP30のまま復旧すること、ホストの誤カード選択後に選び直せることをタップ確認。生成済みHTMLとソースのバイト一致をNodeで検査。
- **最新版配布用HTML**：開発ブランチ`v2/demo/firebase-online-standalone.html`（自動再生成済み）。[最新のGitHub Actions ZIP](https://github.com/8mahi8/party-card-replica/actions/runs/40939172511/artifacts/12926102283)。生成 workflow `g6-commit-portable-html.yml`は、開発ブランチでの手動起動に対応するよう修正、無駄な毎回の外部書込はしない。
- **正式記録**：[`docs/V2_G6_RETRY_RECOVERY_2026-10-30.md`](docs/V2_G6_RETRY_RECOVERY_2026-10-30.md)と本資料。Firebase公式`onValue`やオフライン時のローカルイベントの挙動も照合。
- **未実施と次工程**：今回の通知欠落は**模擬通信試験**。既存の`40934112303`では本物のFirebase経由で攻撃/防御を検証したが、**実ネットワーク断線の再現・学校iPad実機・GitHub Pages HTTPS公開**は未実施。次は学校iPadで2人の実操作/接続の確認。ソロ試験用固定カード補充・原作全カード/正規山札の再現も未完成。GitHub `main`、Google Sitesに貼られた学校版HTML、Firebase Security Rules・認証設定は変更なし。

## 2026-10-30 G6配布｜iPad向けオンライン単体HTML生成・GitHub保存【現行最新】

- **本タスクの実装**：`v2/demo/bundle-modules.mjs`に既存31モジュールの宣言順をまとめ、既存オフラインビルダーと新`v2/demo/build-online.mjs`で共用。オンラインのローカルホストとFirebase輸送層を追加して、`v2/demo/firebase-online-lab.html`のESMエントリを**単体HTML**へ自動内蔵。Firebase compat SDKの外部スクリプト2本は残る。毎回手で再結合不要。`v2/demo/firebase-online-standalone.html`を開発ブランチに保存（Actionsによるコミット`e0adb7963e4167ffe8d44d8ce24fc7cf024b76f6`、約276k文字）。
- **実測テスト**：Node **899/899 PASS**（run `40935224335`）。`tests/g6-online-bundle-v2.test.mjs`新規2件で1ファイルの構文・決定性・ESM相対importなしを確認。WebKit CI run [`40935224345`](https://github.com/8mahi8/party-card-replica/actions/runs/40935224345)で**生成された1ファイル版**をlocalhostから2ページ実行し、模擬Firebaseでルーム作成/参加/A攻撃/B空防御→HP30をタップ試験成功。既存WebKit 339件とChromium 28件も継続。HTMLのZIP artifact [`g6-online-standalone-html`](https://github.com/8mahi8/party-card-replica/actions/runs/40935224345/artifacts/12924716292)を保存。
- **公開経路調査**：GitHub PagesはリポジトリAPIと想定URLがどちらもHTTP 404（run `40935432804`）。現時点ではHTTPS試遊URLとして案内不可。第三者HTML代理配信はHTTP 200でHTMLを返すが、WebKitで起動確認がタイムアウト（runs `40935814977`, `40936269151`, `40936520261`）しており**採用しない**。正確な理由未確定。コードのビルド/ローカルWebKit成功と外部公開を混同しない。
- **次に必要なこと**：GitHubリポジトリ `Settings → Pages` で `Deploy from a branch`、`refactor/v2-foundation-review-20261027`、`/(root)`を選択してPagesを有効化（公式ドキュメント準拠）。現行接続コネクタにはGitHub Pages設定変更操作がないため、この作業で設定は変更していない。その後HTTPSで`/v2/demo/firebase-online-standalone.html`の表示を確認し、学校の**2台のiPad Safari**で試遊。学校Google Sitesへの埋込HTMLを変更する必要はない。
- **資料**：[`docs/V2_G6_PORTABLE_PREVIEW_2026-10-30.md`](docs/V2_G6_PORTABLE_PREVIEW_2026-10-30.md)。単発CI 3本は繰り返しのPR更新で作動しないよう手動起動に変更。Firebase RTDB Security Rules・認証・`main`・Google Sites版の変更なし。
- **未完成**：原作カード全353種/500枠の正規山札、ホストブラウザ再読込後の復元、学校iPad実機接続、Google Sitesでの本配布。現行は研究用・固定カード補充。

## 2026-10-30 G6最新｜**本物のFirebaseを介した2ブラウザ対戦成功**【現在の到達点】

- **重大な実通信バグを発見・修正**：Firebase RTDBに`{command:{orderedInstanceIds:[]}}`をオブジェクトで保存すると、空配列が欠落し、「防御しない」操作が`Invalid ordered card selection`で拒否されていた。localhostのmock DBでは再現せず、本物のFirebaseに接続したから判明。修正は`v2/firebase-two-seat-transport-fixture.mjs`で`commandJson:JSON.stringify(command)`に変更し、ホスト側でparseして既存エンジンへ渡す方式。原作ルール・Firebase Rules・匿名認証を変更していない。互換で旧`message.command`も読める。
- **実Firebaseで検証成功**：GitHub Actions `G6 one-off live Firebase 2-seat probe` run [`40934112303`](https://github.com/8mahi8/party-card-replica/actions/runs/40934112303)。2つの**独立したPlaywright WebKitブラウザコンテキスト**から学校で使われる実Firebase RTDBへアクセスし、ホストが5桁ルーム作成→ゲスト参加→Aの攻撃→Bの空防御→双方HP30/revision3を実際に同期。テスト専用ルームの**削除も成功**（`G6_LIVE_TWO_BROWSER_SUCCESS`、`G6_LIVE_CLEANUP_SUCCESS`ログ確認）。
- **検証済みコードコミット**：`f640b54a86561c568c653fcb3d062605174ad789`。GitHub Actions Node **897/897 PASS** run `40934112244`、Chromium **28/28 PASS** run `40934112378`、既存WebKit **339/339 PASS＋mockオンライン2画面9/9 PASS** run `40934112253`、実FirebaseのWebKit2ブラウザ成功 run `40934112303`。追加回帰1件で通信コマンドの空配列をJSON文字列として保持することを検証。
- **資料**：[`docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md`](docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md)の最新節参照。外部本番Firebaseでのテストは安全な専用ルームだけに限定し、後片付け成功。`g6-live-firebase-probe.yml`は通常PR時の外部書き込みを停止し、手動起動のみ可能な設定へ変更した（workflow_dispatchのブランチ条件を要確認）。
- **未検証**：学校iPad/iOS Safari実機、校内ネットワーク、Google Sites、外部HTTPS試遊URL、ホスト再読込復旧。G6の本物のDB通信が成功したことと学校環境で実際に遊べることを混同しない。固定の仮カード補充・一部研究カードのため、原作完全再現も未達。
- **次工程**：開発版のHTTPS試遊経路を確立し、学校の2台のiPadでA攻撃→B空防御→次ターンを試す。原作山札/個別効果とUIの改善は並行。**mainと学校のGoogle Sites上の埋込HTML、Firebase Security Rulesは無断変更しない。**

## 2026-10-30 G6最新｜Firebase書き込み順序と一時失敗時の同一ID復帰【現在地】

- **実装**：`v2/firebase-two-seat-transport-fixture.mjs`で、ホスト/ゲスト由来のFirebase更新を順番通りに公開するPromiseキューを追加。Aの更新が遅い間にBの防御が解決しても、後から到着する旧revisionで最新画面が巻き戻らない。
- **障害時の受領情報**：エンジンがすでにBの操作を実行済みなのにFirebase送信のみ失敗した場合、「操作失敗」の応答を出さず通信エラーとして扱う。同一commandIdを再送すると重複ダメージなしで最新版と成功応答が再配信される。元のカードルールやダメージ処理は変更なし。
- **回帰2件追加・実測**：検証済み実コードcommit `37907e0ae8db7242f7d3a2bc81860fa7da93eb27`。**Node 896/896 PASS**（run `40931833573`）、**Chromium 28/28 PASS**（run `40931833732`）、**WebKit旧UI 339/339 PASS + 新オンライン2画面mock RTDB 9/9 PASS**（run `40931833561`）。初回の新テストはゲームエンジンの正常なrevision=3を2と誤認したテスト側のミスで失敗し、期待値修正後はPASS。
- **正式資料**：[`docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md`](docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md)の「ホスト/ゲスト同時更新の同期ずれ対策」を参照。GitHub Pagesは任意の開発ブランチから配信可能（GitHub公式仕様）だが、**このリポジトリの公開設定と実際のHTTPS試遊URLはまだ検証できていない**。設定を勝手に切り替えていない。
- **G6次工程**：開発版静的HTTPSの確認→実Firebase上で2台のルーム作成・参加・攻撃・防御試験→学校iPad Safari実機。現時点のWebKitはLinux Playwright＋mock Firebase。実Firebase通信・学校実機・原作正規全カード/山札は未検証・未完成。
- **保存・公開**：開発ブランチのDraft PR #1のみ更新。`main`、学校Google Sitesの貼付HTML、Firebase Security Rulesや認証方式は変更しない。

## 2026-10-30 G6追補｜オンライン画面WebKit 2画面操作までPASS【最新確認】

- **コード＋全回帰の検証HEAD**：`a314144e57981d894d9c35e3b7455a5b389ba377`（開発ブランチのみ）。Node **894/894 PASS**（run `40930592209`）、Chromium **28/28 PASS**（run `40930592089`）、WebKit既存ホットシート **339/339 PASS**＋**オンライン新画面2タブ・模擬Firebase 9/9 PASS**（run `40930592083`）。`node v2/demo/build.mjs --check`も成功。
- **追加実操作テスト**：`tests/v2-firebase-online-webkit.browser.mjs`。390×430のタッチ画面を2ページ開き、`v2/demo/firebase-online-lab.html`でホストルーム作成→ゲスト参加→Aがカードをタップし攻撃→Bが防御→両画面でHP30への同期を確認。ユーザー操作で実行したのはLinux Playwright WebKit＋同一環境のmock RTDBであり、**本物のFirebaseへのネット接続/実iPad試験ではない**。ページスクリーンショットはCI artifact `v2-webkit-touch-evidence`（run `40930592083`）に保存、AIによる画像目視は未実施。
- **初回テストの失敗と修正**：カードを選ぶ前に攻撃ボタンの有効化を待った誤った待機条件で30秒タイムアウト。カード選択→有効化を待つ正しい操作順に変更、診断ログも追加。ゲームエンジンのルールは変更していない。Workflowでは短いオンラインチェックを先に実施し、既存339件に続ける。以後全PASS。
- **最新資料**：[`docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md`](docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md) を最優先に参照。Firebase Rules変更・匿名認証導入・`main`/Google Sites公開はしていない。
- **次の主目的**：dev用HTTPS静的配信手段を確認→**実Firebaseで2端末接続/操作**→学校iPad Safariの画面と接続性をテスト。ホストリロードで復旧不可・正規カード山札未完成という現在の制約を明示したまま進める。

## 2026-10-30 G6実装｜Firebase RTDB・2人オンライン研究版【この節が最新】

**実装コミット**：`b639af74`（通信モジュール）、`7c2fca79`（Firebase模擬結合テスト）、`d7107ec8`（RTDB変更パスのみ通知する模擬環境へ修正）、`15ef60c0`（2人用HTML画面）、`9b54d9f0`（HTML ESM/操作要素の静的回帰3件）。最新のコード・テスト状態を確認する際はPR #1のHEADを必ず再読する。

- **新規UI**：`v2/demo/firebase-online-lab.html`。ホストが5桁ルーム作成、ゲストが番号入力で参加。自席の手札・HP/MP/お金表示、攻撃、防御、祈る、捨てる。開発版限定。GitHub上のファイルプレビューは実際のゲーム配信URLではない。
- **通信**：`v2/firebase-two-seat-transport-fixture.mjs`。`godfieldV2LabRooms/<番号>`というゲーム固有のRTDBルートを使用（小国戦線IIIのルートに非干渉）。ホストだけが既存G2/G3の戦闘状態を持ち、ゲストは`commands/B`へ操作だけ送信。ホストは`views/A`・`views/B`をそれぞれの席専用に更新し、`acks/B`を返す。ルーム番号・ゲスト登録は`transaction`で衝突回避。
- **公式資料・比較**：Firebase Realtime DatabaseのWeb読み書き、transactions、オフライン時の動作、小国戦線IIIの実装を参照。正式な原作再現や独自認証方式の追加は行っていない。
- **CI実測（コード+テストコミット `9b54d9f0c250e9c62a06ee79f85a44e7242c8303`）**：**Node 894/894 PASS** run `40929433535`、**Chromium 28/28 PASS** run `40929433536`、**Playwright WebKit 339/339 PASS** run `40929433726`。オンライン専用の新規結合テストはNode Fake RTDBで6件、HTML構文/要素はNode3件。**実際のオンラインHTMLを2つのSafari画面で通信した試験ではなく、ブラウザ系の339/28は既存オフライン画面の回帰。**
- **資料**：[`docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md`](docs/V2_G6_FIREBASE_TWO_SEAT_LAB_2026-10-30.md)。既存の研究用`v2/demo/standalone.html`とは別ファイル。Nodeテストと原作研究は継続する。
- **主な制約**：実Firebaseへのルーム作成/参加/同期の実接続は**未実施**。学校iPad/iOS Safari/Google Sites実機も未検証。ホストタブが閉じると試合停止（復旧未実装）。Firebase Rules/認証は変更せず、既存DBのアクセス設定に依存。正式カード抽選・原作全カードは未完成。
- **次工程**：開発ブランチをstatic HTTPSで試遊できる状態か確認→実Firebaseで実際に2台のルーム作成、参加、攻撃、防御、再送の動作を検証。Google Sites公開版と`main`は許可なく触らない。WebKit等で新規オンライン画面そのものを目視/タッチ検証する価値が高い。

## 2026-10-30 G6準備｜座席別ローカルホスト＋再送・画面秘匿テスト【現行最新】

- **新コード**：`v2/local-room-host-fixture.mjs`。ホストが1つの権威状態を所有し、信頼済み試験セットアップから座席A/B/Cへ `read()` と `submit(command)` の小さい口を渡す。`submitAndResolveFixture` と `viewStagingRoom` を直接再利用し、既存G2/G3の効果解決・ID再送抑止・revision検査を重複実装しない。相手の手札、乱数、内部効果キュー、真のroom stateを返さない。
- **6件の新規Nodeテスト**：2席で攻撃→防御、他人の手札の非公開、重複送信/再接続、古いrevision・他席なりすまし・同ID別payload、原子的な失敗、初期/投影オブジェクト変更の隔離、3席研究用〈蜃気楼〉順次防御。
- **実コード検証コミット**：`cef8d15e8cad35501fab5b4578db48dbc4f97a09`。GitHub Actions **Node 885/885 PASS**（run `40927755363`）、**Chromium 28/28 PASS**（run `40927755334`）、**Playwright WebKit 339/339 PASS**（run `40927755339`）。V2単体HTML整合性チェックもPASS。後続の文書コミットはこの検証済みコードから内容を変えていない。
- **詳細**：[`docs/V2_G6_SEAT_SCOPED_LOCAL_HOST_2026-10-30.md`](docs/V2_G6_SEAT_SCOPED_LOCAL_HOST_2026-10-30.md)。Firebase公式のRTDB transaction再実行・読み取り権限要件を照合。`connectSeatFixture`は**ローカルの模擬ハンドル**で本人認証ではない。今は通信・Firebase接続・座席の真正確認・正規山札・学校実機試験は未完成。
- **次**：学校で実績のある既存Firebase通信コードを参考に、開発版限定のホスト主導コマンド配送・席別投影同期を少人数向けの簡単な構造で設計する。既存Firebase Rulesを変更したり匿名認証を必須にしない。原作未確認の〈蜃気楼〉複合挙動も引き続き保留。
- **禁止**：`main`へのマージ、学校公開Google Sites/貼り付けHTML、Firebase設定の無断変更。Draft PR #1を維持。

## 2026-10-30 後続レビュー｜蜃気楼ルート履歴の整合性【前の引き継ぎ数値より新しい】

- **最新実コード・配布研究HTML同期コミット**：`c9e6bc89569d8a68eaad434a4fb04b284149fc0d`。開発ブランチのみ。旧節の`1e125f5e`は過去スナップショットであり現行HEADではない。
- **改善内容**：`v2/mirage-target-route.mjs`で、攻撃対象履歴の末尾=現在の防御対象、訪問件数<=解決済み攻撃数+初回対象、攻撃終了時のseed正当性を検証。不正な履歴やseedは元状態を変えず拒否する。ルール・乱数順・ダメージ処理は一切追加しない。`tests/mirage-target-route-v2.test.mjs`に新規2ケースを加えた。
- **CI実測（コードコミット`c9e6bc89`）**：Rules Lab Tests **Node 879/879 PASS** run `40926134294`、Chromium **28/28 PASS** run `40926134316`。Playwright WebKit **339/339 PASS** run `40926134297`。3系統ともコミット`c9e6bc89`で成功。スタンドアロンHTML整合性も確認。実学校iPad試験ではない。
- **調査資料**：[`docs/V2_G3_G7_MIRAGE_ROUTE_INTEGRITY_REVIEW_2026-10-30.md`](docs/V2_G3_G7_MIRAGE_ROUTE_INTEGRITY_REVIEW_2026-10-30.md)。PiongとGFガイド＋αの説明は逐次全体攻撃/複数周回を支持するが、初回対象指定・〈壁〉/反射/弾きの全周回処理は未確定。研究専用ルールセット以外に適用しない。
- **次**：CI（特にWebKit）の最終判定を実測し、3人UIで対象履歴の見せ方をレビュー。原作直接確認なしに仕様を確定しない。正規全カード/山札確率・G6オンライン・学校実機は未完成。**main・Google Sites公開版の更新は禁止。**

## 新チャット最優先｜2026-10-30 引き継ぎ確認済みスナップショット

**ユーザーの発言は「ゴッドフィールドの開発引き継いで」の一言で十分。** このファイルをGitHubから最初に読み、実際のHEADとCIを再確認して、質問を繰り返さずに開発を継続する。

- **リポジトリ**：`8mahi8/party-card-replica`。開発ブランチ：`refactor/v2-foundation-review-20261027`。Draft PR：[`#1`](https://github.com/8mahi8/party-card-replica/pull/1)、base `main`、未マージ。
- **引き継ぎ直前にGitHubで確認したHEAD**：`1e125f5e112bde58ab8e05ee7ed96e1c1dceb621`（文書のみの最終コミット）。このHEADに対して**Rules Lab Tests：Node 877/877 PASS（run `40919746749`）、Chromium 28/28 PASS（run `40919747009`）、Playwright WebKit 339/339 PASS（run `40919746881`）**を実測。V2単体HTMLの決定的再生成も一致。以後のコミットでは必ず新しいHEADを確認。
- **現時点の最新実機相当の試作**：3人研究用ホットシート〈蜃気楼〉UI。1台の390×430埋込でA/B/Cの手札切替・各周回の独立防御・HP/MP/ターンをWebKitでタップ試験。通常2席モードは継続。これは**オフライン研究版**であり、3台オンライン・学校公開・2026本家の忠実な全仕様とは別。
- **必読の最新資料**：[`docs/V2_G3_G7_MIRAGE_3SEAT_HOTSEAT_2026-10-30.md`](docs/V2_G3_G7_MIRAGE_3SEAT_HOTSEAT_2026-10-30.md) → [`docs/V2_G3_G7_MULTIPLAYER_MIRAGE_STAGED_2026-10-30.md`](docs/V2_G3_G7_MULTIPLAYER_MIRAGE_STAGED_2026-10-30.md) → [`docs/SOURCE_LEDGER.md`](docs/SOURCE_LEDGER.md)。コードは`v2/lab-controller.mjs`、`v2/lab-ui.mjs`、`v2/room-transition.mjs`、`v2/staging-room.mjs`、`v2/mirage-target-route.mjs`、`v2/effect-runner.mjs`と対応テストから読む。
- **引き続き未確定の原作仕様**：〈蜃気楼〉最初の対象はプレイヤー指定かランダムか。多人数の〈壁〉・反射・弾きが各攻撃／全周回へどう効くか。公開資料だけで断定しない。**研究ルールセット`mirage-multiplayer-research-fixture-v2`のみ**初回指定という検証用仮定を採用。通常の原作再現ルールへ無断移植しない。
- **残る大きな未完成**：部分研究カード**120種類／309/500参考枠**（参考原作353種類・500枠とは別）。山札は仮の固定補充で正規確率ではない。G6の複数端末オンライン・座席の真正認証／同期は未実装。学校iPad/iOS Safari実機・Google Sites実ページ未検証。
- **次に優先する仕事**：①既存の3人UIのソースとCIをレビュー、②〈蜃気楼〉の初回対象・多人数〈壁〉／反射の原作証拠を集める、③証拠が揃った挙動だけ厳格な効果と回帰テストに取り込む。実機/ブラウザ画面確認を行う場合は「WebKit自動タップ」と「実iPad目視」を厳密に区別。必要なら災い状態機械・追加カードの共通効果基盤へ進める。
- **絶対にしないこと**：ユーザーの明示許可なしに`main`を変更・マージ、学校Google Sites/公開貼付HTMLを更新しない。研究版を完成・原作100%再現・オンライン完成と報告しない。作業終了時は**このファイル冒頭を更新**し、実行したテスト数とコミットSHAをPR #1に残す。
- **履歴と現在地の読み分け**：この下には古い「未配線」「3人UI未実装」「116種／305枠」「Node764件」などの**時点付き履歴節**が残っている。それらを現在地・次の優先事項とみなさない。**最新状態はこの節、直下の最新3人UI節、最新HEADのコードとCIが優先**する。

## 2026-10-30 最新実装：3人〈蜃気楼〉研究用ホットシートUI＋実ブラウザタップ検証

**これが現行最新の開発作業。下記の「多人数〈蜃気楼〉エンジン」節はその前段。3人対戦が本家どおり完成したという意味ではない。**

- **今回の仕様と根拠**：[docs/V2_G3_G7_MIRAGE_3SEAT_HOTSEAT_2026-10-30.md](docs/V2_G3_G7_MIRAGE_3SEAT_HOTSEAT_2026-10-30.md)／[docs/SOURCE_LEDGER.md](docs/SOURCE_LEDGER.md)。[Piong新仕様](https://w.atwiki.jp/piong/pages/20.html)と[GFガイド＋α](https://w.atwiki.jp/gfplusa/pages/19.html)は多人数で1人ずつ処理／蜃気楼複数回の周回を説明。ただし**最初の対象選択が本家で手動なのかランダムなのかは直接未検証**。研究版だけ「最初はP1が指定、その後は未訪問の生存者から乱数抽選」と明示し、UI上でも未確認の仮定と表記。
- **実装**：`v2/lab-controller.mjs`に`loadMirageTrial()`（3人A/B/C、武器+蜃気楼2枚の固定手札、seed7、A MP20、ruleset ID=`mirage-multiplayer-research-fixture-v2`）を追加。`v2/lab-ui.mjs`の初期画面に**「3人〈蜃気楼〉の研究配置で始める」**、P3表示、1/2周・2/2周の防御進捗、実験警告。通常の2人の初期モードはそのまま。初回防御の進捗は`v2/room-transition.mjs`が**支払いとは別のpreview**を作り、`v2/staging-room.mjs`が秘密のカードを出さず投影。進行後は実際の`mirageRoute`を唯一の状態とする。`v2/demo/template.html`に390px幅で3人ステータスが表示できるCSS。**31モジュールの単体`v2/demo/standalone.html`を決定的に再生成。**
- **検証済みコードコミット `366e7c912b0e36f0df41e7181b8c306f42de8c40`**：Node **877/877 PASS** run `40919280332`、Chromium **28/28 PASS** run `40919280277`、Playwright WebKit **339/339 PASS** run `40919280149`。WebKit新規3人タップ試験：390×430埋込画面から研究配置起動、P3/実験免責、初回C指定、BとCが各周回に一度ずつ防御し、HP B23/C21、A MP10、P2の手番移動。スクリーンショットはCIに保存されたがAIが画像を目視したとは主張しない。**学校iPad/iOS Safari/Google Sites実ページは未検証**。
- **新規`tests/mirage-hotseat-ui-v2.test.mjs` 8件**＋WebKit3席タップシナリオ（18チェック増、321→339）。手札非公開・リセットで2席通常ルール復帰・最初の防御の進捗表示を確認。元の多人数研究エンジンの21件＋全体回帰も維持。
- **未完成**：多人数の反射・弾き・〈壁〉の周回挙動は原作確認不足で引き続き操作時に拒否。これは**1台のオフラインホットシート**であり、各自のiPad間オンライン同期はない。最初の対象選択も未確認の研究仮定。原作353種/500参考枠の完全山札ではなく、研究部分台帳120種/309枠、固定補充。G6オンライン・原作完全再現・公開は未完成。
- **次工程**：実機/動画等で〈蜃気楼〉初回対象選択と多人数〈壁〉・反射を確認→仕様を忠実に確定→3人実機表示をユーザー確認→必要なら共通UIとエンジンを統合。予測で未確認動作を原作確定として実装しない。**main・学校公開Google Sitesを絶対に変更しない。Draft PR #1のみ更新。**

## 2026-10-30 最新実装：G3/G7 多人数〈蜃気楼〉の防御→命中→対象移動（研究用ルールセット限定）

**この節が下記「純対象ルーター（未配線）」より新しい。その旧節の「未配線」は過去の進捗であり、現在は限定条件下で配線済み。3人以上の学校向けUIや本番ルールは依然未実装。**

- 出典：Piong奇跡一覧[「新仕様の蜃気楼」](https://w.atwiki.jp/piong/pages/20.html)の「1人ごとに攻撃処理を終えて未訪問生存者からランダムに次を選ぶ」、[GFガイド＋α](https://w.atwiki.jp/gfplusa/pages/19.html)の複数周回。**最初の相手を手動指定するかどうかは実機・一次資料未確認**。今回の研究用ルールセットでは**初回ターゲットだけ攻撃側が指定**という仮定で進め、その後を既存seed RNGで選ぶ。これを原作確認済みと呼ばない。
- **ゲームエンジン実配線**：`v2/mirage-target-route.mjs`に初回対象指定・厳格seedチェックを追加。`v2/ordered-attack.mjs`は明示的な`rulesetId:'mirage-multiplayer-research-fixture-v2'`のときだけ3〜9人で`widenAttack`を許可。`v2/basic-resolution.mjs`の各攻撃に`advanceMirageRoute`最終効果を付け、`v2/effect-runner.mjs`が毎回の防御・HP0/太陽のお守り結果確定後にルート遷移・相手の防御窓再開を**1回のクローン状態トランザクション**で行う。周回終了／全対象脱落後にだけ一度の補充・手番を確定。
- `v2/redirect-resolution.mjs`で**多人数の〈壁〉（手札＋習得済み）と反射/弾きの未確認相互作用は消費前に拒否**。通常防具の数値ガードは維持。`v2/staging-room.mjs`の認証済み公開ビューへ**周回・対象内の攻撃進捗だけ**を表示し、相手の手札やseedは秘匿。
- **新規21 Node実戦シナリオ** `tests/multiplayer-mirage-staged-v2.test.mjs`。3〜9人が順次防御できる、指定初回B/C、2枚で周回、3枚＋のこぶんで**3人合計12発**、9席で合計48発、死者除外、初撃死亡の2発目スキップ、復活、MP一度、全体補充最後、手番一度、異常な攻撃注入・他人の防御・再送・seedと手札秘匿を検証。純ルーターにもseed/初回指定の**1件追加**。後続コミットで`effect-runner.mjs`の`refillSettled`/`advanceSettled`を通常攻撃・多人数攻撃に共通化し重複処理を撤去。
- **V2 HTMLは31モジュールに同期済み**（`v2/demo/standalone.html`）。ただし現行`v2/lab-controller.mjs`/研究UIで多人数ルールセットを選べるようには**していない**。Nodeの研究用コマンドで実験できるが、iPadで3人用の完成UIとして使えるわけではない。
- **検証済み実コードHEAD `5f014d721d1354fc14c1a2141910278a2de63f46`**：Node **868/868 PASS** run `40913389817`、Chromium **28/28 PASS** run `40913389693`。WebKit **321/321 PASS** run `40913389789`も実測。後続の共通終了処理を含むコード `7f6e865d0590566a3bfc5cf545668e99c47bbf22` は **Node868/868 PASS** run `40913910219`。**9席×48発を含む後続コードHEAD `dd3175d55c4fe842bfb57b75b1cdae681efabc1e`** は **Node 869/869 PASS**（run `40914014771`）、**Chromium 28/28 PASS**（run `40914014763`）、**WebKit 321/321 PASS**（run `40914014792`）を実測。WebKitは既存2人用Lab UIの操作回帰であって、今回の研究用3〜9席を画面でタップ検証したわけではない。**mainと学校サイト変更禁止、開発PR #1はDraft。**
- [新しい実装・出典・境界ドキュメント](docs/V2_G3_G7_MULTIPLAYER_MIRAGE_STAGED_2026-10-30.md)、[元の純ルーター研究](docs/V2_G3_G7_MULTIPLAYER_MIRAGE_TARGET_ROUTE_2026-10-30.md)、[原作出典台帳](docs/SOURCE_LEDGER.md)。部分カード研究**120種／309/500参考枠**。正規ランダムドロー・リアルオンラインG6未完成。
- **次工程**：原作の最初の攻撃対象選択を動画/直接プレイで確認、多人数の反射/弾き/〈壁〉の周回計算を検証。研究用3人ホットシートUIと実ブラウザタップテスト。通常・多人数の共通終了処理を維持し、今後追加する全体攻撃と災い状態機械にも共有する。原作確認前に一般ルールセットへ移植しない。

## 2026-10-30 最新実装：G3/G7 多人数〈蜃気楼〉の逐次ランダム対象ルーター（未配線）

**この節が下記の1対1〈蜃気楼〉完了スナップショットより新しい。実戦への接続はまだ。**

- 参照：[Piong奇跡一覧・新仕様](https://w.atwiki.jp/piong/pages/20.html)と[GFガイド＋α](https://w.atwiki.jp/gfplusa/pages/19.html)。〈蜃気楼〉の多人数戦は**1人への攻撃処理が終わるごとに、まだ対象にしていない生存者をランダムに選ぶ**という記述。単純に全員のHPを同時減算すると、個別の防御・復活・反射・脱落・RNGを破壊する。**原作直接実機検証ではなく二次資料**。
- **実装：`v2/mirage-target-route.mjs`新規**。2〜9席・1〜3周・武器の1〜2発・初期生存対象をもとに、既存の`drawRandom32`でランダム抽選し、同じ周回では未訪問の生存者だけを候補にする純関数`beginMirageTargetRouteFixture`、`advanceMirageTargetRouteFixture`を追加。攻撃後のHPを受け取り、各人の復活・死亡、同一対象の2発目、攻撃元が反射で死亡した場合、全対象脱落、最大9人×3周×2発＝48命中まで有限に表現。入力の状態は変更せず、乱数消費を遷移結果に記録。
- **新規22 Nodeケース** `tests/mirage-target-route-v2.test.mjs`。シード決定論、訪問重複なし、1/2/3周、反射・復活の**結果HPを受け取った後**の分岐、死者除外、偽造ルート、座席入れ替え、不正型、最大48発を検証。
- **V2開発用単体HTMLは31モジュール**。`v2/demo/build.mjs`に追加し、`v2/demo/standalone.html`を再生成。WebKit／Chromium CIがコードに手で埋め込んだ旧番号を参照しないことも維持。
- **検証済みコミット`446e42ee48094c93a1ee588421a276dd2442e0fd`：Node847/847成功**（run `40910663072`）、Chromium28/28（run `40910663051`）、WebKit321/321（run `40910663038`）を実測。後続の**31モジュールビルドHEAD `997831044bf37650ec79d93666c5e8e9f5cd4a5d`**：Node847/847（run `40911087451`）・Chromium28/28（run `40911087330`）成功。**WebKit 321/321 PASS（run `40911087803`）も実測済み**。31モジュールの単体HTML再生成チェックも一致。
- [詳細な原作照合・22テスト・不明点・次の接続案](docs/V2_G3_G7_MULTIPLAYER_MIRAGE_TARGET_ROUTE_2026-10-30.md)、[SOURCE_LEDGER](docs/SOURCE_LEDGER.md)。
- **最重要の残作業**：〈蜃気楼〉初回対象はランダムかユーザー指定か確認が必要。反射・弾き・〈壁〉・途中脱落時の攻撃対象進行も実本家か十分な資料で照合。**現在`v2/ordered-attack.mjs`は3人以上の〈蜃気楼〉攻撃を引き続き拒否**、新ルーターは`room-transition`／`effect-runner`の対戦経路へ未配線。ユーザーが学校で遊べる3人戦になったと誤報しない。main・Google Sites公開版変更なし、PR #1 Draft。
- **次**：最初の対象決定の原作検証→多人数の毎回`defense`を開く権限／再送設計→`effect-runner`が命中解決後に純ルーターを呼び同一トランザクションでRNGと次のターゲットを保存→3〜9人ブラウザ/通信実機テスト→〈壁〉多段停止タイミング→災いの状態機械→カード/オンラインG6。

## 2026-10-30 最新実装：G3/G7〈蜃気楼〉・複数周回（1対1限定）

**この節がのこぶんぶん実装の節より新しい。旧節の数値は実行当時のスナップショットであり現行の完成度ではない。**

- [詳細な原作出典・実装境界・検証](docs/V2_G3_G7_MIRAGE_2026-10-30.md)、[SOURCE_LEDGER](docs/SOURCE_LEDGER.md)。Piong/GFガイド＋α/まかろん2026/のこぶん2026/2023実戦記事で、〈蜃気楼〉MP5・0.2%・1枚は全体攻撃化、2枚は2回、3枚は3回、〈のこぶんぶん〉と2枚で4回／3枚で6回を照合。二次資料であり、今の本家を実機操作した一次検証とは区別。
- **追加カードm012〈蜃気楼〉**。部分研究リストは**120種類／309/500参考枠**。原作正規山札はまだ未完成。
- `v2/foundation.mjs`に型付き`widenAttack({mode:'allLiving'})`を追加、`legacy-adapter.mjs`で厳密変換。`ordered-attack.mjs`で〈のこぶんぶん〉の`repeatAttack(count:2)`と1〜3枚の蜃気楼回数を合成、`hitCount`を1〜6に拡張。`basic-resolution.mjs`／`effect-runner.mjs`で**1発ごとに独立防御・攻撃元・HP0・反射判定、支払い1回、補充は最終後**。`redirect-resolution.mjs`で元ターゲットを保持し、`staging-room.mjs`／`lab-ui.mjs`で「2/4発目」等を表示。単体HTMLを旧/V2双方更新済み。
- **2人ルームのみ**。3人以上は全員への周回ターゲット順が確定せず明示拒否。〈壁〉で複数攻撃の全体/1発どちらが止まるか不明のため従来どおりfail-closed。ワンド/オーラ/他奇跡との組合せも未確認は拒否。**公開版や本物の原作の全体攻撃を完成したとみなさない。**
- `tests/mirage-sweep-v2.test.mjs`**新規18 Nodeケース**。物理カード2〜3枚、習得済み1回＋物理カード1回、ノコブン4/6回、無属性化、各発防御、支払・補充、初撃致死、反射、認証と不正入力を検証。`tests/v2-webkit-smoke.browser.mjs`**新規10タップチェック**で390×430枠のノコブン＋蜃気楼2枚・防具の選択・2/4→3/4→4/4・手番交代を試験。
- **コードHEAD `04c71793b54315397d2d0d82db7ccde9b35a270d`** のCI：Node **823/823** run `40908596777`、Chromium **28/28** run `40908597067`、WebKit **321/321** run `40908596808` を実測。続く習得済み＋物理カード混合の2件と不正検証を追加し、**`69cc50eadae16a64d4a92990af5d8192eed73b93`でNode **825/825 PASS** run `40909195852`**。後者の**Chromium 28/28 PASS（run `40909195887`）、WebKit 321/321 PASS（run `40909196030`）**も実測済み。以降の文書のみのHEADのCIは別途確認すること。ブラウザ結果はLinux環境で、学校iPad実機とGoogle Sites実ページは未検証。
- 次：**多人数の〈蜃気楼〉**を実装するには「全体攻撃を各生存プレイヤーが個別防御する」ラウンド/ターゲット配列が必要。〈壁〉が多段の何を止めるかはまず現行原作で検証。続いて災い状態機械と多種類カード、そして無料オンラインG6。**main/学校サイトは変更禁止**、Draft PR #1の開発branchのみ更新。

## 2026-10-30 最新実装：G3/G7 のこぶんぶん・2回命中と2回防御

**この節が2026-10-30の前段HP吸収より新しい。以降の旧数値・古い未実装説明は過去スナップショットとして読む。**

- 原作参照資料：Piong/Macaronで`のこぶんぶん`攻3・¥10・0.2%・2回攻撃。2023攻略で**追加武器は2発とも乗る**、2026攻略で**防御を分ける**、2025プレイヤー記録で**一連の処理終了後の手札補充、各命中HP0判定**を確認。直接原作クライアントではなく公開二次資料。
- `src/verified-basic-cards.mjs`に`w050`、`v2/foundation.mjs`/`legacy-adapter.mjs`に型付き`repeatAttack(count:2)`、`ordered-attack.mjs`に`hitCount`、`basic-resolution.mjs`/`effect-runner.mjs`に**初撃後に防御窓を再開する`continueStrike`**を追加。二発目の反射/弾きも元攻撃対象の復元も対応。`staging-room.mjs`公開ビュー／`lab-ui.mjs`に**「2/2発目」**を追加。元攻撃のカード支払1回、補充は最後1回。攻撃名ベタ分岐や攻撃値単純2倍ではない。
- **部分研究台帳119種類／308/500参考枠**。原作全353種類／500参考枠は未登録であり、まだ正規ドロー不可。
- `tests/repeat-hit-weapon-v2.test.mjs`に**17回帰**を追加。初撃致死で2撃目を中止、太陽のお守りで復活すれば再開、1発目・2発目の反射、自己弾き、分割防御、再送、手札秘匿・不正な効果注入など確認。
- **実コードHEAD `787882f78c6b6c7c25bc4cbb0c02bb1a926da915`** のCIを実測：**Node 807/807 PASS** run `40906968565`、**Chromium 28/28 PASS** run `40906968897`、**Playwright WebKit 311/311 PASS** run `40906968937`。WebKitの390×430固定iframeで新規8チェックを加え、本体＋追加武器の2発独立精算・2/2表記を実際のタップで検証。スクリーンショットはCIに保存されたがAIが画像を目視したとは主張しない。iOS Safari／Google Sites実機は未検証。
- **設計・出典・残る未確認**：[docs/V2_G3_G7_REPEAT_HIT_2026-10-30.md](docs/V2_G3_G7_REPEAT_HIT_2026-10-30.md)／[docs/SOURCE_LEDGER.md](docs/SOURCE_LEDGER.md)。**〈壁〉で何発止めるか、〈蜃気楼〉全組合せ、自己への2回攻撃、特殊スタック**は原作照合不足のため現段階でfail-closed。実装時に推測で上書きしないこと。
- **次の優先**：〈蜃気楼〉/〈壁〉と2回攻撃の正確な原作の処理順を調査→共通の複数命中効果をG3へ拡張→災いの状態機械→残りの原作カード／オンラインG6。オンライン対戦、学校のiPad・Google Sites実ページ、正規抽選は依然未完成。main と公開学校サイトは変えず、Draft PR #1継続。

## 2026-10-30 最新実装：G3/G7 HP吸収の共通エンジン

**作業の入口をここに更新（この節が2026-10-29の旧スナップショットより新しい）。**

- 実コード：`v2/foundation.mjs`の型付き`afterHit/absorbHp`、`v2/legacy-adapter.mjs`、`v2/ordered-attack.mjs`、`v2/basic-resolution.mjs`、`v2/effect-runner.mjs`に共通のHP吸収を接続。命中後のHPを回復し、反射／弾きで変わった**現在の攻撃元**だけが吸収。自己吸収で一瞬HP0になってもお守りは使わない。
- 原作資料を照合した`w048`**ゴーストソード（攻7）**、`w049`**リアルゴーストソード（攻12）**を追加。**部分研究台帳は118種類／307参考枠**に拡張。全353種類／500枠の正規山札ではない。
- [原作資料・処理順・制限・テスト](docs/V2_G3_G7_ABSORB_HP_2026-10-30.md)。二次資料のHP1→自己攻12→HP12、HP99上限、防具での軽減、反射の攻撃元、オーバーキルを根拠としている。現行2026年本家の直接プレイ検証ではない。
- 新規`tests/lifesteal-weapon-v2.test.mjs`**14件**。従来の境界契約12件も維持。**Node 790/790 PASS**（実コードHEAD`8081881902`、run`40904084895`）、**Chromium 28/28 PASS**（run`40904085019`）、**WebKit 295/295 PASS**（run`40904085055`）。両単体HTMLを再生成し、V2は**30モジュール**。Google Sites本番・iPad実機試験ではない。
- `tests/v2-webkit-smoke.browser.mjs`に**新カードのタップ操作8チェック**を追加（命中・防具・反射の390×430固定iframe）。実コードHEAD `6f2930e01214830f5d610480e9c92a8722996812` のCIで **Node 790/790**（run 40904686686）・**Chromium 28/28**（run 40904686835）・**WebKit 303/303**（run 40904686620）の全成功を確認。画面試験はLinuxブラウザで学校のiPad実機ではない。後続の文書のみのコミットのHEADは必要なら改めてCIを確認する。
- **今後のG3/G7**：新WebKit追加8件のCI→吸収奇跡と物理＋奇跡の処理順→2回攻撃の複数命中キュー→災い状態機械→カード全体。**他人への致死吸収＋太陽のお守りの処理順は未確認のため拒否継続。** 自己吸収とは別。
- 既存G4（取引／夢）とG6（無料オンライン）の未完成範囲は維持。main・学校Google Sitesは変更禁止、Draft PR #1継続。学校iPad試験前に研究用ホットシートを公開用と呼ばない。

## 2026-10-30 引き継ぎ後の最新差分：G3/G7命中境界契約

- 今回のGitHub開発branch更新：`v2/hit-outcome-boundary.mjs`、`tests/hit-outcome-boundary-v2.test.mjs`（**新規12ケース**）、[設計・出典・未解決事項](docs/V2_G3_G7_POST_HIT_EFFECT_BOUNDARY_2026-10-30.md)。
- **重要：これは純関数の境界レビューであり、HP吸収・複数回攻撃・災い付与の実カードをプレイできる状態にはまだしていない。** 116種類/305参考枠、29モジュールの研究用単体HTML、同端末ホットシートという基本状態は不変。
- `damage`と実際の`hpLost`を分離し、0ダメージ、通常命中、オーバーキル、闇の即死、HP0後の復活を区別。無効なHP算術や壊れた入力は拒否。既存の`effect-runner`には未配線なので公開/研究画面の挙動を変更しない。
- 次は**原作の特殊ケースの出典照合→物理カードIDと最終命中イベントを紐付けた一度きりの`afterHit`キュー実装→最小のHP吸収カード→反射・復活・再送の回帰→二回攻撃→災い状態機械**の順。単純なダメージ2倍、0ダメージで災い付与、オーバーキルを無検証のままHP回復量に流用する実装は禁止。
- 2026-10-30の最初の実装コミット：`5165a3ec67dc2ffdbd15da1bc71b239376b9569a`、テスト追加：`72f4d08a237fc722556010c536a9161a0ec7a072`、設計資料：`28d94d3a0d6a59ab86c39b18a1b09bcb555b8f73`。**新HEADのNode/Chrome/WebKit結果はActionsで別途確認すること**。下に記載の764/28/295は2026-10-29検証済みの旧スナップショットであり新HEADの実測と混同しない。
- main/学校Google Sites公開版は未変更、PR #1はDraft。学校iPad Safari・オンライン試験は未実施。

## 0. GitHub上の唯一の入口と最初の操作

- **Repository**：https://github.com/8mahi8/party-card-replica
- **開発branch**：`refactor/v2-foundation-review-20261027`
- **Draft PR #1**：https://github.com/8mahi8/party-card-replica/pull/1
- **固定引き継ぎURL（必ず branch を指定する）**：
  https://github.com/8mahi8/party-card-replica/blob/refactor/v2-foundation-review-20261027/HANDOFF_LATEST.md
- PRは **Draft** のまま、base は **main**。**mainと学校のGoogle Sites公開版は本人の明示許可なく絶対に変更しない**。作業は上記既存開発branchにコミットする。
- 引き継ぎ確認時は **(1) このファイル (2) PR #1の最新HEADと最新コメント (3) src/v2/tests/docsの実ファイル (4) HEADのGitHub Actions** を順番に確認する。古いREADMEの「77種類」「318件」などは**当時の履歴**であり、最新版ではない。
- 当面の作業は独立した原作再現 **V2エンジン／研究用ホットシート**。旧`src/match.mjs`や`demo/`は参考・互換維持用。旧デモと新V2を無計画に結合しない。
- ユーザーの「任した／任せた」は**資料調査→設計→実装→テスト→レビュー→GitHub開発branchへ保存**の自律進行許可。細かな許可は毎回尋ねない。**公開版変更は別途明示許可が必要**。

## 1. 最重要の完成目標と非目標

- **目標**：学校のiPad（Safari）で友達と遊べる、原作『ゴッドフィールド』の対人戦を可能な限り**忠実に再現**した、無料のブラウザゲーム。まず原作の挙動を再現し、勝手なゲームバランス調整や独自ルールを入れない。
- UIはiPadの短い埋め込み枠でもカード選択・確認・防御が少ないタップでできること。ゲーム中に音声は不要。
- **学校配布方式**：Google Sitesへ**単体HTML/CSS/JSのコードを直接貼る**。GitHub Pagesを学校用の埋め込み方式と混同しない。公開版は今も未更新。
- 現在の`v2/demo/standalone.html`は**同じ端末でP1/P2が交代**する検証版。**2台オンライン1vs1、本家全カード、原作出現率、BOT、原作クライアントそのものの動作証明、学校iPad実機検証は未完成**。完成と称しない。
- 学校iPadでの外部認証や通信方式を決めつけない。オンライン化するときは過去の学校での匿名認証問題を考慮し、接続方式・真正性・相手の手札秘匿・再送対策を分けて設計する。

## 2. 引き継ぎ時点の検証済みスナップショット

**実装コードの検証済みHEAD（この引き継ぎ文作成前）**：`cfa20f39a698894594ac8158c235cd76658bd348`

| 項目 | 2026-10-29確認結果 |
| --- | --- |
| 参照済み研究用カード | **116種類**（以前の94種類に通常16＋追加6を登録） |
| 研究表ウェイト合計 | **305/500参考枠**。353種類／500枠は別版の参照分布であり、未達 |
| Node Rules Lab（GitHub Actions） | **764/764 PASS**、run **40887491871** |
| Chromium 実ブラウザ | **28/28 PASS**、run **40887491875** |
| Playwright WebKit 実タップ | **295/295 PASS**、run **40887491901** |
| V2単体HTML | **29モジュール**、チェックインした`v2/demo/standalone.html`とビルダー出力が一致 |
| 学校iPad Safari・Google Sites実ページ・2台オンライン | **未検証／未実装** |
| mainと学校公開版 | **変更なし** |

**注意**：この引き継ぎファイル自体やREADMEのコミットでPR HEADが変わる。**コードのテストを証明したSHAは上記**。新しいAIは必ず最新HEADのCIを確認し、資料更新後のCIも必要に応じて確認する。

### 実行・確認

```sh
npm test
node v2/demo/build.mjs --check
# 必要ならデモ再生成
node v2/demo/build.mjs
# 実ブラウザ・WebKitは専用GitHub Actionsのrunと証拠画像を確認
```

実ブラウザはデスクトップLinux上の Chromium／Playwright WebKit、**1024×460と390×430の固定iframe**等を使用。**iOS Safari・Google Sitesそのものではない**。画面検証は実際のスクリーンショットも目で見て、ボタン重なり・文字潰れ・エラー表示を評価する。

## 3. まず確認すべき実コードと証拠

| ファイル | 役割 |
| --- | --- |
| [src/verified-basic-cards.mjs](src/verified-basic-cards.mjs) | **116種類の部分研究カード**。名前・攻・守・価格・属性・参考重み。正規山札ではない |
| [tests/helpers/research-catalog-contract.mjs](tests/helpers/research-catalog-contract.mjs) | 部分台帳の独立スナップショット **116種類/305参考枠** |
| [src/catalog-audit.mjs](src/catalog-audit.mjs) | 原作参照版の353種／500枠／カテゴリ・属性別マトリクス監査。部分山札からの**本番抽選を拒否** |
| [v2/foundation.mjs](v2/foundation.mjs) | 凍結されたカード定義、真の物理カード個体ID、効果タグ、決定的PRNG |
| [v2/legacy-adapter.mjs](v2/legacy-adapter.mjs) | 旧カードデータから共通V2定義へ移行。新カードは既存factory/アダプタを再利用 |
| [v2/staging-room.mjs](v2/staging-room.mjs) | ターン、攻撃・防御・売買、seat認証、revision、手札のプレイヤー別投影 |
| [v2/room-transition.mjs](v2/room-transition.mjs) | 原子的な操作受付→解決への共通入口 |
| [v2/effect-runner.mjs](v2/effect-runner.mjs) | ダメージ、消費、復活、補充、移動、手番前進をイベントキューとして解決 |
| [v2/ordered-attack.mjs](v2/ordered-attack.mjs)、[v2/basic-resolution.mjs](v2/basic-resolution.mjs) | 選択順、攻・防のルール、複数枚処理 |
| [v2/dream-appearance.mjs](v2/dream-appearance.mjs) | **夢の見た目と本物のカードの分離**、本物の所有権・相手への秘密維持、売買時の真偽確定 |
| [v2/dream-candidate-audit.mjs](v2/dream-candidate-audit.mjs) | 原作で明記された夢の免疫例外と研究用の保守的グループ。**確率抽選はしない** |
| [v2/zero-hp-recovery.mjs](v2/zero-hp-recovery.mjs) | HP0時の太陽のお守りによる自動復活の一部 |
| [v2/trade-self-sale.mjs](v2/trade-self-sale.mjs)、[v2/staged-sale.mjs](v2/staged-sale.mjs)、[v2/staged-buy.mjs](v2/staged-buy.mjs) | 「売る／自分に売る／買う／両替」の研究版処理・不明な致死処理のガード |
| [v2/lab-controller.mjs](v2/lab-controller.mjs)、[v2/lab-ui.mjs](v2/lab-ui.mjs) | 研究用ホットシートの状態とタップUI |
| [v2/demo/template.html](v2/demo/template.html)、[v2/demo/build.mjs](v2/demo/build.mjs)、[v2/demo/standalone.html](v2/demo/standalone.html) | Google Sites型の短いiframeでも動く外部依存なしの研究用単体HTML。**学校公開用ではない** |
| [tests/v2-webkit-smoke.browser.mjs](tests/v2-webkit-smoke.browser.mjs)／[tests/v2-browser-smoke.browser.mjs](tests/v2-browser-smoke.browser.mjs) | WebKit実タップ／Chromiumクリック、スクリーンショット証拠 |
| [docs/SOURCE_LEDGER.md](docs/SOURCE_LEDGER.md) | 研究時に裏付けた外部資料、**撤回した主張、未確認の仕様**。採用前に必読 |

## 4. ロードマップと実際の現在地

- **G1カード定義**：部分台帳の共通定義とレガシー移行、出典監査済み。**116種／305参考枠にとどまる**。
- **G2共通状態・秘密・認証済みコマンド**：card instance ID、revision、command ID、プレイヤー別手札投影を研究用に整備。オンラインの本番サーバー認証は未完成。
- **G3通常戦闘／奇跡／効果共通化**：攻撃・防御・追加武器・属性、壁／氷／闇／オーラ／火の玉／流星／乱気流など、スカイ・月光・エンゼル、虹・精霊、反射・弾く、選択順とMP/補充を**確認済みの組み合わせに限定して**実装。全カードの特殊効果は未実装。
- **G4売買・特殊状態**：売る／自分に売る、買うの反射なし取引、両替、HP0のお守り、夢の見た目と真のカードの分離・売買移動・免疫候補監査が**研究版で進行中**。正規夢抽選や全災いではない。
- **G5研究用タッチUI**：同端末ホットシート、短いembed内の独立手札スクロール、重ならない確定ボタン、操作エラー表示を実装。**学校公開不可の研究画面**。
- **G6無料オンライン1vs1**：**未実装**。部屋、サーバー権威、プレイヤー識別、匿名認証を要するか、通信断・再送・revision同期、手札秘匿が必要。
- **G7全カード・正規出現率**：**未完成**。全353種・500枠は照合対象の参照版であり、2026現行版と常に同一と仮定しない。部分台帳を**正規抽選・夢の50%偽表示抽選へ流用しない**。

### 直近で完了した作業：特殊効果なし武器22種

- **資料**：[V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md](docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md)
- [Piong 2026-03-18](https://w.atwiki.jp/piong/pages/15.html) と [GFGA 2024-06-17](https://w.atwiki.jp/gfplusa/pages/18.html) の2資料の**攻・価格・属性・参考重みが一致するものだけ**を登録。
- **通常武器16種**：`w032-w047`、**追加武器6種**：`a016-a021`。
- 専用の名前判定を作らず、共通の`main`／`add` factory と既存攻撃エンジンにデータ追加。22カード個別の確認、追加武器の複合攻撃、部分デッキの抽選拒否、WebKitタップも検証。
- 研究台帳は`94/270 → 116/305`へ。**Node 764/764、Chromium 28/28、WebKit 295/295合格**。
- **未採用**：HP吸収、複数回攻撃、災い付与、MP比例攻撃など本体効果が未実装のカード。原作と異なる「数値だけ武器」に落とすのは禁止。
- **資料の相違**：`木刀／竹ヤリ`、`エンゼルナイフ攻11／攻9`など。証拠なしに片方へ上書きしない。

## 5. 2026-10-29時点の旧計画（履歴資料・最新タスクではない）

**現在のボトルネックは「数値だけで表せない特殊効果の共通処理」であり、G7の数値武器を機械的に増やすだけでは本家には近づかない。次はその基盤を優先。**

1. **G7/G3共通「命中後効果」の設計レビュー**：既存の`v2/effect-runner.mjs`、`v2/basic-resolution.mjs`、`v2/ordered-attack.mjs`、`v2/foundation.mjs`、`v2/room-transition.mjs`、関連テストを読んで、カード個体消費・防御・反射・命中・HP0・復活・補充の**1回だけ実行される境界**を確認する。設計文書を残す。
2. **外部資料で1種類ずつ効果を照合**：HP吸収（ゴーストソード系）、複数回攻撃（のこぶんぶん）、災い付与（地獄のハサミ等）を候補とする。ただし**正確な処理順と例外が不明ならすぐゲームロジックへ組み込まない**。
3. **名前分岐ではなくデータ駆動の効果**：`onHit`／`afterHit`等の型付き効果、結果イベント、再入時に二重発動しないための制約を設計。まず原作で裏付けた限定ケースと安全な架空fixtureで自動テストを作る。新しい共通カード定義へ効果タグを追加してから実カードを収録する。
4. **既存処理の回帰**：通常武器＋追加武器、属性、反射・弾く、奇跡、スーパーミラー、太陽のお守り、夢のprivate見た目、18枚押し出し、同時リクエストとrevisionを壊さない。可能な限り**同コスト帯以外も含む戦闘ケース**で確認。
5. **UI/CI検証**：研究画面を壊さず、必要なら`node v2/demo/build.mjs`で単体HTMLを再生成。Node/Chromium/WebKitの**新HEADの実測結果**とスクリーンショットを確認し、資料とPRへ保存する。
6. **並行して残カード調査**：特殊効果のない数値カードを追加する場合も、出典と版差を記録。部分台帳のsnapshotと夢の監査テストを更新。**500枠を埋めるために不明値を作らない**。
7. **G4の未解決難所は保留を維持**：致死「売る」時の売り手入金額・HP0復活・商品移動・補充順、「買う」へのスーパーミラー反射の最終処理、夢の正規抽選と治療、特殊防御複合優先順位。第三者資料の矛盾・未確認を都合よく確定しない。

### 手を出さないこと

- 本人の許可なしに**mainへpush/PRマージ、学校Google Sites配布HTMLの更新、学校公開の切替**をしない。
- 研究用の`fixtureDrawDefinitionId:'d001'`（革の帽子固定補充）を正規抽選だと表示しない。
- UI試験用の暗黙のセキュリティをオンラインの本人認証とみなさない。
- 資料にない仕様・数値・「本家を実際に操作した」などの証拠を作らない。
- 原作画像・ロゴ等の流用を避ける。再現するのは**ゲームルール**で、配布用の見た目は独自素材。

## 6. 次のAIの実務手順と報告形式

ユーザーが新チャットで**「ゴッドフィールドの開発引き継いで」**と言ったら、次の行動を順に実施し、そのまま新しい開発に進む。

1. GitHubコネクタから`8mahi8/party-card-replica`の**Draft PR #1と開発branch HEAD**を取得し、この`HANDOFF_LATEST.md`を読む。チャットの古い記憶よりGitHub実ファイルを優先。
2. `docs/SOURCE_LEDGER.md`、最新の`docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md`、`docs/V2_G4_DREAM_CANDIDATE_CLASSIFICATION_2026-10-29.md`、`docs/ARCHITECTURE_V2_PLAN_2026-10-27.md`、CIと未確認仕様を確認。
3. **何をしたか、どこまでできているか、次に何をするか**をユーザーに簡潔に説明。古いREADMEの過去の成功件数に惑わされない。
4. 原作の外部資料とコードの両方を確認し、**実装→テスト→GitHub開発branchへ保存**まで実施。ユーザーの「任した」に対して毎回設計確認を要求しない。
5. 最後に現在のロードマップ上の工程、今回の差分、テストの**正確な数値と成功／失敗**、コミットSHA、次工程を報告。学校実機確認は行われていなければ未実施と明記する。
6. 作業の終わりに**このファイルを必要に応じて最新版に更新**。GitHubのREADME冒頭とPR #1からここへのリンクは維持する。過去の長大なチャットがなくても次の担当へ引き継がせる。

### すぐ参照する正規リンク

- [GitHub repository](https://github.com/8mahi8/party-card-replica)
- [Draft PR #1](https://github.com/8mahi8/party-card-replica/pull/1)
- [最新の原作調査・採否一覧](docs/SOURCE_LEDGER.md)
- [直近22武器の実装・資料差異](docs/V2_G7_VANILLA_WEAPON_INTAKE_2026-10-29.md)
- [夢の分類と免疫例外](docs/V2_G4_DREAM_CANDIDATE_CLASSIFICATION_2026-10-29.md)
- [初期V2アーキテクチャ](docs/ARCHITECTURE_V2_PLAN_2026-10-27.md)
- [旧いロードマップ（**日付・数量は古い**）](docs/NEXT_STEPS.md)

**以後の恒久ルール：この固定ファイルを最新版に更新し続ける。古い handoff 名の増殖やチャット依存の引き継ぎはしない。**
