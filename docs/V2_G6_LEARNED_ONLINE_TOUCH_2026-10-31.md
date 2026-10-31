# G6/G7｜習得済み奇跡のオンラインタップUI（2026-10-31）

## 目的
オンライン研究画面では従来、習得済み奇跡は文字表示だけで、エンジンに既にある `castLearned`・`playSequence`・`defendSequence` をプレイヤーが操作できなかった。友人同士の1vs1で原作の奇跡習得／再詠唱を遊べるよう、**戦闘効果・Firebase Security Rules・認証方式を変更せず**画面操作を接続した。

## 実装
- `v2/demo/firebase-online-lab.html`：習得済み奇跡を横スクロール可能なタップボタンとして配置。奇跡名・MPコスト・選択状態を表示し、手番／防御番のときだけ使用可能。相手席から自分の習得内容を操作できない。研究版の固定手札はそのまま。
- 手札カードは物理 `instanceId`、習得済み奇跡は別キー `l:<definitionId>` として区別し、一つの挿入順 `Set` に保持。選択プレビューの順序と送信コマンドの順序を一致させた。
- 習得済み奇跡1つだけで攻撃すると `castLearned`、手札と組み合わせると `playSequence`、防御で使う場合は `defendSequence`。既存エンジンが元から持つ合法性検証を必ず通し、未確認の組合せは独自に許可しない。攻撃用途でない習得奇跡の単独攻撃はボタンで無効化。
- 雑貨・スーパーミラー・捨てるは従来どおり**物理カード限定**で処理し、習得奇跡を `instanceId` として誤送信しない。
- `learnedTrial` 固定4枚セットはオンラインUI操作の専用研究用。Aは風／オーラ、Bは乱気流を学習済みで開始。正規山札・出現率には関係しない。
- `tests/v2-firebase-online-webkit.browser.mjs`：2ブラウザ・390×430のWebKitとモックRTDBで、習得済み〈風〉の再詠唱、〈乱気流〉防御、武器→習得済み〈オーラ〉の順序・MP徴収を試験。既存の女神の石けん表示検査も新しいボタンUIへ更新。
- `tests/firebase-online-lab-page-v2.test.mjs`と`tests/g7-online-loadout-presets-v2.test.mjs`の固定UI契約を更新。V2オンライン単体HTMLも生成手順で同期。

## 再現・検証
- `npm test`
- `node v2/demo/build-online.mjs --check`
- GitHub Actions `V2 WebKit touch smoke (development only)`（2ページのモックRTDB）
- GitHub Actions `V2 real-browser smoke`（Chromium）
- 学校iPad Safari実機・Google Sitesへコード直貼りした本番版では**未検証**。実Firebaseに対する今回の追加操作試験は**未実施**。既存の27ケースはこのUI追加より前の成功実績。

## 継続課題
習得済み奇跡が3〜6個になった際のiPad内スクロール・タップ感を実機で確認する。組合せを無理に前処理で許可するのではなく、既存エンジンによる拒否時に選択を保持して誤入力から回復できることを優先。オンラインUI完成後も、原作の正規山札・全神器は未完成。

**変更範囲は開発ブランチのみ。学校Google Sites・Firebase Security Rules・認証方式は変更していない。**
