# G4 → 共通HP0処理｜太陽のお守り・自動復活の研究実装（2026-10-29）

## 結論

**HPが0になったときの自動復活は、原作根拠が揃った部分だけ共通エンジンへ追加できた。** 「太陽のお守り」はHP0で1枚消費し、持ち主をHP10へ復活させる。大きすぎるダメージの余りは復活後へ持ち越さない。複数枚を持っているときでも一度のHP0に対して使用するのは1枚。

ただし、**売るによる致死売買の金銭・手札移動・復活の正確な前後関係は未解明**で、これを自動復活で勝手に解決したことにはしない。現時点で共通エンジンに接続したのは「hit」によるHP0だけ。その他のHP0原因（災い・取引・自動行動・復活後継続ダメージ）はこの共通計算を将来使えるが、原作で優先順を照合してから接続する。

## 原作の根拠と確認の強さ

| 項目 | 根拠 | 確度・今回の扱い |
| --- | --- | --- |
| 太陽のお守りは¥10・0.2%（500枠中1） | [ゴッドフィールドwiki・神器一覧](https://w.atwiki.jp/piong/pages/19.html)、[2026年2月の神器調査](https://macarongamemo.com/entry/godfield-artifact) | 同じ値を示す独立した二次資料。研究台帳`i005`へ登録 |
| HP0で自動消費、HP10で復活、任意に捨てられない | [ゴッドフィールドwiki](https://w.atwiki.jp/piong/pages/19.html)、[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html) | `onZeroHp`効果と`discardPolicy:'forbidden'`で実装 |
| 1回の復活で複数枚の護符が同時には消えない | [2016年の実戦解説](https://ameblo.jp/roctar1550/entry-12169716304.html)・[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/47010.html) | 同一イベントで1枚を消費、HP0が再発したとき次の護符を消費 |
| 攻撃の超過ダメージを復活後に持ち越さない | [ゴッドフィールドwiki・タイマン攻略](https://w.atwiki.jp/piong/pages/21.html) | 再生後HPは必ず10、オーバーキルを次の命に繰り越さない |
| 発動の一般的な優先順 | 2016年記事・2015年Q&Aは「昇天弓」より先と主張。ただし古い版の証言 | 現行版の昇天弓処理を実装しない |
| 消費された護符の手札を補充する正確なアニメーション時点 | [一般的な使用神器の補充](https://w.atwiki.jp/aniwotawiki/pages/47010.html)、[別の消費アイテムの補充](https://w.atwiki.jp/piong/pages/19.html) | **同一の共有refill段階で1枚固定補充するラボ仮定。原作の直接トレースによる確定ではない** |

資料は二次資料であり、2026年現在の本家クライアントのDOM・ネットワークイベント、iPad上の実プレイ動画を直接解析したものではない。

## 構造・実装

1. `src/verified-basic-cards.mjs`：`i005 太陽のお守り`（¥10・1/500、`effect:'sun_revive'`、意図的に捨てられない）を部分台帳へ登録。研究版は**94種類／270参考枠**。全353種類／500枠は未完成であり、研究抽選を本番確率として使わない。
2. `v2/foundation.mjs`：`playModes:['passive']`、`onZeroHp`トリガー、`reviveAtZeroHp({hp:10})`効果を厳格な型定義へ追加。パラメータの独自増殖や別タイミングを拒否。
3. `v2/legacy-adapter.mjs`：旧研究台帳の`sun_revive`を汎用効果定義へ変換。対戦処理本体はカード名を照合しない。
4. `v2/zero-hp-recovery.mjs`：純関数`planZeroHpRecoveryFixture`を新設。生存HPの場合は`survived`、手札の該当受動カード1個とHP0なら`revived`、無ければ`eliminated`。無効なHP・不正な効果定義を拒否。元のstateは変えない。
5. `v2/effect-runner.mjs`：既存の単一`hit`命令後、**HP0だけで復活を評価**。該当護符1個を手札から消費、`revive`イベントを記録しHP10へ変更。共有refillで使用数に対応した研究用カードを1枚補充し、HPが正なので次の手番へ移行。通常のダメージイベント`hpAfter:0`はそのまま残し、復活を別イベントで監査可能。
6. `v2/lab-controller.mjs`：`loadRevivalTrial()`を追加。P1ワンダーソード（攻10）、P2太陽のお守り+革の帽子（研究用初期HP5）で、P2が無防御で受けるとHP10へ自動復活。受動カードは手動選択不可。
7. `v2/lab-ui.mjs`：研究シナリオ起動ボタン、無効化された受動カードと「HP0で自動発動」の説明を表示。P1→P2の手札秘匿を維持。
8. `v2/demo/build.mjs`：26モジュールの依存順に`zero-hp-recovery`を組み込み、`v2/demo/standalone.html`と既存の`demo/standalone.html`を再生成してソースと同期。
9. `tests/zero-hp-revival-v2.test.mjs`新規14件：価格・重量・型、純関数、正のHPで発動しない、過剰攻撃、1枚／2枚保持、2回HP0、未所持の敗北、捨てられないこと、攻撃経由の2人戦、3人戦での他プレイヤー不変、致死売買の厳格な保留。
10. `tests/sun-charm-ui-v2.test.mjs`新規4件と`tests/v2-webkit-smoke.browser.mjs`の研究用タップシナリオ：390×430のGoogle Sites型固定iframeで、P1攻撃→P2無防御→HP10復活→P2次ターン・手札補充を確認する。

## G4 / 今後のロードマップ

- **確定**：通常の攻撃がHP0を作る場合の「太陽のお守り」1枚消費・HP10復活・超過ダメージ破棄。カード名依存でなく共通効果で処理。
- **ラボ前提**：消費カードの補充は既存の共通refill段階で固定`d001`を補充。これを原作の正確な時間・抽選分布と誤称しない。
- **未解決・実装保留**：「売る」でHP0を生じさせた場合の代金配分、神器移動、死亡/復活、手札補充の順序。天国病発作、あぶないウス、昇天弓など特殊順序、反射/連続取引の差も別途研究。
- **公開範囲**：main・Google Sites学校公開版は触らず、研究ブランチ`refactor/v2-foundation-review-20261027`とDraft PR #1のみに保存。Linux WebKit自動タップ試験は学校iPad Safari実機の確認ではない。

検証証拠と最終HEADは[開発PR #1](https://github.com/8mahi8/party-card-replica/pull/1)コメントに記録する。
