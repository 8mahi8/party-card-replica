# G7｜閃光の防御1神器制限と解除｜2026-11-02

## 根拠と採用範囲

- [Piong 災い一覧](https://w.atwiki.jp/piong/pages/23.html)：「閃光」の効果は防御時に神器を一つしか選択できない。治癒は〈音色〉〈歌声〉・スマイル／ハートの貝がら。
- [ゴッドフィールド初心者向けルール](https://godfield-beginner.game-info.wiki/)：防御時の神器が一つだけになる制約を独立確認。
- [Piong 奇跡一覧](https://w.atwiki.jp/piong/pages/20.html) と [2026年まかろん神器一覧](https://macarongamemo.com/entry/godfield-artifact)：〈音色〉は風邪・熱病・霧・閃光、〈歌声〉はすべての災いを治す。
- ここに書いた原作の挙動は**二次資料に基づく研究判断**。AIが現行原作を実操作した証明ではない。

## 実装

1. `v2/disease-rules.mjs`：病気とは独立した非病系 `afflictions: ['flash']` を厳密に受け入れる。未知の霧・夢・暗雲などは勝手に生成しない。軽症／全解除のどちらでも閃光を消せる。
2. `v2/staging-room.mjs`：ホストが保有するプレイヤーの `afflictions` を読んで、防御コマンド `defend`／`defendSequence` の神器選択数が2以上なら確定前に拒否。防御0は可。習得済み奇跡の選択も1回として数える。同じコマンドが不正なら revision／手札／pending を変更しない。
3. `v2/effect-runner.mjs`：既存の `cleanseAfflictions` を使い、〈音色〉〈歌声〉と貝がらが共通経路で閃光を治癒。状態をcloneしてから変えるため、失敗時に元ルームへ漏れない。
4. `v2/demo/firebase-online-lab.html`：研究用固定プリセット `flashDefense`。B側に開始時の閃光を与え、画面に災いを表示、2つ以上の防御選択では確定ボタンを無効化。ユーザーの学校Google Sites実使用版とは独立した実験用UI。
5. `tests/g7-flash-affliction-v2.test.mjs`：状態検証、2つ選択の原子的拒否、0／1枚防御、貝がら／奇跡解除、解除後の複数防御復帰を確認する。

## 再現できていないこと

- **閃光を付与する武器・奇跡**（例：フラッシュダガー、〈閃光〉）はまだ登録していない。原作の命中率・ダメージ後発動条件・全体攻撃ルーティングをまとめて照合してから対応する。研究プリセットでの開始状態はテスト専用。
- 霧（対象指定・情報表示）、夢（手札誤認）、暗雲（全体攻撃必中）は未実装。閃光以外の非病系状態を「治した」と表示しない。
- 学校iPad Safari、学校Google Sites直接貼付、現行原作の実対戦は未確認。正規山札は引き続き `complete:false`、確率分布の版差は残す。
- Firebase Security Rules・認証方法・main・学校公開HTMLは変更しない。

## 検証の記録

**最終コード HEAD `bc75066577b5` で確認済み。**

- Node.js：**1,069 / 1,069 PASS**、[GitHub Actions run 41327568466](https://github.com/8mahi8/party-card-replica/actions/runs/41327568466)。今回の閃光テスト5件・22セットの追加監査を含む。
- Chromium：**28 / 28 PASS**、[run 41327568556](https://github.com/8mahi8/party-card-replica/actions/runs/41327568556)。
- Playwright WebKit：**模擬RTDBオンライン2席303 / 303 PASS**、従来画面**339 / 339 PASS**、[run 41327568691](https://github.com/8mahi8/party-card-replica/actions/runs/41327568691)。追加オンラインシナリオでは閃光で2神器を拒否→1枚防御→スマイルの貝がらで解除→再び2枚防御まで、2独立ブラウザでタップ検証。
- 単体HTMLをGitHub開発ブランチの `v2/demo/standalone.html` と `v2/demo/firebase-online-standalone.html` に再生成保存済み（buildコミット `0c1526c0`）。ビルド用 workflow は一時起動後**手動専用に復帰**。
- 途中のCI失敗は、22番目の研究プリセットを反映していない旧テスト、治療説明文の旧期待値、新WebKitテストのルームコード正規表現の二重エスケープ。すべてテスト側を修正し、最終コードで全合格。実際の学校iPadの検証を意味しない。
