# G7｜奇跡〈吸収〉の単体対戦実装（2026-11-02）

## 目的と原作根拠

前工程の〈閃光〉の確率全体攻撃は、外れ時の防御操作・反射順序が原作二次資料から確定しない。その不明条件を推測で補完するのではなく、**既存の共通吸収武器の処理を流用し、すぐに遊べる原作カードを追加**する。

資料：
- [2026年まかろん神器一覧](https://macarongamemo.com/entry/godfield-artifact)：「〈吸収〉」= **光属性・MP10・攻10・与えたダメージ分HP回復・参考0.2%**。
- [Piong奇跡一覧](https://w.atwiki.jp/piong/pages/20.html)：**MP10・攻10・HP吸収・参考0.2%**。資料の「天」表記は属性ラベルの版差があり、現在の2026年資料に従い光属性を採用。
- [Piong属性仕様](https://w.atwiki.jp/piong/pages/16.html)：光属性攻撃は通常の防具では防御できず、虹のカーテンを使った場合は無属性化される。
- [Piong戦術](https://w.atwiki.jp/piong/pages/25.html)：弾きで攻撃者が変わる吸収効果。反射先へ回復先が移ることを、既存の「攻撃元を保持して反射」方式と照合した。

## 実装

- `src/verified-basic-cards.mjs`：`m019`、`role:'attack'`、`hpAbsorb:true`、光/攻10/MP10/価格0/参考1枠。
- `v2/legacy-adapter.mjs`：吸収奇跡を、既存の武器と同じ**型付き `afterHit:absorbHp({amount:'damage'})`** に変換。正規値以外を拒否する。
- `v2/miracle-resolution.mjs`：単体奇跡で、既存の `calculateHit` の解決ダメージへ `lifeSteal:true` を付ける。既存のMP支払い、奇跡習得、精霊によるMP免除、反射とターン進行をそのまま流用。
- `v2/effect-runner.mjs`：`lifeSteal` 認可に奇跡も追加。初回物理・習得済み、反射後の不変`pending.attackContext`の原本IDと型付き効果を検証。**実ダメージ分のみ現在の攻撃元を回復**、HP上限99、武器系吸収の動作は変更しない。
- `v2/demo/firebase-online-lab.html`：24番目の固定研究用セット`absorbMiracle`で〈吸収〉・精霊・虹のカーテン・スーパーミラーを使える。正規500枠の山札として公開しない。
- `tests/g7-absorb-miracle-v2.test.mjs`：定義、通常使用、光属性と虹のカーテン、防御による0ダメージ、スーパーミラー反射、習得済み再詠唱、精霊MP免除、MP不足の原子的拒否、HP99、未確認連携の拒否。
- `tests/v2-firebase-online-webkit.browser.mjs`：**独立2画面＋模擬Realtime Database**で、詠唱→鏡で反射→元詠唱者が被弾→反射者HPが回復する実タップテストを追加。

## 台帳と公開権限

- 研究資料は**183種類／444参考枠、`complete:false`**。原作の正規分母500の再現とは別。残りカードや出現率を創作しない。
- 学校Google Sites直接貼り付け版／main／Firebase Rules／認証方式の変更は禁止・今回も未変更。単体HTML再生成はGitHub開発ブランチのみ。
- 学校iPadのSafari実機と今回の新カードに対する本物Firebase接続は別途確認する。

## 残課題

〈閃光〉の確率全体攻撃の防御・反射順は引き続き未確定。全体確率攻撃の基礎計算と仮想防御は別の研究モジュールとして存在し、実戦への接続は原作確認が取れた部分のみ行う。

CIの最終件数・結果はテスト完了後にこの資料と`HANDOFF_LATEST.md`へ記録する。
