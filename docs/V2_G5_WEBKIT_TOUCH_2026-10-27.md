# V2 G5｜WebKitタッチ操作の実ブラウザ検証（2026-10-27）

## 目的と結論

**Google SitesにHTML/CSS/JSコードを直接埋め込む**予定の学校iPad Safari向けカードゲームについて、ChromiumだけでなくWebKitでも、タッチ操作・埋め込み枠・手札の秘匿・スクロール・エラー復帰を検証する。

Playwright WebKitのLinux実行は**iOS Safari実機やGoogle Sites実環境と同じではない**。実機の代替ではなく、ブラウザエンジン差による問題の早期発見に使う。

参考：
- [Playwright公式・Browsers](https://playwright.dev/docs/browsers)
- [Playwright公式・Emulation](https://playwright.dev/docs/emulation)
- [Playwright公式・Docker](https://playwright.dev/docs/docker)

## 実装

- `tests/v2-webkit-smoke.browser.mjs`：WebKitを起動し、`isMobile:true`・`hasTouch:true`・`locale:'ja-JP'` で `iframe` 内のタッチ操作を実行。
- `.github/workflows/v2-webkit-smoke.yml`：WebKitとシステムライブラリを含むバージョン固定の公式Playwrightコンテナ `v1.62.0-noble` を開発用PRで実行。テスト時だけ `playwright@1.62.0` をインストール。
- `v2/demo/webkit-evidence/`：手札を伏せた画面・カードの選択画面・交代画面を1024×460と390×430の固定高さ枠で保存。

**製品HTMLにPlaywrightを入れていない。** `package.json` や本番通信の依存は増やしていない。既存のChromium自動テストとNode回帰はそのまま併用。

## 検査ケース

- 1024×768と390×844の外側ビューポート（内部埋め込み枠はそれぞれ460px・430pxの高さ）。
- 横方向に内容がはみ出さず、初期手札は伏せられている。
- `tap()` で手札を表示し、カードを選択できる。タップ領域は最低44pxを目安。
- 枠内を最下部までスクロールしても「攻撃を確定」が見える。
- 次のプレイヤーの防御画面に変わったら、埋め込み枠のスクロール位置を0へ戻し、相手の手札は見えず、「自分の手札を見る」がスクロールなしで押せる。
- 防御なしの確定後、次のターンが正しい人へ移る。
- 2回押してリセットすると最初のプレイヤーへ戻る。
- `オーラ＋火の玉` の未検証な組み合わせは拒否し、元の人のカード選択に戻って修正できる。
- WebKitコンソールでのJavaScriptの例外なし。
- ブラウザ証拠の画像を目視して、日本語・ボタン・固定フッターの重なり等を検査する。

## 初回実行（変更前）

- **WebKit実操作44/44チェック合格**：GitHub Actions run **40524158796**。
- **Chrome実操作28/28チェック合格**：run **40524158298**。
- **Node.jsルール・UIテスト302/302合格**：run **40524158336**。

WebKitのスクリーンショットでは日本語グリフも正常に描画されていた（Linux WebKitでの見た目でありiPad実機ではない）。

初回の画像で、長い手札一覧の最下部において固定の確定ボタンとフッターのリセット操作が近接していることを発見。`v2/demo/template.html` にフッター下の余白を追加し、WebKitテストにも**リセットと確定の非重複**を確かめる項目を追加した。

## 残っているゲート

- 友達同士のiPad Safari実機で、Google Sitesに貼ったコードの動作・操作・画面枠・日本語グリフを確認すること。
- オンライン1vs1の部屋同期（認証を過剰に複雑化しない構成・無料厳守）、操作の正当性・手札秘匿・原子的な部屋更新。
- 原作の全カード・抽選確率・重要な特殊ルールの出典照合、BOT等はまだ未完成。
- 固定の開始手札・革の帽子のテスト用補充を正式版と混同しない。

**Draft PR内のみ変更。mainと学校のGoogle Sites公開版は変更禁止。**
