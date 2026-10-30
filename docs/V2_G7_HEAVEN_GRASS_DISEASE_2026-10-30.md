# G7 天国草と病系災いの最小エンジン｜2026-10-30

## 原作照合
- [Piong その他神器（2026-10-24更新）](https://w.atwiki.jp/piong/pages/19.html)、[まかろん神器表2026](https://macarongamemo.com/entry/godfield-artifact)：天国草は価格20円、0.2%（1/500）、**MP+20と天国病の付与**。
- [Piong 災い一覧](https://w.atwiki.jp/piong/pages/23.html)、[初心者向けルール](https://godfield-beginner.game-info.wiki/)、[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html)：風邪→熱病→地獄病→天国病。所有者のターン終了時HPは順に-1/-2/-5/+5。毎ターン終了時に5%悪化、天国病の発作はHP0。病系災いの追加付与でも次段階へ悪化。太陽のお守りによる復活では病は治らない。
- **直接原作プレイによる検証なし**。病のHP増減と5%判定の厳密な画面演出・時点は今回、資料に沿って「先に当ターンのHP増減、次に悪化判定」で仮設定。今後原作直接検証で違えば修正する。霧・閃光・夢・暗雲など他系統の災いにはこのロジックを適用しない。

## 設計・実装
- `src/verified-basic-cards.mjs` に `i016` 天国草を追加。`v2/legacy-adapter.mjs` + `v2/foundation.mjs` は単独の**複合効果** `heavenHerb({mp:20,disease:'heaven'})` を厳密検証。研究台帳は166種類・411/500参考枠、`complete:false`。完全な本家抽選は依然無効。
- `v2/disease-rules.mjs`：状態異常全般の過剰抽象化を避け、4つの病の純粋な付与・重症化・ターン終了予測のみ。死亡・復活処理は新規複製せず、既存のゼロHP共通プランを使う。
- `v2/staging-room.mjs` にプレイヤーの`disease:null`を追加。病は対戦相手にも見える公開情報なので、既存の秘匿した`hand[]`/`learned[]`とは分離して席別ビューに`disease`を表示。
- `v2/room-transition.mjs`：従来の`useItem`＋`itemDefense`＋`respondItem`（許す・スーパーミラー）を再利用。相手の反射選択前にはMP回復も病付与もしない。同じ天国病の相手へ重ねた場合、HP0と太陽のお守りを共通キューで処理。
- `v2/effect-runner.mjs`：`heavenHerb`がMPを99まで回復し病を付与・重症化。実際にプレイヤーの手番が終わる`advanceSettled`だけが、その人の病HP効果とホストseed付き5%判定を行う。病がなければ乱数を消費しない。病でHP0になった際は既存の`planZeroHpRecoveryFixture`で太陽のお守りを消費してHP10復活。復活しても病は維持。お守りがない場合は通常の勝敗へ。
- `v2/demo/firebase-online-lab.html`：9つ目の固定研究セット `heaven`。ホスト天国草、ゲストスーパーミラーと天国草。病は両席のHP/MP情報と併せて公開表示する。試験用seedを12345に固定して初手から5%発作にならない手順を再現。これは配布用完全版を意味しない。
- `v2/demo/bundle-modules.mjs`に新ファイルを登録し、旧/オフライン/オンラインの単体HTML3本が正しく生成できるようにした。

## 検証対象
- `tests/g7-heaven-disease-v2.test.mjs`：原作値、4段階・5%・累積付与、使用時とターン終了時の区別、相手・反射、天国病再感染の死亡、お守り復活、地獄病でのターン終了死亡、未感染者に乱数消費なし。
- `tests/v2-firebase-online-webkit.browser.mjs`：WebKitの2席同時タップでMP+20・病付与、反射、次の攻撃後のHP+5、既存UIの動作回帰。
- `tests/v2-g6-live-firebase.browser.mjs`：本物のRTDBを使用し、対象を相手にして許す/鏡を選び、病付与と所有者の手番終了時HP+5を検査。既存の実Firebase検証と同じ、作成したルームだけをホストIDを照合して削除する。

## 境界・残課題
学校のiPad Safariでの実機検証は未実施。実際のGoogle Sites直接埋め込み版、GitHub main、Firebase Security Rules・認証は変更しない。病の治療（スマイル／ハートの貝がら、奇跡）、病を付与する各武器、霧・夢・閃光・暗雲は未実装。今後、原作確認したうえで共通の病状態に接続する。既存正常機能の作り直しや、必要性のない汎用状態異常システムの構築はしない。
