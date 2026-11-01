# G7｜奇跡〈霧〉の2席オンライン再現（2026-11-02）

## 原作研究と適用範囲

2026年9月更新の [Piong・災い一覧](https://w.atwiki.jp/piong/pages/23.html)、[奇跡表](https://w.atwiki.jp/piong/pages/20.html)、2026年2月版 [まかろん神器一覧](https://macarongamemo.com/entry/godfield-artifact) と [初心者向け解説](https://godfield-beginner.game-info.wiki/) の一致事項：

- 〈霧〉= **水属性、MP3、参考0.2%、対象へ霧を付与**。HPへの直接ダメージはない。
- 霧状態の本人からは**相手のHP/MP/お金が見えない**（自分のステータスは見える）。
- 原作の**3人以上**では相手個別の選択を行えず、「自分／相手」指定で相手はランダム。研究ゲーム本体の通常モードは**2席**なので、今回は2席の確定対象のみ実装。多人数で霧を唱える経路は明示的に拒否し、勝手なランダム選定に置き換えない。
- 霧は**軽度の災い**で、〈音色〉〈歌声〉、スマイル／ハートの貝がらで解除。ターン経過で勝手に消えない。
- 霧の本家は他者の一部雑貨使用や両替の情報も隠す。現行2人研究版は既に自分用雑貨を相手に表示しないケースが多いが、**全ての非公開操作／多人数戦の完全再現は未検証**。

## 実装（元のエンジンを再利用）

1. `src/verified-basic-cards.mjs` に **`m020`〈霧〉**（水属性/MP3/0.2%参考枠1）登録。`v2/legacy-adapter.mjs` は既存の型付き `onDeclare:inflictAffliction({affliction:'mist'})` を安全に登録する。風邪などの病4段階の実装を改変せず、従来の `flash` と同じ非病系状態配列へ追加。
2. `v2/miracle-resolution.mjs` で既存の単体奇跡攻撃経路・防御・鏡反射・MP支払い・学習・精霊をそのまま再利用。阻止されれば霧なし、通れば HPを減らさずに霧を付与。多人数の不確定ターゲットは拒否。
3. `v2/effect-runner.mjs` の `castAffliction` は、**元の宣言済み奇跡・現在の受け手・一回だけの効果**を検証。反射時は実際の反射先へ霧を付ける。手番進行や補充は共通エンジン。
4. `v2/staging-room.mjs` の**認証済み席別view**は、閲覧者自身が霧のときだけ**相手のhp/mp/moneyを`null`に伏せる**。ホスト内部stateには真値を保持して防御・ダメージを正確に処理。真値を相手側HTMLへ送信しない。手札枚数は従来通り表示。
5. `v2/disease-rules.mjs` の既存軽症／全体治癒で霧を解除。治療直後の次のviewから相手のHP/MP/¥が復帰する。同時に閃光へ勝手に影響する副作用は導入しない。
6. `v2/demo/firebase-online-lab.html` に研究用25番目の`mistMiracle`プリセット追加。学校配布のGoogle Sites内HTMLは更新しない。

## 検証

- `tests/g7-mist-miracle-v2.test.mjs`：カード定義・厳密効果、宣言前は付与なし、被弾者だけ相手の数値が隠れる、ホスト内部ダメージが正常、貝がら治療、習得済み再使用、精霊MP免除、奇跡停止、スーパーミラー反射、MP不足の原子的拒否、治癒の状態復帰を検証。
- `tests/v2-firebase-online-webkit.browser.mjs`：Playwright WebKit 2独立画面＋模擬RTDBで、`mistMiracle`を使用し、ゲストの相手HP/MP/¥が「？」になること、スマイルの貝がらで解除し元の数値へ復帰することをタップ。
- **Node.js 1,111/1,111合格**：[run 41333764138](https://github.com/8mahi8/party-card-replica/actions/runs/41333764138)。既存1,101件から10件増加（今回の新規10ケース）。
- **Chromium 28/28合格**：[run 41333764064](https://github.com/8mahi8/party-card-replica/actions/runs/41333764064)。
- **WebKit模擬RTDBオンライン2席319/319成功、既存UI339/339成功**：[run 41333764073](https://github.com/8mahi8/party-card-replica/actions/runs/41333764073)。新たに霧の宣言→防御許可→ゲストだけ相手HP/MP/¥伏字→貝がら治療後の数値再表示を2タブでタップ確認。
- 最初のCI失敗はカタログ旧数値と未更新の単体HTML、テスト用の先攻順不一致が原因。修正済み。最終の上記CIはいずれも成功。**学校iPad実機・本物Firebaseの実通信ではない**。

## 制約と次

- 正規カード抽選は研究台帳 **184種類／445参考枠、`complete:false`** なので引き続き利用禁止。
- 現行オンライン研究用2席のみに対応。3人以上のランダム対象、霧が隠す他者操作の完全再現、他の未実装霧付与アイテムや水星の指輪は別途確認。
- 学校iPad Safari実機と本物のFirebaseで今回の機能は未検証。Google Sites直接埋込版・main・Firebase Security Rules・認証方式は未変更。
