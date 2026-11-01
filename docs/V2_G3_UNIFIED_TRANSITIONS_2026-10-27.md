# V2 G3：共通対戦操作窓口と複数ターン通しテスト（2026-10-27）

## 結果（最新）

**GitHub Actions Node.js / Rules Lab Tests：287件成功、失敗0件。** ワークフロー実行 **40509833286**。

- \`v2/room-transition.mjs\` に、開発用の統一窓口 \`submitAndResolveFixture()\`、解決窓口 \`resolveStagedFixture()\` を追加。
- \`tests/room-transition-v2.test.mjs\` に**新規15件**。従来272件＋15件で287件。
- Draft PR \`refactor/v2-foundation-review-20261027\` でのみ開発。**main／学校Google Sites版／旧ゲームの公開デモは変更していない。**
- 手札やMP・カード補充などは新しいV2の効果エンジンで処理するが、**現在の本番カード出現率、無料オンライン接続、学校iPad Safari動作は未対応・未検証**。

## なぜ統一窓口を作ったか

従来は \`resolveBasicFixture\` / \`resolveRedirectFixture\` / \`resolveSoloMiracleFixture\` / \`resolveWallFixture\` が分かれていた。今後UIや通信層からそれぞれを呼び分けると、「反射を忘れてダメージ確定」「奇跡を武器として計算」などの事故が起こる。

新しい窓口では、受理した操作の状態を読んで共通の方法で対戦処理へ流す。

\`\`\`text
認証済み席のコマンド
  │
  ▼
applyStagingCommand(state, command)
  ├── 不正なカード・重複入力・古いrevisionを拒否
  ├── ターン中の攻撃選択 → 相手の防御待ち
  └── 防御宣言または自己攻撃 → resolving
                                          │
                                          ▼
                                  resolveStagedFixture()
                                      ├── 単独奇跡 → Miracle resolver
                                      └── 武器系   → Redirect resolver
                                                    ├── 反射・弾く
                                                    ├── 壁で停止
                                                    └── 通常防御→ダメージ
                                          │
                                          ▼
                               共通 effect-runner.mjs
                               MP・習得・使用カード・補充・次手番
\`\`\`

### 使い方（開発時限定の例）

\`\`\`js
import {submitAndResolveFixture} from './v2/room-transition.mjs';

const outcome=submitAndResolveFixture(state,{
  commandId:'cmd-123',
  expectedRevision:state.revision,
  actorId:'A',
  type:'playCards',
  targetId:'B',
  orderedInstanceIds:['ci-001']
},catalog,{
  authorizedSeatId:'A',       // 信頼できる入口で照合した席
  labOnly:true,
  fixtureDrawDefinitionId:'d001'
});

const nextAuthoritativeState=outcome.state;
\`\`\`

重要：\`authorizedSeatId\` はブラウザが自由に申告した値をそのまま使ってはいけない。身内限定であっても、無料オンライン用の実装ではサービス/ルーム権限に由来する本人識別が必要。

\`state\` や \`events\` は非公開のルーム内部状態。**クライアントには \`viewStagingRoom(nextAuthoritativeState, authenticatedSeatId)\` で投影した情報だけを渡す。**

現時点ではすべての状態遷移が**純粋な関数・JSON可シリアル化状態**。ただし「複数端末が同じrevisionで同時保存する」場合の**原子的な更新/競合防止は外部ストレージ側のCAS/トランザクションで保証すること**。\`expectedRevision\` だけではネットワークの競合は防げない。

## 何をテストしたか（新規15件）

1. 1vs1の攻撃宣言→防御→次の手番への自動進行
2. 3人対戦で3回連続して全員に手番が移ること
3. 対戦が完了した後に同一操作が再送されても二重処理しないこと
4. 属性に合わない盾を出した場合、元の状態は壊れず修正入力で続行できること
5. 自分自身への攻撃で追加防御待ちにならないこと
6. 習得済みの単独攻撃奇跡を武器コンパイラへ誤送しないこと
7. エンゼル防具による奇跡停止
8. 反射後に新しい防御者の応答を待つこと
9. 自分へ弾き戻った攻撃は追加防御なしで解決
10. 武器と習得済みオーラを組み合わせ、複数反射してもMPは一回だけ支払うこと
11. 習得済み壁で通常武器を止められること
12. 偽の送信席・古いrevisionを拒否
13. 未確認の複合攻撃を普通のダメージとして通さないこと
14. 自分以外の手札・攻撃順をクライアント向けの投影に含めないこと
15. 開発専用の固定補充を明示しない限り呼べないこと

## 「完了」とは呼ばない部分

- **G3で今後追加する必要あり**：全体攻撃、既知の他の特殊効果、複数の奇跡コンボや特殊対象選択、災い・守護神・商人、指輪反撃、状態異常。
- **G4 原作照合**：現在は研究済み68種類・重み186枠の**部分版**。Wikiの「353種類・500枠」は参照版の値であって現行原作の確定値ではない。追加資料や原作実機で優先して差分確認。
- **G5 画面**：共通窓口はJavaScriptのモジュールであり、まだiPad向けのV2操作画面に接続していない。
- **G6 無料オンライン**：ルーム作成、2端末同期、再接続、権限、手札秘匿、原子的更新、連戦テストは未実装。
- **抽選**：\`fixtureDrawDefinitionId\` は固定カードを補充する**試験専用オプション**。本番確率を再現しない。本番公開へ流用しないこと。
- **実機**：GitHub ActionsのNode.js合格はSafari/Google Sitesでの実機操作や原作との一致を保証しない。

## 次の開発推奨

1. **原作根拠付きの「今動かせる」ケースを固定テストに加える。** 全カードを埋める前に、実際の原作と挙動がずれている重要ケースを見つける。
2. G5の実験として、**V2の統一窓口を操作できる最低限のローカル画面**につなぐ。オンラインや本番抽選と誤解されない試験専用仕様を明記。
3. G6の権威/ネットワークは無料運用、Google Sitesコード直貼り、iPad Safari実機での動作を検証してから採用。常時サーバーが必要な重い既製ゲームエンジンへの急な全面移行は避ける。

### 設計参考

- [boardgame.io の概念説明](https://boardgame.io/documentation/) — 状態・手番・フェーズ・コマンドを明確に分け、ゲーム状態をJSONで表す設計。
- [boardgame.io Stages](https://boardgame.io/documentation/stages.html) — 手番中に別プレイヤーが防御・割り込み入力するような段階的操作の参考。
- 既存の[原作再現の資料台帳](SOURCE_LEDGER.md) — カード効果の根拠確認。ゲームコード・画像のコピーではない。

**注意**：boardgame.ioそのものを採用したわけではなく、設計上の参考。外部依存は増やしていない。
