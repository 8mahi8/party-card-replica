# G7｜病を付ける4つの武器と防御・反射（2026-10-30）

## 原作調査

- [2026年2月版の原作神器一覧](https://macarongamemo.com/entry/godfield-artifact)および[Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)。各武器は「**ダメージを与えた対象**に」病を付ける。完全防御の場合は病が付かない。
- **疾風剣**：無属性・攻撃9・価格¥10・確率0.2%（1/500）・風邪。
- **激烈疾風剣**：無属性・攻撃13・価格¥15・確率0.2%・風邪。
- **風のカギ爪**：**土属性**・攻撃1・価格¥10・確率0.2%・風邪。土属性の防御は既存の原作属性相性表に従い木/光防具が有効。同じ土の防具では防げない。
- **地獄のハサミ**：無属性・攻撃8・価格¥15・確率0.2%・地獄病。
- [Piong災い一覧](https://w.atwiki.jp/piong/pages/23.html)および[2022年の攻略](https://note.com/hantama_dm/n/n8f690316f015)：病がない相手は該当病から開始。すでに他の病にかかった相手は、追加付与によって**病がちょうど1段階進行**（強い病を当てても飛ばさない）。天国病でさらに病を受けると発作によってHP0。
- **直接の原作ゲーム画面では未測定**：防御と感染の視覚演出、被ダメージでHP0になる同時処理、太陽のお守り発動との厳密な順番。研究実装は、既存の本家資料に沿って実ダメージの後に病付与を行い、HP0から復活した場合も病効果を適用する。稀な特殊順序の詳細は現行原作で直接確認後に確定する。

## 実装

- `src/verified-basic-cards.mjs` に `w056`～`w059` を追加。既存のmain武器factoryの`diseaseOnHit`メタデータを用いるため、カードごとの固有コードを作らない。`v2/legacy-adapter.mjs` と `v2/foundation.mjs` は後処理の厳密型 `afterHit:inflictDisease({disease:'cold'|'hell'})` を定義。
- `v2/ordered-attack.mjs` はソース武器の発症種類を不変`attackContext.diseaseOnHit`として保持。未知の複合連撃・蜃気楼・強化奇跡との合成には勝手な順序を仮定せず研究版では一旦失敗させる。`v2/basic-resolution.mjs` は**実際にHPダメージが通った時だけ**命中キューの後ろに`inflictDisease`を載せる。防御によってダメージ0なら感染しない。
- `v2/effect-runner.mjs` は攻撃元のソース効果・実ダメージ・対象を検証した上で、共通`planDiseaseExposure`を使用。反射によって被弾者が変わっても感染先は**最終的な実被弾者**であり、感染したプレイヤーだけが自分のターン終了時の病HP変化を受ける。天国病の追加感染によるHP0と太陽のお守りの復活は既存G7共通処理を利用。
- `v2/disease-rules.mjs` の`planDiseaseExposure(previous,incoming='heaven')`を拡張。すでに実装済みの天国草の動作を変えず、今回の風邪／地獄病にも同じ病エンジンを使う。
- `v2/demo/firebase-online-lab.html` に11番目の`illnessAttack`研究用固定手札セットを追加。Aは疾風剣・地獄のハサミ・ハートの貝がら、Bはスーパーミラー・高守備防具・スマイルの貝がら。原作の未完成な抽選は使わない。研究台帳は**172種類・433/500参考枠・`complete:false`**。
- 学校Google Sites版HTML、GitHub main、Firebase Security Rules／認証は変更しない。

## 検証

- `tests/g7-disease-on-hit-weapons-v2.test.mjs`：11テストで原作数値と属性、病初発・重ねがけ、HPダメージ0の防御、部分ガード、反射時の感染先、天国病発作、お守り復活と手番、コマンド再送の無害性を確認。
- `tests/v2-firebase-online-webkit.browser.mjs`：2画面のWebKitにおける通常風邪／防具完全防御／スーパーミラー／地獄病の4シナリオを追加。ゲーム画面の病表示、HP数値、手番、狭いiframe内の横はみ出しを確認。
- `tests/v2-g6-live-firebase.browser.mjs`：4シナリオを実際のRTDBの独立試験ルームで確認し、ホストIDを照合して削除。ログや結果については`HANDOFF_LATEST.md`最新節を参照。
- **学校iPad Safari＋Google Sitesの直接貼付環境では未検証**。GitHub ActionsのWebKitは代替的な自動試験であり学校実機ではない。

## 次の作業

病を付与する武器の命中後に今回作ったスマイル／ハートの貝がらで正しく治療できる一連のラウンド操作を試す。別系統の災い（夢・霧・閃光・暗雲）や、独立した奇跡〈風〉〈天国風〉は原作の発動・消費・対抗手段を比較してから実装する。公式山札全353種・500枠の未完成状態は維持する。


## 確認結果（後続追記）

- **Node 1005/1005 PASS**：[run 41070293489](https://github.com/8mahi8/party-card-replica/actions/runs/41070293489)、**Chromium PASS**：[run 41070293285](https://github.com/8mahi8/party-card-replica/actions/runs/41070293285)。最新コード＋生成済み単体HTMLの状態で再確認。
- **WebKitオンライン2画面168/168 PASS**、固定画面339/339 PASS：[run 41070397615](https://github.com/8mahi8/party-card-replica/actions/runs/41070397615)。390×430のタップ操作で風邪通常命中・高防御の完全ガード・スーパーミラーによる反射・地獄のハサミによる地獄病を確認。
- **実Firebase 18シナリオ全成功**：[run 41070847262](https://github.com/8mahi8/party-card-replica/actions/runs/41070847262)。既存14ケースに追加した4ケースで`G7_LIVE_DISEASE_WEAPON_COLD_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_BLOCKED_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_REFLECT_SUCCESS`、`G7_LIVE_DISEASE_WEAPON_HELL_SUCCESS`を確認。独立試験用ルーム18件は、作成ホストIDを照合しすべて削除済み（18回の`G6_LIVE_CLEANUP_SUCCESS`）。
- **デバッグ経過**：土攻撃の防御テストで、原作の相性表と異なる土防具を指定していたため木防具へ修正。実Firebaseの初回検証では、部屋参加で増えるrevisionを数えずに「固定revision=2」と決めつけたので正常な風邪命中が誤失敗。**両席のrevision一致＋防御前からの単調増加**に変更し、再試験で正常終了。これらはテストの前提の修正であり、ゲーム本体の感染処理ではない。
- 2つの検証用ワークフローは試験後に従来の**`workflow_dispatch`手動専用**へ戻した。学校版のGoogle Sites直貼りHTMLとFirebaseルールには触れていない。学校のSafari実機はまだ未検証。
