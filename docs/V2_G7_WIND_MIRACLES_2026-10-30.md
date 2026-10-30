# G7｜感染→治療の通し試合と奇跡〈風〉〈天国風〉（2026-10-30）

## 先に原作照合した仕様
- [GFGA 奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)、[まかろん2026神器一覧](https://macarongamemo.com/entry/godfield-artifact)、[2026年9月奇跡一覧](https://toroccowars.jp/21523/)：〈風〉は**MP6、風邪付与、無属性・攻撃値なし、0.2%（1/500）**。〈天国風〉は**MP15、天国病付与、無属性・攻撃値なし、0.2%**。
- [Piong 災い一覧](https://w.atwiki.jp/piong/pages/23.html)と[2025年の天国風解説](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)：重ねがけで病が悪化し、天国病への追加感染でHP0になる。天国風は自己使用によって毎ターンHP+5の効果を利用できる。
- [GFGA 奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)：奇跡は一度唱えると習得し、以後MP消費で再唱可能。手札からの詠唱は使用済みの物理神器を補充し、習得済み奇跡の詠唱でも手札が1枚増える。
- [原作の対奇跡防御攻略](https://ameblo.jp/godfield-tactics/entry-12129413013.html)、[夢状態の反射表](https://macarongamemo.com/entry/godfield-dream)：スーパーミラーや対奇跡停止・反射/弾きの神器という原作経路がある。本研究では**許す・スーパーミラー・エンゼル停止**を画面とエンジンで確認。個別の弾き確率、夢等別の災い、特殊組み合わせはまだ検証対象外。
- 本家の実際のゲームを操作して「無属性・ダメージなしの奇跡に通常防具だけを出す」等の全例を直接照合したわけではない。確認できた範囲と未確認範囲を分け、原作忠実再現の完全達成と混同しない。

## 今回の実装
- `tests/g7-infection-to-cure-full-match-v2.test.mjs`：疾風剣→風邪→相手の次の手番でスマイル貝がら→相手の通常反撃→病ダメージは再発しない、地獄のハサミ→地獄病→ハート貝がら→反撃→病ダメージが発生しない、また風邪を放置した時だけ自分のターン終了HP-1の3つを通し確認。
- `src/verified-basic-cards.mjs`：型付き`m013`〈風〉、`m014`〈天国風〉を追加。カード価格¥0・各重み1。既存の魔法カードデータ・MP/習得/補充を再利用。
- `v2/legacy-adapter.mjs`、`v2/foundation.mjs`：`role:'afflict'`＋`onDeclare:inflictDisease({disease:'cold'|'heaven'})`で**命中ダメージがなくても病を直接付与**する奇跡と、実際のダメージ後だけ付与する武器とを明確に区別。
- `v2/staging-room.mjs`：攻撃力0でも病付与の正規奇跡なら`playCards`・`playSequence`・`castLearned`を許可。その他の無効果な攻撃力0カードを紛れ込ませない。
- `v2/miracle-resolution.mjs`：既存の奇跡消費MP・習得・手札補充・相手の防御待機・反射・対奇跡停止の経路を**新しい奇跡2種でも再利用**。攻撃力0の病付与奇跡では`hit`命令を出さず、止められなければ`castDisease`を出す。
- `v2/effect-runner.mjs`：権威ホスト側で宣言された元の奇跡カードと対象を検査後、既存の`planDiseaseExposure`と太陽のお守りの復帰処理を再利用。反射後は実際の被弾先に病を付与し、MPは二重に消費しない。
- `v2/demo/firebase-online-lab.html`：12番目の固定研究セット`windMiracles`。Aに〈風〉/〈天国風〉/精霊ぬいぐるみ、Bにスーパーミラー/対奇跡停止防具、初期MPをA25にして両方試せる。
- 正規カタログは**174種類・435/500参考枠・`complete:false`**。原作353種類・500枠抽選にはまだ使わない。

## テスト範囲
- `tests/g7-wind-heaven-wind-miracles-v2.test.mjs`：原作値、MP支払、習得、習得再唱による手札1枚追加、精霊でMP免除、0ダメージ感染、エンゼル停止、鏡の反射、自己天国風、天国病発作+太陽のお守り、MP不足の宣言失敗を検証。
- `tests/v2-firebase-online-webkit.browser.mjs`：WebKit2画面で〈風〉・〈天国風〉・エンゼル停止・スーパーミラー反射の4セット。狭いiPad相当のiframeサイズで表示・MP・病表示・手番復帰を確認。
- `tests/v2-g6-live-firebase.browser.mjs`：実RTDBの同じ4セットを、既存G7テストとは独立の一時ルームで検証。作成した部屋のホストID確認後に削除し、学校版ルームには触れない。

## 今後
- 病系武器から貝がらを使う一連のゲーム画面操作をSafari/WebKitでも直接試すこと。
- 今回未検証の乱気流の確率的な弾き・反射連鎖、通常防具の使用演出、精霊・他の奇跡との複合使用は本家の資料やプレイで確認してから拡張。
- 学校Google SitesにHTMLコードを直貼りしている実際のiPadではまだ未検証。GitHub main、学校版HTML、Firebase Security Rules・認証方式は変更しない。
