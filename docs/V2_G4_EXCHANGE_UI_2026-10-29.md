# G4｜「両替」の共通処理と研究用タッチUI（2026-10-29）

## 目的

原作『ゴッドフィールド』の取引３種類「売る」「買う」「両替」のうち、原作資料で十分に裏付けられた**自分のHP/MP/所持金を1:1で再配分する部分**をV2ラボに追加した。未解明の「買う」スーパーミラー反射はこの実装と混同せず、引き続き未実装のまま。

### 外部根拠

- [2026-02-28・まかろんの神器一覧](https://macarongamemo.com/entry/godfield-artifact)：両替の価格 **¥5**、出現率 **4.0%**（参考500枠の20個相当）、HP・MP・¥を自由に振り分ける。
- [アニヲタWikiの取引説明](https://w.atwiki.jp/aniwotawiki/pages/47010.html)：HP1=MP1=¥1。
- [初心者向けゲーム説明](https://godfield-beginner.game-info.wiki/)：両替では自分のHP、MP、所持金を任意に再配分できる。
- [2013年実戦説明](https://ameblo.jp/rinnka-111/entry-11631499310.html)：HP10/MP20/¥10をHP15/MP10/¥15へ振り替える具体例。
- [ゴッドフィールドwiki・守護神の挙動](https://w.atwiki.jp/piong/pages/27.html)：自動操作された「両替」ではHP0になる場合がある。ただし**手動操作でHP0を確定できるか**の直接資料としては不十分。LABではmanual HP0を保留。

これらは第三者の二次資料であり、2026年現行ブラウザの操作動画・DOM/APIトレースではない。**研究版UIの入力欄やレイアウトを原作そのものの再現とは主張しない**。

## 実装の内容

- `src/verified-basic-cards.mjs`：`t003 両替`、価格¥5・参考20枠を登録。研究用部分カード台帳は **93種類／269参考枠**。原作全353種類・500枠は未完成なので、この台帳で本番抽選を作らない。
- `v2/foundation.mjs`・`v2/legacy-adapter.mjs`：固有カード名を参照せず`onDeclare reallocateResources(kind=exchange)`という一般効果データへ変換。
- `v2/trade-exchange.mjs`：`previewExchangeFixture(before,allocation)`。各プールは非負の**安全な整数**、3項目のみ許可。手動HP0、負値、小数、合計の変化、53bit超過を拒否。総量は厳密に保存。純関数で呼び出し元状態を変えない。
- `v2/staging-room.mjs`：`exchange`コマンドを既存の`authorizedSeatId`認証、revision、`commandId`再送と一緒に処理。**自分の手番で手元にある本物の両替カード個体**のみ使用可能。値の順番に依存しない正規化したフィンガープリント。相手への防御機会を勝手に発生させない。
- `v2/effect-runner.mjs`・`v2/room-transition.mjs`：共通エンジンで `spend`→`exchange`→`refill`→`advance`。元の実手札にある両替の個体IDとpendingを再検証し、状態をコピーして**原子的に**変更。1枚消費して固定の研究カードを1枚補充。
- `v2/lab-controller.mjs`：`loadExchangeTrial()`（P1:両替と革の帽子、P2:アイアンアーマーとスーパーミラー）。UIの配分案は不正操作に失敗しても保持し、再入力できる。試合の公開画面に相手の手札や内部RNGは出さない。
- `v2/lab-ui.mjs`・`v2/demo/template.html`：研究開始、HP/MP/¥の３つの数値入力、合計の説明、両替確定ボタン。390×430px固定iframeで入力欄と固定アクションバーが重ならないことを実タップテストで検証。値が無効なときは手番不変のまま説明を表示。
- `v2/demo/standalone.html`（24モジュール）と旧`demo/standalone.html`をソースから再生成。**mainや公開Google Sites版は変更しない**。
- `tests/trade-exchange-v2.test.mjs`（15件）と`tests/trade-exchange-ui-v2.test.mjs`（7件）：配分保存、最大整数、zeroHP、偽物の取引カード、無認証、二重送信、18枚、3人戦、private view、通常モードへの復帰など。
- `tests/v2-webkit-smoke.browser.mjs`：390×430px固定iframeでの「両替研究モード開始→手札を開く→両替選択→合計不一致の拒否→修正→確定→P2へ手番交代」の実タップ自動テスト。HP/MP/¥、カード枚数、入力欄の座標、スクリーンショットを検証。

## 制限と次工程

- **manual HP0**は本家の仕様を確定できていないため、LABで意図的に拒否。ランダム操作でHP0になる証言を手動操作の確定仕様として流用しない。
- 固定`d001`補充／研究用乱数／オフライン交代制。原作の完全出現率、スーパーミラーの「買う」反射結果、実オンライン通信は未完成。
- Linux Playwright WebKitを使う検証は学校iPad実機Safari／Google Sites埋め込みの直接確認とは異なる。
- 次はG4で残る未解明取引（致死売買・多重ミラー・自己売買）を原作実操作／高品質資料で特定してから追加。非取引効果のエンジンも並行して拡張可能。

## 検証

最終HEADのNode/Chromium/WebKitの結果は[Draft PR #1](https://github.com/8mahi8/party-card-replica/pull/1)へ追記する。**テストが成功するまで学校公開版に入れない。**
