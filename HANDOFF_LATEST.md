# ゴッドフィールド再現ゲーム｜開発担当AI 引き継ぎ【最新・入口固定】

**最終更新：2026年10月30日（日本時間）**  
**ユーザーが新しいチャットで「ゴッドフィールドの開発引き継いで」とだけ言ったら、この文書から開発を再開する。** チャットの過去ログや古いREADMEを読めない状態でも、このファイル・GitHubのコード・CI・資料で引き継げるようにしている。

> **この文書は引き継ぎ入口であり、実装の真実は常に開発ブランチの最新コードとGitHub Actions。** コミットSHA・テスト件数・カード数は作業のたびに変わる。本文の日付や数値を確認せず永久に正しいと扱わないこと。

## 2026-10-31 G6/G7｜オンライン習得済み奇跡のタップ選択【引き継ぎ後・新規】

- **実装**：`v2/demo/firebase-online-lab.html`で、単なる「習得した奇跡：…」の文字一覧を、MPコスト・選択状態付きの横スクロールボタンへ変更。手札と奇跡の**タップ順**を共有して保持し、奇跡単独攻撃=`castLearned`、武器→習得奇跡=`playSequence`、習得防御奇跡=`defendSequence`へ送信する。元からある共通戦闘エンジンを再利用し、ルールやMP計算を独自に再実装していない。雑貨・捨てるは物理カードのみ。待機側のタップは禁止。
- **研究セット**：`learnedTrial`（A:〈風〉〈オーラ〉習得／B:〈乱気流〉習得）を追加。全**15セット**に。原作の山札ではなく`complete:false`の**174種類・435/500参考枠**は不変。
- **テスト**：`tests/v2-firebase-online-webkit.browser.mjs`に、習得済み〈風〉単独詠唱→習得済み〈乱気流〉で防御→次手番の武器＋習得済み〈オーラ〉（順序・MP）の2画面タップ通し試験を追加。女神の石けんの旧い文字列検証を新しいボタン数へ更新し、UI静的テストと15セットの台帳契約も修正。
- **ビルド・CI**：V1/V2オフラインとG6オンラインの単体HTML3本を開発ブランチで再生成し、生成用workflowは**手動専用へ復帰**。最新Node **1026/1026 PASS** [run 41086022921](https://github.com/8mahi8/party-card-replica/actions/runs/41086022921)、Chromium [run 41086022621](https://github.com/8mahi8/party-card-replica/actions/runs/41086022621) **PASS**。新しいオンライン2席WebKitタップ試験は後続の実行でステップ通過を確認したが、WebKit既存画面の全suiteは実行終了後の最新Actions結果を確認すること。
- **詳細**：[V2_G6_LEARNED_ONLINE_TOUCH_2026-10-31.md](docs/V2_G6_LEARNED_ONLINE_TOUCH_2026-10-31.md)。今回**学校のiPad Safari・Google Sites直貼りでは未実機**、新UIの実Firebase27ケース再試験も未実施。Firebase Security Rules／認証方式、学校公開版、mainは変更なし。
- **次工程**：WebKit全スイートの最終結果確認→必要なら修正。学校iPadで手札・習得奇跡の横スライドとMP表示を実際に試し、原作に沿った未実装カード・山札を段階的に増やす。低頻度の多人数例外より通常の1vs1で遊べる完成度を優先。

## 2026-10-31 G7｜乱気流・感染治療の通し試合と防御画面修正【最新・実Firebase成功】

- **原作資料**：[GFGA奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)、[Piongタイマン攻略](https://w.atwiki.jp/piong/pages/21.html)、[Piong防御リダイレクト](https://w.atwiki.jp/piong/pages/17.html)：〈乱気流〉は**MP5で奇跡を弾く**が、必ず元攻撃者へ反射するわけではない。自分にも戻る可能性があり、その場合は二度目の防御がない。**既存`v2/redirect-route.mjs`が生存者からhost乱数で選ぶ動作を実装済みのため再実装せずテストに集中した**。現行原作の全防御演出を直接実測したわけではない。
- **テスト・操作研究セット**：`tests/g7-turbulence-and-infection-cure-v2.test.mjs`に**8件**。seed12345（弾く先=防御者自身で再防御不可）、seed71（弾く先=元攻撃者で再防御可）、エンゼルで停止／反射を受けて風邪+HP-1、習得乱気流MP5・手札+1・コマンド再送、MP不足で元の防御待機維持、〈風〉→スマイルの貝がら治療→同手番反撃、〈天国風〉→ハートの貝がら治療→反撃、2度目の習得済み〈天国風〉で天国病発作KO。オンラインラボに`turbulenceSelf`/`turbulenceBack`の**固定4枚研究セット2種**を追加し、研究セット全14種。研究カードは**174種・435/500参考枠、`complete:false`**を維持。
- **実際の表示不具合を発見・修正**：WebKitで、乱気流で元攻撃者に戻った奇跡が防御画面の`incomingAttack`に表示されない。原因は、詠唱した奇跡が物理手札から取り除かれた後、表示側がその手札から奇跡名を探していたこと。`v2/staging-room.mjs`の`declaredAttackFixture`を、すでに宣言済みの**単独奇跡に限り**検証済み`pending.attackContext`から再表示するよう修正。相手の未公開手札は引き続き秘匿。元の反射・命中ルールは変更なし。新しい表示回帰テストを追加。
- **最新確認済み**：Node **1026/1026 PASS** [run 41081035693](https://github.com/8mahi8/party-card-replica/actions/runs/41081035693)、Chromium **PASS** [run 41081035417](https://github.com/8mahi8/party-card-replica/actions/runs/41081035417)、WebKit 2席オンライン **192/192 PASS**＋旧画面 **339/339 PASS** [run 41081035588](https://github.com/8mahi8/party-card-replica/actions/runs/41081035588)。このWebKit結果は**UI表示修正後**。検証用単体HTML3本もビルドを実行して開発ブランチに同期。
- **実Firebase 27ケース成功**：[run 41080143334](https://github.com/8mahi8/party-card-replica/actions/runs/41080143334)。従来22＋新規 `G7_LIVE_TURBULENCE_SELF_SUCCESS`、`G7_LIVE_TURBULENCE_ANGEL_SUCCESS`、`G7_LIVE_TURBULENCE_ACCEPT_SUCCESS`、`G7_LIVE_WIND_CURE_WIND_SUCCESS`、`G7_LIVE_WIND_CURE_HEAVEN_SUCCESS`、ホストIDを照合した一時ルーム**27件すべて削除済み**。**この実Firebase試験は最後の防御画面表示修正前**であり、修正後の表示はWebKitで確認した。誤って後修正分も実Firebase確認済みと報告しない。両テストworkflowは**手動専用へ復帰**。
- **資料**：[V2_G7_TURBULENCE_CURE_INTEGRATION_2026-10-31.md](docs/V2_G7_TURBULENCE_CURE_INTEGRATION_2026-10-31.md)。学校iPad Safari実機＋Google Sitesに直貼りしたHTMLは**未検証・未変更**。Firebase Security Rules/認証方式、GitHub mainは未変更。
- **次工程**：学校Safariでの画面・フリーズ試験、習得した奇跡を試合中に再唱するタップUI、反射後の公開情報と乱気流の防御表示などプレイ体験を優先。原作完全抽選や未実装の他災いは原作資料・実機比較をしながら段階的に。低確率例外のための過剰抽象化は避ける。

## 2026-10-30 G7｜感染→治療の通し試合と奇跡〈風〉〈天国風〉【最新・実Firebase成功】

- **原作照合**：[GFGA 奇跡一覧](https://w.atwiki.jp/gfplusa/pages/19.html)・[まかろん2026神器一覧](https://macarongamemo.com/entry/godfield-artifact)・[2026年9月奇跡一覧](https://toroccowars.jp/21523/)を突合。〈風〉=MP6・風邪、〈天国風〉=MP15・天国病。両者とも無属性・直接ダメージなし、出現率0.2%（各1/500）。奇跡は一度使用すると習得し、以降MPを払って唱え直せる。精霊使用で当該直前奇跡のMP免除。原作ゲームでの直接画面観察や全対奇跡防御の網羅は未検証。
- **新規の通し試合**：`tests/g7-infection-to-cure-full-match-v2.test.mjs` 3件。疾風剣→風邪→相手の番でスマイルの貝がら→同じ手番で反撃→病ダメージなし／地獄のハサミ→地獄病→ハートの貝がら→反撃→病ダメージなし。治療しない場合は自分のターン終了時だけ風邪のHP-1を確認。これまで別々だったG7感染と治療が**1試合の実際の進行として接続**された。
- **奇跡実装**：`src/verified-basic-cards.mjs`に`m013`〈風〉と`m014`〈天国風〉、`v2/legacy-adapter.mjs`＋`v2/foundation.mjs`に型付き`onDeclare:inflictDisease`を追加。武器の`afterHit:inflictDisease`とは分離。攻撃値0の奇跡を`v2/staging-room.mjs`で`playCards/playSequence/castLearned`可能にし、`v2/miracle-resolution.mjs`は攻撃`hit`を発生させず、MP支払い・奇跡習得・補充・既存反射・対奇跡停止を共有。`v2/effect-runner.mjs`の`castDisease`が宣言された元の奇跡と対象を検証し、既存病の段階進行・HP0と太陽のお守り復活・自分のターン終了効果に接続。未照合の複合反射・異常災いは勝手に独自処理を追加しない。
- **試験用UI**：`v2/demo/firebase-online-lab.html`に12番目の`windMiracles`固定手札セット（A:風/天国風/精霊等、初期MP25／B:スーパーミラー/エンゼル防具）。テスト用の既存Firebase RTDB接続に合わせて再生成した単体HTML3本を開発ブランチへ保存。研究台帳は**174種類・435/500参考枠・`complete:false`**。原作353種類・500枠の正規抽選は依然禁止。
- **Node 1018/1018 PASS** [run 41074519880](https://github.com/8mahi8/party-card-replica/actions/runs/41074519880)。新規`tests/g7-wind-heaven-wind-miracles-v2.test.mjs` 10件はMP不足・詠唱と習得・再唱・追加手札・精霊・スーパーミラー反射・エンゼル停止・天国病追加感染・太陽のお守り・自分への天国風を検証。**Chromium PASS** [run 41074650786](https://github.com/8mahi8/party-card-replica/actions/runs/41074650786)。**WebKitオンライン2画面184/184 PASS＋固定UI339/339 PASS** [run 41074650744](https://github.com/8mahi8/party-card-replica/actions/runs/41074650744)。夢の監査上は新奇跡2種は`sourceExcluded`対象となるため、監査値22/14（sourceExcluded/needsRuleReview）へ調整して全体テストに合格。
- **実Firebase 22シナリオすべて成功** [run 41074650807](https://github.com/8mahi8/party-card-replica/actions/runs/41074650807)：従来の18に加え`G7_LIVE_WIND_MIRACLE_WIND_SUCCESS`・`G7_LIVE_WIND_MIRACLE_HEAVEN_SUCCESS`・`G7_LIVE_WIND_MIRACLE_ANGEL_SUCCESS`・`G7_LIVE_WIND_MIRACLE_MIRROR_SUCCESS`。試験用の22ルームすべてでホストIDを照合後`G6_LIVE_CLEANUP_SUCCESS`（22回）を確認。ルールや認証方式は変更なし。生成/liveの各CIは手動起動に戻した。
- **詳細**：[V2_G7_WIND_MIRACLES_2026-10-30.md](docs/V2_G7_WIND_MIRACLES_2026-10-30.md)。学校iPad Safari実機＋Google Sites直接HTML埋め込みはまだ未検証。学校版HTML、GitHub main、Firebase Security Rulesは未変更。**G7原作再現・研究試験段階**であり、完全な本家ゲームではない。
- **次工程**：奇跡〈風〉→貝がらで治療・〈天国風〉の連射と病発作・乱気流の弾きを、現行原作と比較しながら追加試験。実際の学校iPad操作と遊びやすいUI、既存2人対戦のフリーズ回帰も確認。無理に他の夢・霧・閃光・暗雲を病系へ混ぜない。

## 2026-10-30 G7｜4種の病付与武器・実ダメージ後の感染【最新・実Firebase成功】

- **原作資料**：[2026年神器一覧](https://macarongamemo.com/entry/godfield-artifact)、[Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)、[風邪の進行の解説](https://note.com/hantama_dm/n/n8f690316f015)。**疾風剣**（攻9/¥10/0.2%）・**激烈疾風剣**（攻13/¥15/0.2%）は命中してHPダメージが通れば風邪。**風のカギ爪**（土属性・攻1/¥10/0.2%）は風邪。**地獄のハサミ**（攻8/¥15/0.2%）は地獄病。いずれもダメージ0なら病付与なし。既存の病に追加感染すると病の強さにかかわらずちょうど1段階悪化。天国病へ追撃すると発作。原作本体の特殊な死亡と復活の演出順は直接実測していない。
- **コード**：`src/verified-basic-cards.mjs`に`w056`〜`w059`。既存データfactoryに`diseaseOnHit`、`v2/legacy-adapter.mjs`＋`v2/foundation.mjs`に`afterHit:inflictDisease({disease:'cold'|'hell'})`。`v2/ordered-attack.mjs`は不変な`attackContext.diseaseOnHit`を作り、`v2/basic-resolution.mjs`はHPダメージが実際に通った場合のみ感染命令を`hit`の直後に生成。`v2/effect-runner.mjs`は攻撃ソースと命中結果を検証し、既存`planDiseaseExposure(previous,incoming)`で病を付ける。**反射後は最終被弾者が感染**し、持ち主のターン終了時に既存病効果が適用される。天国病でさらに感染した場合の太陽のお守り復活は既存共通処理を利用。未照合の複雑な奇跡/武器同時選択との相互作用は無理に実装せず研究版で制限。
- **UI・参考カード**：`v2/demo/firebase-online-lab.html`に11種目の研究セット`illnessAttack`。風邪・地獄病武器、相手の強い防具とスーパーミラー、治療用貝がらを固定手札として試せる。旧/V2オフライン/V2オンラインの単体HTML3本を開発ブランチで再生成。カード研究台帳は**172種類・433/500参考枠、`complete:false`**（正規353種/500枠の山札は未完成・本番抽選は無効）。
- **検証成功**：追加`tests/g7-disease-on-hit-weapons-v2.test.mjs`で4武器値・属性・盾0/部分ダメージ・反射・重複感染・天国病発作・太陽のお守り復帰等11件。Node **1005/1005 PASS** [run 41070293489](https://github.com/8mahi8/party-card-replica/actions/runs/41070293489)、Chromium **PASS** [run 41070293285](https://github.com/8mahi8/party-card-replica/actions/runs/41070293285)、WebKit 2席タッチ **168/168 PASS**＋固定画面 **339/339 PASS** [run 41070397615](https://github.com/8mahi8/party-card-replica/actions/runs/41070397615)。
- **実Firebaseも18ケース成功**：[run 41070847262](https://github.com/8mahi8/party-card-replica/actions/runs/41070847262)で従来14試験＋`G7_LIVE_DISEASE_WEAPON_COLD_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_BLOCKED_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_REFLECT_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_HELL_SUCCESS`。18独立ルームを所有ホストID照合後**18件すべて削除成功**。失敗した最初の試験ではゲームの感染と同期は正常だったが、参加によって増えるrevisionをテストが数え落としたため、両席revision一致と防御前より増えていることを確認する方式へ修正・再試験成功。ライブ/単体HTML生成ワークフローは元の手動専用に戻した。
- **詳細**：[V2_G7_DISEASE_WEAPONS_2026-10-30.md](docs/V2_G7_DISEASE_WEAPONS_2026-10-30.md)。学校iPad Safari＋Google Sites直貼りの実機試験は**未実施**。学校埋め込みHTML、GitHub main、Firebase Security Rules、認証方式は未変更。現状のG7は**研究・原作再現基盤フェーズ**で、完全に遊べる本家再現ゲームではない。
- **次工程**：今回の風邪・地獄病命中→スマイル／ハートの貝がら治療の1試合シナリオをさらに自動・実機で確認。独立した奇跡〈風〉〈天国風〉を原作資料で調べ、攻撃の防御・反射とMP消費の順序を確定してから実装する。霧/夢/閃光/暗雲は別仕様として保留。

## 2026-10-30 G7｜貝がら2種・病系治療の範囲分岐【最新・実Firebase成功】

- **原作照合**：[Piong神器一覧](https://w.atwiki.jp/piong/pages/19.html)、[Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)、[まかろん2026神器表](https://macarongamemo.com/entry/godfield-artifact)：**スマイルの貝がら=¥5・2.4%（12/500）・風邪/熱病/霧/閃光を払う**、**ハートの貝がら=¥15・1.2%（6/500）・あらゆる災いを払う**。スマイルは地獄病・天国病・夢・暗雲を治療できない。原作本体での直接演出は未実測（外部資料による照合）。
- **実装**：`src/verified-basic-cards.mjs`に`i017`/`i018`、`v2/legacy-adapter.mjs`と`v2/foundation.mjs`に厳密型`cleanseAfflictions({scope:'minor'|'all'})`。`v2/disease-rules.mjs`に`planDiseaseCure`を追加。`v2/staging-room.mjs`の既存`useItem`／`respondItem`と`v2/room-transition.mjs`の既存スーパーミラー後の効果判定を再利用。`v2/effect-runner.mjs`の既存効果キューで**スマイルは風邪・熱病のみ、ハートは病系4段階すべて**を解除。病をもたない相手への使用も可能、他人の手札の秘匿と一回だけの補充・同じターンで攻撃可を維持。治療後は持ち主のターン終了時の病ダメージが消える。研究カタログは**168種類・429/500参考枠、`complete:false`**で本家ランダム抽選は引き続き禁止。
- **制約を正確に区別**：原作では貝がらは霧・閃光・夢・暗雲にも有効だが、それらの**状態異常そのものはまだV2対戦に実装されていない**。今回は実装済みの病系治療のみを正確に実装。デバッグ用のDream見た目差替え台帳は「夢」災い本体ではないため、勝手に消さない。後で本体を実装した時に同じ型付き効果に接続する。
- **UI・パッケージ**：オンライン研究セット10種目`shells`はホストがスマイル/ハート2枚＋天国病、ゲストがスーパーミラー＋熱病で開始。効果プレビューは「風邪・熱病を治す」「病系の災いをすべて治す」と正確に記述。旧/V2オフライン/V2オンラインの3種単体HTMLを開発ブランチで再生成。ビルドworkflowは元の手動専用へ戻した。
- **自動テスト実測**：`tests/g7-shell-cleansing-v2.test.mjs` 10件新規。Node **994/994 PASS** [run 41066264525](https://github.com/8mahi8/party-card-replica/actions/runs/41066264525)、Chromium **PASS** [run 41066264540](https://github.com/8mahi8/party-card-replica/actions/runs/41066264540)、WebKitオンライン **156/156 PASS**と既存画面 **339/339 PASS** [run 41066264527](https://github.com/8mahi8/party-card-replica/actions/runs/41066264527)。
- **本物のFirebase 2画面も成功**：[run 41067115608](https://github.com/8mahi8/party-card-replica/actions/runs/41067115608) で既存G6/G7の10ケース＋`G7_LIVE_SHELL_SMILE_PASS_SUCCESS`、`G7_LIVE_SHELL_SMILE_MIRROR_SUCCESS`、`G7_LIVE_SHELL_HEART_PASS_SUCCESS`、`G7_LIVE_SHELL_HEART_MIRROR_SUCCESS`の**計14試験がすべて成功**。14ルームのホストIDを照合した安全な削除も14回成功。初回のスマイル反射時の誤失敗は**治療が実際には発生しない場合に、ゲストへの同期を待たずにRESTの旧revisionを読んだテスト待機不足**。ゲスト側の反映を待つ修正をして再実行成功。Live workflowも元の手動専用へ戻した。
- **詳細資料**：[V2_G7_SHELL_AFFLICTION_CURE_2026-10-30.md](docs/V2_G7_SHELL_AFFLICTION_CURE_2026-10-30.md)。学校の実iPad Safari＋Google Sites直貼り版は未検証・変更なし。GitHub main、Firebase Security Rulesと認証方式も未変更。
- **次工程**：G7病エンジンを活かして風邪/熱病/地獄病を付与する原作神器/奇跡の命中・効果順を調査するか、既存のオンラインUI品質を点検。ユーザーが承認していない独自仕様や未実装の他の災いを推測で加えない。

## 2026-10-30 G7｜天国草・病系4段階のターン終了エンジン【最新・実Firebase成功】

- **原作照合**：[Piongその他神器（2026-10-24）](https://w.atwiki.jp/piong/pages/19.html)・[まかろん神器表](https://macarongamemo.com/entry/godfield-artifact)により**天国草=¥20/0.2%（1/500）/MP+20と天国病**。[Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)・[初心者向けルール](https://godfield-beginner.game-info.wiki/)により病4段階は風邪(-HP1)→熱病(-HP2)→地獄病(-HP5)→天国病(+HP5)、所有者のターン終了時に5%で次段階へ悪化（天国病なら発作でHP0）。追加の病付与でも悪化し、太陽のお守り復活では病が残る。原作ゲームでの直接実機確認は未実施。厳密な演出/HP変化と5%抽選順は出典を踏まえて実装し、今後現行原作で直接照合する。
- **設計・コード**：`src/verified-basic-cards.mjs`に `i016` 天国草、`v2/foundation.mjs`＋`v2/legacy-adapter.mjs`に `heavenHerb({mp:20,disease:'heaven'})`。新しい `v2/disease-rules.mjs` は**病系4つだけ**の純粋な付与/ターン終了計算。`v2/staging-room.mjs` の `player.disease` は一般公開情報（他席の手札/習得奇跡は引き続き秘匿）。`v2/room-transition.mjs` は既存の雑貨指定とスーパーミラー判定後にMP+20と病を付与。`v2/effect-runner.mjs` の `advanceSettled` で病の持ち主がターンを終えたときだけHPの増減・5%進行。既存ゼロHP/太陽のお守りを流用、復活時も病は持続。未感染者は病判定乱数を消費しない。霧/夢/閃光などは今回未対象。
- **UI・ビルド**：オンライン固定研究セットは**9つ目の`heaven`**（天国草・スーパーミラー、seed12345で初回の偶然発作を回避）。画面のHP/MPに`災い：天国病`等を表示。`v2/demo/bundle-modules.mjs`へ新規依存を登録し、旧/V2オフライン/V2オンライン単体HTML3本を開発ブランチへ再生成。生成ワークフローは一時PR起動後に**元の手動専用へ復帰**。研究台帳は**166種類・411/500参考枠、`complete:false`**、本家正規抽選無効。
- **検証**：`tests/g7-heaven-disease-v2.test.mjs` 12件追加、Node **984/984 PASS** [run 41063205774](https://github.com/8mahi8/party-card-replica/actions/runs/41063205774)、Chromium **PASS** [run 41063205751](https://github.com/8mahi8/party-card-replica/actions/runs/41063205751)、WebKit 2席オンライン **132/132 PASS**＋既存画面 **339/339 PASS** [run 41063205454](https://github.com/8mahi8/party-card-replica/actions/runs/41063205454)。`tests/v2-g6-live-firebase.browser.mjs` で新しい `G7_LIVE_HEAVEN_PASS_SUCCESS` と `G7_LIVE_HEAVEN_MIRROR_SUCCESS` を実RTDBでも確認 [run 41063614609](https://github.com/8mahi8/party-card-replica/actions/runs/41063614609)。従来の8シナリオ＋天国草2シナリオの**計10ルーム全削除成功**。初回実RTDB試験の失敗はnull diseaseプロパティが省略されたケースをテストが誤判定したため。nullish対応に修正・再実行成功。live workflowは**手動専用へ復帰**。
- **詳細資料**：[V2_G7_HEAVEN_GRASS_DISEASE_2026-10-30.md](docs/V2_G7_HEAVEN_GRASS_DISEASE_2026-10-30.md)。学校iPad Safari＋Google Sitesの実機は**未検証**。学校版直接埋込HTML、GitHub main、Firebase Security Rules/認証は変更なし。
- **次工程**：原作にあるスマイル／ハートの貝がらや病を付与する他神器を、現在の病状態を活かしながら順次再現。霧・閃光・夢・暗雲は病系と効果が違うので、別途原作照合・UI設計してから着手。実機試遊とゲームUI品質も今後重点確認。

## 2026-10-30 G7｜女神の石けん・習得済み奇跡2つ忘却【最新・実Firebase成功】

- **原作照合**：[Piong 2026-10-24 その他神器](https://w.atwiki.jp/piong/pages/19.html)、[GFGA](https://w.atwiki.jp/gfplusa/pages/18.html)、[まかろん2026](https://macarongamemo.com/entry/godfield-artifact)：**女神の石けん = ¥10・0.2%（1/500）・対象の習得済み奇跡を無作為に2つ忘れさせる**。[2023年原作論評](https://idea427.hatenablog.com/entry/2023/07/31/192159)：未使用の物理手札にある奇跡は消えない。[Piong守護神](https://w.atwiki.jp/piong/pages/27.html)：奇跡を1つも習得していない相手も指定可能。[2025年スーパーミラー検証](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)：相手への石けんは反射可能。2013年の1つ忘却という旧情報ではなく現行の2つを採用。原作ゲームでの直接実機検証は未実施。
- **実装**：`src/verified-basic-cards.mjs` の `i015`、`v2/legacy-adapter.mjs`＋`v2/foundation.mjs` に `onDeclare:forgetLearned({count:2})`、`v2/staging-room.mjs` は既存 `useItem` 対象指定・`respondItem` 反射/許すを再利用。`v2/room-transition.mjs` は**相手の反射選択後**に権威ホストだけでシードRNGから重複なし最大2つの習得済み奇跡を選択。`v2/effect-runner.mjs` の新 `forgetLearned` 命令は `learned[]` だけを削除し、**手札の神器は消さず補充にも影響させない**。対象の習得奇跡0個なら何も忘れない。石けん/使用した鏡だけ通常通り補充され、元の攻撃手番を再開。カタログは **165種類・410/500研究枠、`complete:false`**。
- **オンラインUI**：8つ目の `soap` 固定試験セット。両席の `learned[]` をそれぞれ3つずつ信頼できるホスト作成時の試験データとして固定（ゲストコマンドで指定不可）。自身の習得済み奇跡表示 `#learnedMiracles` を追加、石けんの相手/自分対象選択をUIから操作可能。従来7セット維持。旧/V2オフライン/V2オンラインの単体HTML3本を開発ブランチで再生成して保存、生成workflowは**手動専用へ戻した**。
- **検証結果**：Node **972/972 PASS** [run 41061072473](https://github.com/8mahi8/party-card-replica/actions/runs/41061072473)、Chromium **PASS** [run 41061072429](https://github.com/8mahi8/party-card-replica/actions/runs/41061072429)、WebKitオンライン2画面 **120/120 PASS**＋既存画面 **339/339 PASS** [run 41061073018](https://github.com/8mahi8/party-card-replica/actions/runs/41061073018)。追加 `tests/g7-goddess-soap-v2.test.mjs` は源データ、忘却対象・乱数、1/0個、鏡、自己使用、手札非影響、再送と手番継続を検証。
- **本物のFirebase対戦も成功**：[run 41061219909](https://github.com/8mahi8/party-card-replica/actions/runs/41061219909)で以前のG6/G7の6シナリオに加え `G7_LIVE_SOAP_PASS_SUCCESS`（対象の習得済み奇跡3→1）と `G7_LIVE_SOAP_MIRROR_SUCCESS`（反射で使用者の習得済み奇跡3→1）。両席手札4枚・revision3・手番復帰・他人の未公開`learned`/hand秘匿を確認。**一時8ルーム全削除済み**（ログに8回の `G6_LIVE_CLEANUP_SUCCESS`）。ライブworkflowの一時PRトリガーも従来の手動起動に復帰。
- **資料・制限**：[G7女神の石けん調査と実装](docs/V2_G7_GODDESS_SOAP_2026-10-30.md)。学校iPad Safari/Google Sites実機未検証。学校版HTML、GitHub main、Firebase Security Rulesと認証は未変更。353種/500枠正規抽選は未完成・引き続き無効。
- **次の作業**：G7残る未再現雑貨と奇跡の適用・災い処理を原作資料と比較。単にカードを増やすのではなく、原作に必要な共通状態異常エンジンの最小設計、または既存未完機能の検証を優先。

## 2026-10-30 G7｜夜空のホウキ・無作為3枚掃き飛ばし【最新・実Firebase成功】

- **原作根拠**：[Piongその他神器（2026-10-24更新）](https://w.atwiki.jp/piong/pages/19.html)・[GFGAその他神器](https://w.atwiki.jp/gfplusa/pages/18.html)・[まかろん2026神器表](https://macarongamemo.com/entry/godfield-artifact) で夜空のホウキが**¥10／0.2%（1/500）／対象の物理神器をランダムに3枚掃き飛ばす**と照合。前の版では1枚だが2026版では3枚。[ゴッドフィールドを1000試合やった](https://note.com/md_stardustman/n/nfc5dfb559f95)で被害側の手札は3枚減り、補充されない。[2025年攻略](https://kankurou53.hatenablog.com/entry/2025/07/19/165703)で自己指定可能／習得済み奇跡は対象外。原作サーバーで直接動作を目視測定したわけではない。
- **カード定義・共通エンジン**：`src/verified-basic-cards.mjs` に `i014`、`v2/legacy-adapter.mjs` と `v2/foundation.mjs` に`sweepHand({count:3})`。研究台帳は**164種類・409/500参考枠、`complete:false`**。既存 `useItem`／`itemDefense`／`respondItem` を使用（自己使用・相手使用・スーパーミラー）。`v2/room-transition.mjs` は鏡の応答後、権威ホストのseed付き乱数で**物理カードを最大3枚・非復元抽選**。ホウキ自身と使用済み鏡は抽選候補から事前除外。習得済み奇跡は`hand[]`外なので対象にならない。`v2/effect-runner.mjs` は強制`sweep`効果を追加し、通常「捨てる」できないカードも消せるが、**除去先の手札は補充しない**。使用したホウキと鏡だけが従来通り補充され、元の攻撃手番へ戻る。
- **オンライン研究UI**：7つ目の研究用手札セット「夜空のホウキ・手札除去」を追加（ホストにホウキ、ゲストにスーパーミラー）。ホウキ選択時のデフォルト対象は相手だが自分にも変更可能。手札・残数・鏡応答はタップ操作。従来6セットを維持。旧研究・V2オフライン・V2オンラインの単体HTML3本を開発ブランチで再生成済み。生成workflowsは終了後**手動専用**に復帰。
- **確認済み自動テスト**：Node **962/962 PASS** [run 41059021772](https://github.com/8mahi8/party-card-replica/actions/runs/41059021772)、Chromium **success** [run 41059021947](https://github.com/8mahi8/party-card-replica/actions/runs/41059021947)、WebKitオンライン2席 **104/104 PASS**＋既存画面 **339/339 PASS** [run 41059021802](https://github.com/8mahi8/party-card-replica/actions/runs/41059021802)。`tests/g7-night-sky-broom-v2.test.mjs` に10項目のseed付き抽選／3枚喪失／禁止捨て札／習得奇跡／0枚／自己指定／鏡／再送を追加。
- **実Firebase成功**：[run 41059219940](https://github.com/8mahi8/party-card-replica/actions/runs/41059219940) で既存G6/G7の4試験に加え、`G7_LIVE_BROOM_PASS_SUCCESS` と `G7_LIVE_BROOM_MIRROR_SUCCESS` を確認。別々の実RTDB部屋で2席の手札数 **4↔1**、手番復帰・他席の手札秘匿を検査。計**6部屋をすべてホストID照合後に削除**し、6つの`G6_LIVE_CLEANUP_SUCCESS`も確認。ライブworkflowは元の手動起動へ復帰。
- **限界・資料**：[原作資料・実装方針](docs/V2_G7_NIGHT_SKY_BROOM_2026-10-30.md)。学校iPad Safari＋Google Sitesへの直接埋め込みは**未検証・未変更**。GitHubのmain／Firebase Security Rules／認証も未変更。正規353種類・500枠の抽選は未完成・無効。スーパーミラーとホウキの詳細なアニメーション演出など原作直接測定が必要な項目は追加研究する。
- **次の作業**：原作での他の特殊雑貨（女神の石けんや状態異常対応）をソース確認し、習得奇跡・状態異常など既存エンジンの設計と照合して実装優先順位を決める。実際のゲームの完成を優先し、目的のない共通基盤追加はしない。

## 2026-10-30 G7｜通常HP・MP回復7種の他者指定・事前スーパーミラー【最新・実Firebase成功】

- **原作再調査**：[God Field初心者向けルール](https://godfield-beginner.game-info.wiki/) は雑貨を味方へ使用しHP/MPを回復できると説明し、[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html) も雑貨を相手に使用可能とする。前G7の `i006`～`i012` が自分専用なのは再現漏れ。HP/MP値と確率は既存 [Piong資料](https://w.atwiki.jp/piong/pages/19.html)・[GFGA](https://w.atwiki.jp/gfplusa/pages/18.html) を維持。原作の実画面で各回復雑貨を鏡にかけた実測は別途未実施（既存 `redirectAttack:reflect scope:any` を採用）。
- **実装**：`v2/staging-room.mjs` は普通の `restoreResource` も `useItem.targetId` で他プレイヤーを選べるように変更。自分は従来の即時回復、他者には `itemDefense` を開き、相手の `respondItem`（許す/スーパーミラー）を待つ。`v2/room-transition.mjs` は許した対象、または鏡で戻された使用者を回復する。元のエフェクトキュー・99上限・鏡の消費と補充・手番継続を再利用。新カードや乱数抽選の追加なし。研究カタログは**163種類・408/500参考枠、`complete:false`**。
- **画面・研究セット**：`v2/demo/firebase-online-lab.html` の `対象：自分／相手` 切替を全7種類にも表示。6つ目の固定研究セット `support` はホストのHP/MP回復とゲストのスーパーミラーを試せる。旧5セットは維持。旧研究版・V2オフライン・V2オンラインの単体HTML計3種類を再生成し、開発ブランチに保存。自動バンドル生成は検証後に**元の手動専用**へ戻した。
- **テスト実測**：Node **952/952 PASS** [run 41055931609](https://github.com/8mahi8/party-card-replica/actions/runs/41055931609)、Chromium **PASS** [run 41055931348](https://github.com/8mahi8/party-card-replica/actions/runs/41055931348)、WebKitオンライン **87/87 PASS**＋既存画面 **339/339 PASS** [run 41055931571](https://github.com/8mahi8/party-card-replica/actions/runs/41055931571)。`tests/g7-targetable-plain-recovery-v2.test.mjs` は7種類の自分以外対象・鏡反射・補充・99上限・再送・手番継続を検査。WebKitの2画面で他者へのHP/MP使用と反射を実タップ模擬検証。
- **本物Firebase成功**：[run 41056408728](https://github.com/8mahi8/party-card-replica/actions/runs/41056408728) で、既存G6/G7の3シナリオに加え `G7_LIVE_SUPPORT_RECOVERY_SUCCESS`（HP+5をスーパーミラーで反射、次にMP+5を相手が許す、revision6、手札秘匿）を確認。**4つの試験部屋をすべて安全に削除**。初回のライブ検証だけ期待revisionを5と記述し失敗したが、実状態は正しく6だったためテストを修正・再実行成功。ライブworkflowも**元の手動実行**へ戻した。
- **資料と境界**：[今回のG7実装・根拠・実測](docs/V2_G7_TARGETABLE_HP_MP_RECOVERY_2026-10-30.md)。学校iPad Safari＋Google Sitesの実際のHTML埋込では未検証。学校版HTML、main、Firebase Security Rules・認証は変更なし。正規353種/500枠の本家抽選は依然無効。次はG7未実装の特殊雑貨や状態異常、原作UIの調査と実装を続ける。

## 2026-10-30 G7｜ドキドキ涙の相手指定・事前スーパーミラー【最新・実Firebase成功】

- **前担当の修正点**：研究版のドキドキ涙 `i013` は50%回復/50%自傷まで実装したが「自分にしか使えない」と扱っていた。原作攻略記事 [2020](https://ameblo.jp/shibransk/entry-12647363984.html)・[2025](https://kankurou53.hatenablog.com/entry/2025/07/19/165703) を再調査し、**相手にも使用でき、効果が確定する前にスーパーミラーで反射を選べる**と確認。オリジナルルールからのズレを優先して修正。
- **コード**：`v2/staging-room.mjs` の `useItem.targetId`（未指定なら既存の自分）、`itemDefense` と `respondItem`（許す／所有スーパーミラー1枚）、相手へ宣言した雑貨の席別公開・未使用手札秘匿、再送署名に対象ID反映。`v2/room-transition.mjs` は相手の選択**後に1回だけ**ホストseed RNGで決定し、鏡なら使用者へ戻す。既存 `hit`/`restoreResource`/太陽のお守り/決着/補充/同手番継続の仕組みを流用。通常HP/MP回復アイテムの他者使用は今回の出典で個別ルール未確認のため従来の自分用のまま。新カードは登録していない（研究台帳**163種類・408/500参考枠**、`complete:false`）。
- **画面**：オンライン研究用tearセットにスーパーミラーを配置。`対象：自分／相手` のトグルと、受け側の `許す／スーパーミラーで反射` ボタン。リリース用の単体HTML3種類は開発ブランチへ再生成保存済み。オンラインでは新`respondItem`コマンドから不要な旧防御配列が送られて拒否される**実UIバグをWebKitで発見し修正**、再発防止テストを追加。GitHub上の生成workflowは手動起動へ戻した。
- **確定テスト**：Node **945/945 PASS** [run 41054436648](https://github.com/8mahi8/party-card-replica/actions/runs/41054436648)、Chromium **PASS** [run 41054436614](https://github.com/8mahi8/party-card-replica/actions/runs/41054436614)、WebKitオンライン **69/69 PASS**＋旧画面 **339/339 PASS** [run 41054436880](https://github.com/8mahi8/party-card-replica/actions/runs/41054436880)。新規 `tests/g7-dokidoki-target-mirror-v2.test.mjs` に原作対象選択、許す/鏡、回復/ダメージ、HP0と太陽のお守り、再送・秘密手札を追加。
- **実Firebaseで成功**：[run 41054723700](https://github.com/8mahi8/party-card-replica/actions/runs/41054723700) の実RTDB＋独立2WebKit画面で、`G6_LIVE_TWO_BROWSER_SUCCESS`、`G7_LIVE_RECOVERY_SUCCESS`、新`G7_LIVE_TARGET_MIRROR_SUCCESS`（revision3／使用者HP50／被使用者HP40／鏡消費／秘匿ビュー）と3回の安全な試験ルーム削除成功を確認。検証用の一時PRトリガーは終了後に**元の手動workflowへ復帰**。
- **資料・残課題**：[G7相手指定・鏡の実装と出典](docs/V2_G7_DOKIDOKI_TARGET_MIRROR_2026-10-30.md)。学校のiPad Safari＋Google Sites実機は**未検証**。`main`、学校Google Sites直接貼り付けHTML、Firebase Security Rules/認証は変更なし。次はG7の原作未実装神器と状態異常・雑貨対象選択の検証へ進む。部分台帳から本家抽選を有効化しない。

## 2026-10-30 G7｜ドキドキ涙50/50アイテム（原作資料照合＋研究用対戦へ追加）

- **原作根拠**：[Piongその他神器](https://w.atwiki.jp/piong/pages/19.html)、[GFGA](https://w.atwiki.jp/gfplusa/pages/18.html)、[まかろん2026](https://macarongamemo.com/entry/godfield-artifact)を照合。ドキドキ涙（価格¥1、確率0.4%＝参考2/500枠）、50%でHP+10／50%で10ダメージ。現在の研究カタログは**163種類・408/500参考枠**、 `complete:false` 維持。
- **実装**：`src/verified-basic-cards.mjs` の `i013`、`v2/legacy-adapter.mjs`＋`v2/foundation.mjs` の厳密 `flipHpRisk` 型、`v2/staging-room.mjs` の既存 `useItem` 受付、`v2/room-transition.mjs` の**権威ホスト1回だけのseed付き乱数**。当たりは共有 `restoreResource`、外れは共有 `hit` で10ダメージ、HP0なら通常の勝敗・太陽のお守り処理を使う。奇跡・属性攻防・Firebase認証/Rulesは変更していない。
- **試遊UI**：オンライン版で「ドキドキ涙・運試し」固定4枚セット追加、選択時にHP+10/10ダメージ（各50%）表示。「雑貨を使う」から操作。既存4種類の研究セットを保持。旧研究版/V2オフライン/V2オンラインの単体HTML計3本をCI botが再生成して開発ブランチへ保存済み。生成workflowは手動起動専用へ復帰。
- **テスト実測**：Node **936/936 PASS** [run 41052306964](https://github.com/8mahi8/party-card-replica/actions/runs/41052306964)、Chromium **success** [run 41052307118](https://github.com/8mahi8/party-card-replica/actions/runs/41052307118)、WebKit旧画面 **339/339 PASS**＋模擬RTDBオンライン **54/54 PASS** [run 41052306872](https://github.com/8mahi8/party-card-replica/actions/runs/41052306872)。`tests/g7-dokidoki-tear-v2.test.mjs` は2分岐、HP0/復活、再送、攻撃継続を検査。オンラインWebKitは固定seed（回復が出る方）を2端末で同期検査。途中のNode失敗はDream研究監査 `needsRuleReview=8` → **9** の期待値更新漏れで、修正後全成功。
- **残る範囲**：ドキドキ涙を**本物のFirebase**で実行する検証、および学校iPad Safari＋Google Sites実機は未実施（旧G7通常回復セットの実Firebase成功と区別）。原作ゲームでの太陽のお守りとの細かい実測優先順位も未確認。原作353種・500枠の正規抽選を実装したと主張しない。学校Google Sites HTML、main、Firebase Security Rules/認証は未変更。
- **資料**：[今回の根拠と境界](docs/V2_G7_DOKIDOKI_TEAR_2026-10-30.md)。次はカードデータの未登録/特殊効果を整理してG7原作再現を続ける。

## 2026-10-30 G7｜実Firebase回復セットの双方向試験に成功【確認済み】

- 最新コード（本日の継続担当）：既存 `tests/v2-g6-live-firebase.browser.mjs` に、G6基本セットの実Firebase双方向攻防を保持したまま、G7 `recovery` 固定セットの**両席HP/MP回復→同じ手番で攻撃**を実Firebaseで試す追加シナリオを実装。1番目の試験用ルームをホストID照合後に削除してから2番目を作り、最後に2番目だけを同じ照合で削除。両席の `revision=14` / HP・MP / 他人の手札秘匿を検査。シナリオの成功ログは `G7_LIVE_RECOVERY_SUCCESS`。
- 通常Node CIには `tests/g7-live-probe-syntax.test.mjs` を追加し、検証スクリプトの構文とworkflowの**手動専用**設定を監査。詳細は [G7実Firebase検証資料](docs/V2_G7_REAL_FIREBASE_RECOVERY_PROBE_2026-10-30.md)。
- **実測確認**：[GitHub Actions run 41050294774](https://github.com/8mahi8/party-card-replica/actions/runs/41050294774) で、旧G6の `G6_LIVE_TWO_BROWSER_SUCCESS` / G7新回復セットの `G7_LIVE_RECOVERY_SUCCESS`（revision14）/ 2つのルーム削除 `G6_LIVE_CLEANUP_SUCCESS` をログで確認し、ジョブ全体もsuccess。一時的にPRトリガーで実行し、終了後は元の `workflow_dispatch` **手動専用**へ戻した。学校iPad Safari実機は未検証。学校Google Sites HTML、Firebase Rules/認証、mainは触らない。
- 次工程：ワークフロー復帰後のNode/Chromium/WebKit CIを確認。学校iPad Safariでの実機検証は引き続き必要。並行してG7原作効果と部分研究カタログを拡張。

## 2026-10-30 G7｜基本HP・MP回復7種＋同手番で攻撃できる回復エンジン【最新】

- **根拠**：[Piongその他神器](https://w.atwiki.jp/piong/pages/19.html)（2026-10-24更新）、[GFGA神器一覧](https://w.atwiki.jp/gfplusa/pages/18.html)、[まかろん2026一覧](https://macarongamemo.com/entry/godfield-artifact)で回復7種類の効果・価格・授かり率を照合。[Piongタイマン攻略](https://w.atwiki.jp/piong/pages/21.html)で回復など手札を切った後に同じ手番で攻められる運用、[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html)でHP/MP上限99を確認。天国草は天国病まで必要なため未登録。
- **カードデータ**：`src/verified-basic-cards.mjs`に`i006`〜`i012`、スマイルのしずく（HP+5）、ハートのしずく（HP+10）、ロマンスウォーター（HP+15）、天の川のおいしい水（HP+20）、スマイルの花（MP+5）、ハートの花（MP+10）、ロマンスの香木（MP+15）を追加。合計**7種・49参考枠**で研究台帳は**162種・406/500参考枠**（旧155/357）。`complete:false`維持、本家353種/500枠抽選は未有効化。
- **既存エンジン拡張**：`v2/legacy-adapter.mjs`にデータ型`restore_hp/restore_mp`→`onDeclare:restoreResource`、`v2/foundation.mjs`に回復効果の厳密バリデーション。 `v2/staging-room.mjs`に当事者が自分の1枚だけ使う`useItem`コマンドと**物理instanceIdを含むコマンド署名**、`v2/room-transition.mjs`・`v2/effect-runner.mjs`に回復→補充→**同じプレイヤーの攻撃手番を維持**（99上限）を実装。エンジンのHP/MP/手札変化は権威ホストだけで解決し、RTDBは席ごとのビューだけ送信。Firebase認証・Rules未変更。
- **オンラインUI**：`v2/demo/firebase-online-lab.html`に`回復を使う`、カード上の`HP+5/MP+5`等、上限表示、「HP・MP回復と反撃」研究用4枚セット追加。先行の基本/属性/闇3セットはそのまま。今回は**2人1vs1向け自分だけを回復**。原作の味方への対象指定や夢状態での回復神器の擬装判定は未実装・未確認。
- **回帰テスト**：`tests/g7-plain-recovery-items-v2.test.mjs`に7種全件の参照値、資源上限99、消費と固定補充、回復→回復→攻撃→防御、同じIDの再送の冪等性、IDを維持し物理カードだけ変更する不正再送の拒否など。Dream研究監査では7種類が`needs-rule-review`（効果適用済み/夢の真偽確定ではない）。`tests/v2-firebase-online-webkit.browser.mjs`は390×430の2画面で実際に回復選択・タップ・HP/MP同期・同ターン攻撃・防御を検査。
- **確定CI**：Node **929/929 PASS** [run 41041982015](https://github.com/8mahi8/party-card-replica/actions/runs/41041982015)、Chromium **28/28 PASS** [run 41041981833](https://github.com/8mahi8/party-card-replica/actions/runs/41041981833)、WebKitオンライン **49/49 PASS**＋既存画面 **339/339 PASS** [run 41041641624](https://github.com/8mahi8/party-card-replica/actions/runs/41041641624)。最新の再実行 [run 41041981963](https://github.com/8mahi8/party-card-replica/actions/runs/41041981963)も確認すること。初回WebKitは初期MP10を20と読み違えた**テスト期待値だけが誤り**、MP15で修正して成功。先行Nodeも古い単体HTML/監査件数のため失敗したが解消。
- **配布・資料**：旧研究用、V2オフライン、G6オンラインの単体HTML3種類を再生成、bot `a9683eb`で開発ブランチに保存。 workflowを`workflow_dispatch`だけに戻した。詳細は[`docs/V2_G7_PLAIN_RECOVERY_ITEMS_2026-10-30.md`](docs/V2_G7_PLAIN_RECOVERY_ITEMS_2026-10-30.md)。学校のGoogle Sites貼付HTML、`main`、Firebase Rules・認証は触っていない。
- **次の優先**：学校iPadで研究用回復セットを含め実機試遊し、UIのタップしやすさと同期を評価。回復セットは模擬RTDB＋WebKitでは検証済みだが、**新規の本物Firebase通信と学校iPad実機では未検証**。原作の味方回復・状態異常や回復以外の雑貨/神器の再現を資料照合後に続ける。部分参考台帳を本家ランダム抽選として起動しない。

## 2026-10-30 G7｜登録済み神器をオンラインで試せる3種類の固定手札【今回の最新】

- **目的**：G7で研究台帳を**155種類・357/500参考枠**に広げた一方、G6オンラインでは初期4枚の固定セットしか遊べず、新しく追加した属性防具や闇属性武器を実対戦で試せなかった。原作の353種/500枠の山札抽選を勝手に有効化しないまま**研究用固定セットを選択可能にした**。学校で遊ぶ本番ルールの変更ではなく開発用試遊機能。
- **実装**：`v2/demo/firebase-online-lab.html`に部屋を作る人だけが選ぶ`#labPreset`セレクターと`LAB_PRESETS`を追加。選択は「基本対戦（従来4枚）」「属性防御（火/水）」「闇属性と高防御」の3種。各A/B4枚のカード定義をホストが検証してから`createStagingRoom`へ渡す。**基本セットは従来と完全に同一、正規ランダム抽選ではない**。ゲストは従来どおりルーム番号で参加し、相手の手札は見えない。Firebaseトランスポート・Rules/認証・攻防エンジンは変更なし。見た目は従来の原作風UIを維持。
- **テスト**：新`tests/g7-online-loadout-presets-v2.test.mjs`で選択肢、定義ID存在、両席4枚、相手手札非公開、基本セット互換、`complete:false`を監査。WebKit`tests/v2-firebase-online-webkit.browser.mjs`では旧基本セットの再送操作に加え、`390×430`のタッチ2ブラウザで火攻撃→水防具防御、闇攻撃→高防御によるHP40維持をそれぞれ確認。
- **最終CI**：Node **923/923 PASS** [run 41038901304](https://github.com/8mahi8/party-card-replica/actions/runs/41038901304)、Chromium **28/28 PASS** [run 41038901206](https://github.com/8mahi8/party-card-replica/actions/runs/41038901206)、WebKit旧画面 **339/339 PASS**＋オンライン2画面 **41/41 PASS** [run 41038901697](https://github.com/8mahi8/party-card-replica/actions/runs/41038901697)。先行CIはHTML再生成前に走ったため配布HTML一致検査のみ失敗、再生成後の923/923で解消。
- **配布**：`v2/demo/firebase-online-standalone.html`を自動再生成し開発ブランチに保存（bot commit `cd47c485f552be6dc40accb8f4598b99b776c059`）。[最新G6オンライン研究版HTML ZIP](https://github.com/8mahi8/party-card-replica/actions/runs/41038901697/artifacts/12969371993)。`g6-commit-portable-html.yml`は作業後`workflow_dispatch`手動専用に復帰。`main`・学校Google Sites貼付版・Firebase Rules/認証は未変更。
- **原作資料と引き継ぎ**：[`docs/V2_G7_PLAYABLE_LAB_HANDS_2026-10-30.md`](docs/V2_G7_PLAYABLE_LAB_HANDS_2026-10-30.md)にセット内容/選定理由/出典・個別の資料差異/未検証を記録。Piong2026、GFGA、まかろん2026を照合。一部`旧石器ジャベリン`価格（Piong/GFGA¥4 vs まかろん¥10）等の版差は今回改変しない。
- **現在位置と次**：G6の本物のFirebase基本2ターン成功は旧run`40973710968`。今回の**新しい2セット**は模擬RTDB＋WebKitで成功、学校iPad2台／本物のFirebaseで新セットを使う検証は**未実施**。まず学校試遊が可能なときに新セットをタップ確認。原作効果を調べて研究台帳の正規353種/500枠と個別効果を完成させるまで、本家の確率ドロー・初期9枚へは切り替えない。実際に必要な追加セット以外のデッキ編集機能は作らず、過剰設計を避ける。

## 2026-10-30 G7更新｜通常防具30種・共通属性防御テスト【最新】

- **一次目的**：G6の実Firebase双方向対戦基盤を維持したまま、G7原作神器を増やす。Piong/ GFガイド＋α/まかろん（2026-02-28）を突合。**追加した30種は特殊効果のない防具のみ**（`d030`〜`d059`）。無5種（18枠）、火4種（4枠）、水7種（7枠）、木6種（6枠）、土6種（6枠）、光2種（2枠）。既存の`shield()`定義だけを利用し、属性相性や防御エンジンには変更なし。研究台帳は**155種類・357/500参考枠**（旧125種・314枠）。
- **資料間差異を意識的に保留**：火花の小手/手袋、フレイムメット/ヘルム、フレイムアーマー/メイル、旧`はがねの盾`の属性/価格、`美しいガラス細工`の属性/価格等が二次資料間で異なる。既存の武器カテゴリにも2025参考マトリクスとの不整合がある。**今回の追加は一致する数値と属性のものだけ。古いカードを推測で修正していない**。特殊効果持ちの防具や相反する資料は未登録。出典・30件の独立表・保留例は[`docs/V2_G7_ORDINARY_ARMOR_CATALOG_2026-10-30.md`](docs/V2_G7_ORDINARY_ARMOR_CATALOG_2026-10-30.md)。
- **エンジン回帰**：`tests/g7-plain-armor-expansion-v2.test.mjs`で全30件の名称/守備/価格/属性/枠/効果なしを検査。実際のV2権威ホストで無属性防具、火⇄水、木⇄土、光、闇属性即死の防御相性を検証。研究台帳の一部でも正規確率抽選を許さない`complete:false`を確認。先行の`g7-ordinary-dark-weapons-v2.test.mjs`は件数を共有監査値から読むよう調整。
- **最終CI**：Node **920/920 PASS** [run 41035412792](https://github.com/8mahi8/party-card-replica/actions/runs/41035412792)、Chromium **28/28 PASS** [run 41035412746](https://github.com/8mahi8/party-card-replica/actions/runs/41035412746)、WebKit旧研究画面 **339/339 PASS**＋オンライン2画面 **28/28 PASS** [run 41035412892](https://github.com/8mahi8/party-card-replica/actions/runs/41035412892)。最初のCIは古い配布HTMLの不一致＋今回と無関係の武器カテゴリ超過を誤って検査したため失敗、原因を直し再実行で全成功。
- **配布同期**：旧`demo/standalone.html`、V2`v2/demo/standalone.html`、G6`v2/demo/firebase-online-standalone.html`の**3種類すべて再生成**。GitHub Actions bot commit `355aede`で開発ブランチに保存。[G6オンライン版HTML配布ZIP](https://github.com/8mahi8/party-card-replica/actions/runs/41035412892/artifacts/12968406005)。生成workflowは終了後`workflow_dispatch`手動起動に戻した。
- **未完・次**：実Firebase2人攻防の成功（旧run`40973710968`）はそのままだが、今回追加した30防具は研究デッキに登録しただけで、学校公開版/正規山札にはまだ組み込んでいない。原作の353種・500枠を全件照合してから復元抽選・初期9枚手札を有効化する。**学校iPad Safari実機は未検証**。GitHub `main`・学校Google Sites貼付HTML・Firebase Security Rules/認証設定は変更なし。

## 2026-10-30 G7｜出典照合済み通常神器5種・山札研究を前進【最新】

- **研究データを追加**：Piongの2026-03-18単体武器表、GFガイド＋α(2024)、まかろんの2026一覧を照合し、`src/verified-basic-cards.mjs`に闇属性の通常武器`w051`コブラ(攻3/¥10)、`w052`さよならの剣(攻4/¥10)、`w053`キラーフォーク(攻5/¥10)、`w054`死神のカマ(攻10/¥20)、および攻13/守1/¥3の兼用`w055`伝説の剣のさやを追加。すべて参考出現率0.2%=1/500枠。カード名別の効果分岐なし。**研究カタログは125種類・314/500参考枠**に前進（元120種/309枠）。
- **実装・回帰**：`tests/g7-ordinary-dark-weapons-v2.test.mjs`で定義/入手枠/闇の無防御即死/完全防御なら生存/部分防御なら即死/`w055`の攻守兼用を検証。Dream・Mirage・2回攻撃テストに残っていた古い件数の直書きは`tests/helpers/research-catalog-contract.mjs`から取得する形へ修正。
- **実測CI**：Node **913/913 PASS** [run 41033541202](https://github.com/8mahi8/party-card-replica/actions/runs/41033541202)、Chromium **28/28 PASS** [run 41033541345](https://github.com/8mahi8/party-card-replica/actions/runs/41033541345)、Playwright WebKit旧UI **339/339 PASS**＋オンライン2画面 **28/28 PASS** [run 41033541187](https://github.com/8mahi8/party-card-replica/actions/runs/41033541187)。テスト途中は古いHTMLと古い研究件数による失敗があったが解消し、**全3配布HTML**（`demo/standalone.html`、`v2/demo/standalone.html`、`v2/demo/firebase-online-standalone.html`）をGitHub Actionsで再生成・開発ブランチに保存（bot commit `b93cb1da290b6d77b3f386a0038829f28c54e706`）。再生成workflowは終了後手動起動へ復帰。
- **最重要の境界**：Piongの500枠復元抽選は二次資料上確認済みだが、研究125種/314枠は未完成。`src/catalog-audit.mjs`の完全性監査は`complete:false`であり、**部分デッキを正規抽選として動かしていない**。現在のG6オンラインは引き続き固定4枚・固定`d001`補充。出典と実装範囲は[`docs/V2_G7_DARK_WEAPONS_CATALOG_2026-10-30.md`](docs/V2_G7_DARK_WEAPONS_CATALOG_2026-10-30.md)。
- **次工程**：原作で数値・効果の確認できた個別神器を継続登録。完成した個別効果と353種/500枠の正規山札監査が揃ってから復元抽選と初期9枚へ移行。学校iPad Safari実機試遊はまだ未検証で、Google Sites HTML・GitHub`main`・Firebase Security Rules/認証は変更していない。

## 2026-10-30 G6更新｜最新版単体HTMLで実Firebaseの双方向対戦成功【最新・優先】

- **実ネット通信を確認済み**：現在の原作風HUDを含む`v2/demo/firebase-online-standalone.html`で、**本物のFirebase RTDBに対して独立WebKit2ブラウザでAが攻撃→Bが許す→Bが攻撃→Aが許す**を完走。両席`revision=6`一致、HP変化と宣言済み攻撃神器「ワンダーソード／攻10」・未使用手札秘匿を確認。テストした5桁ルームは`meta.hostId`を再検証して削除した。GitHub Actions [live run 40973710968](https://github.com/8mahi8/party-card-replica/actions/runs/40973710968)で `G6_LIVE_TWO_BROWSER_SUCCESS` と `G6_LIVE_CLEANUP_SUCCESS` を確認。**学校の別々のiPad実機ではなく、CI環境の2ブラウザコンテキストによる実Firebase通信。**
- **Google Sitesのiframe向け最小修正**：`v2/demo/firebase-online-lab.html`のB参加処理は従来`sessionStorage.getItem/setItem`が拒否されると停止したため、アクセスをtry/catchで保護し、使用不可時は一時ゲストIDで参加可能に。これはMDNが説明するsandbox由来のストレージアクセス制限対策であり、**Google Sites自体のsandbox・学校iPad実機はまだ未確認**。保存不可時の再読み込み後の席復帰は非対応。
- **検証**：Node **908/908 PASS** run [40973992022](https://github.com/8mahi8/party-card-replica/actions/runs/40973992022)、Chromium **28/28 PASS** run [40973992018](https://github.com/8mahi8/party-card-replica/actions/runs/40973992018)、WebKit旧画面 **339/339 PASS**＋オンライン2画面 **28/28 PASS** run [40973992092](https://github.com/8mahi8/party-card-replica/actions/runs/40973992092)。WebKitのBページでは`sessionStorage` getterを意図的に`SecurityError`にし、参加→攻防まで通した。
- **保存・引継ぎ**：配布単体HTMLはbot commit `fde4f6c`で開発ブランチへ再生成・保存。正式記録は[`docs/V2_G6_REAL_FIREBASE_TWO_TURN_AND_IFRAME_2026-10-30.md`](docs/V2_G6_REAL_FIREBASE_TWO_TURN_AND_IFRAME_2026-10-30.md)。実Firebase検証workflowとビルドworkflowは手動起動へ戻した。`main`、学校Google Sites HTML、Firebase Rules/認証の変更なし。
- **次に最も価値のある作業**：学校iPad2台のSafari/Google Sites埋込で動作確認。問題がなければG6の研究用4枚固定手札・固定補充を卒業し、**出典付きの原作正規山札・手札供給と個別カード効果の完成**へ進む。正規カード353種/500枠等を未検証の部分資料で代用して原作完成と称しない。Pagesの公開URLも未確認。

## 2026-10-30 G6最新｜防御側へ宣言済み攻撃神器・攻撃値を表示【今回の最新】

- **原作の防御画面との差を確認**：[原作ブラウザ画面の説明と画像](https://godfield-beginner.game-info.wiki/)・[攻撃/防御の原作操作](https://w.atwiki.jp/piong/pages/16.html)。G6は攻撃元→対象だけ分かり、相手の使用神器・攻撃値が見えず、判断材料が不足していた。原作では宣言済みの攻撃内容を見て防御を選べる。
- **公開する情報を最小限に限定**：`v2/staging-room.mjs`に`declaredAttackFixture(state,catalog)`を追加。`partial-reference-v2-lab`・2人・`phase=defense`・`pending.type=attack`に限り、攻撃者の選択済み物理神器の`definitionId/printedAttack/element`と印字合計値を`viewStagingRoom(...).pending.declaredAttack`に収める。**未使用の攻撃者手札/物理instanceId/内部乱数は公開しない**。この情報の表示タイミングが未確認の夢・蜃気楼など他ルールセットには広げない。
- **UI**：`v2/demo/firebase-online-lab.html`の中央防御エリアに「相手の攻撃：ワンダーソード ／ 攻10（記載値）」を表示。防御後は自動で消える。原作の属性や特殊効果を踏まえた確定ダメージを表示すると誤認しないよう「記載値」と明示。戦闘エンジンのカード解決やFirebase Rulesは変更していない。
- **検証済み**：Node **907/907 PASS**（run [`40972751669`](https://github.com/8mahi8/party-card-replica/actions/runs/40972751669)）、新オンライン2画面WebKit **28/28 PASS**＋既存WebKit **339/339 PASS**（run [`40972751651`](https://github.com/8mahi8/party-card-replica/actions/runs/40972751651)）、Chromium既存 **28/28 PASS**（run [`40972751711`](https://github.com/8mahi8/party-card-replica/actions/runs/40972751711)）。Nodeは宣言済みw016を防御者に見せつつ、未使用w017と相手の手札が出ないことを確認。WebKitは攻撃カード名・攻10の出現、双方表示、防御後消去、従来の攻撃/許す/再送を確認。
- **配布更新**：この変更は2つのバンドルに共通なので、`v2/demo/build.mjs`と`v2/demo/build-online.mjs`で`standalone.html`と`firebase-online-standalone.html`**両方**再生成・開発ブランチへ保存（bot commit `b0dd6f2a3f7e80092e892e65d3de2bc8145e14c2`）。生成前コミットのCIはバンドル整合性だけ失敗したが再生成後に合格。作業終了後のワークフローは手動起動専用へ戻した。
- **資料**：[`docs/V2_G6_DECLARED_ATTACK_DEFENSE_HUD_2026-10-30.md`](docs/V2_G6_DECLARED_ATTACK_DEFENSE_HUD_2026-10-30.md)を参照。原作画像・効果は無断転載せず、この部分の原作操作を再現するためのUI試作。
- **まだ未検証・次**：**本物のFirebaseで今回の攻撃内容表示**・学校のiPad Safari実機・GitHub Pagesの配信URLは未検証。既存の実Firebase基本対戦の検証はrun `40934112303`。次は学校iPadの試遊と表示面積/操作の確認、その後原作の正規山札・カード効果拡充。Google Sitesの学校公開HTML・GitHub`main`・Firebase Security Rules/認証設定は未変更。

## 2026-10-30 G6最新｜選択神器のタップ順と攻防確認の中央表示【この節が最新】

- **原作資料照合**：[初心者向け原作ブラウザ画面](https://godfield-beginner.game-info.wiki/)、[ゴッドフィールドWiki・攻撃と防御](https://w.atwiki.jp/piong/pages/16.html)、[追加武器などの組み合わせ説明](https://w.atwiki.jp/gfplusa/pages/18.html)。原作は選択した神器を画面に並べて確定し、複数神器の攻防が重要。画像素材は転載せず情報配置を再現。
- **修正対象**：`v2/demo/firebase-online-lab.html`。旧G6画面では選択コマンドを**タップ順**で送信する一方、中央の選択神器表示を手札の元の並び順に再ソートしていた。これを**Setの挿入順＝実コマンドの順番**で描画し、1./2.の番号を表示。選択解除→再選択後も送信側と同じ順を表示。攻・守・消費MPの印字数値合計を「カード記載値の合計（参考）」として明示（属性/特殊効果/反射等の最終結果を予測するものではない）。`view.pending.sourceId/targetId`など公開済み値から **P1 → P2** の攻撃先を表示し、相手の手札を漏らさない。エンジン、戦闘ルール、Firebase Rulesは変更なし。
- **実測**：変更後のNode **905/905 PASS** run [`40971530720`](https://github.com/8mahi8/party-card-replica/actions/runs/40971530720)。新オンラインG6の390×430 WebKit実タップ **24/24 PASS**＋旧WebKit **339/339 PASS** run [`40971341208`](https://github.com/8mahi8/party-card-replica/actions/runs/40971341208)。Chromium **28/28 PASS** run [`40971341041`](https://github.com/8mahi8/party-card-replica/actions/runs/40971341041)。WebKitで手札2番目→1番目のタップ表示順、攻10/守3、相手からの攻撃先、許すへの復帰、攻防・再送まで確認。
- **配布物**：オンライン単体HTML`v2/demo/firebase-online-standalone.html`をGitHub Actionsで生成・開発ブランチへ保存（bot commit `fb55f8c649ba5948d1bea8ac748388a0931f8878`）。[最新配布ZIP](https://github.com/8mahi8/party-card-replica/actions/runs/40971341208/artifacts/12941095297)、[WebKitキャプチャ](https://github.com/8mahi8/party-card-replica/actions/runs/40971341208/artifacts/12940582371)。初回Nodeの一致検査は生成前ファイルを読んだため1件失敗したが、再生成後の905/905で成功。単発の生成workflowは手動起動に戻した。
- **引継ぎ**：詳細資料[`docs/V2_G6_ATTACK_DEFENSE_SELECTION_PREVIEW_2026-10-30.md`](docs/V2_G6_ATTACK_DEFENSE_SELECTION_PREVIEW_2026-10-30.md)に原作出典、実装、テスト、注意点を記録。
- **次の優先**：まずGitHub PagesのHTTPS試遊経路が未設定なので、外部へ提示できる試遊URLを確認→学校iPad（Safari）2台で画面高さ・操作とFirebase実通信を確認。原作全353種/500枠、正規山札、特殊効果と詳細攻防表示などは未完成で、開発版を完全再現とは言わない。**本物のFirebaseで今回の新UIは未検証**。GitHub `main`、学校Google Sitesで貼ったHTML、Firebase Security Rules・認証は触れていない。

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
