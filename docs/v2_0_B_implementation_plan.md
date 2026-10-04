# v2.0-B 職種コレクションゲーム — 実装プラン

**目標**: `SDD_Specification_v2_0_B_full.md`・`project_prompt_v2_0_B.md`・
`v2_0_B_implementation_prompts_v1.1.md` の3文書に基づき、
職種コレクションゲーム（v2.0-B）をゼロからフルスタック実装する。

**スコープ**: Phase 1（プロジェクト初期化）〜 Phase 12（デプロイメント設定）  
**技術基盤**: Node.js 24 / Express / ws / better-sqlite3 ^12.8.0 / Vanilla JS / 2D HTML CSS  
**3D**: 使用しない（Three.js / SceneManager 一切不要）  
**参照**: 全サブタスクは本プランファイルを読んだうえで実施すること

---

## アーキテクチャ概要

```
ファイル構成:
├── server.js          ← Express + WebSocket バックエンド
├── index.html         ← 2D UI + CSS アニメーション
├── game.js            ← I18n + GameClient
├── admin.html         ← 管理画面
├── initdb.js          ← DB初期化スクリプト
├── check-db.js        ← DB整合性チェックスクリプト
├── package.json       ← 完成済み
├── .env.example
├── .gitignore
├── CLAUDE.md
└── lang/
    ├── ja.json
    └── en.json
```

**ゲームの中心コンセプト**:  
- スキル/ミッションカードを集めて「職種カード」のレシピを自動充足する  
- カードは消費されない（永続所持・再利用可能）  
- 職種カードは「開始前に選ぶもの」ではなく「プレイ中に複数獲得するもの」  
- 2D のみ（Three.js 不使用）

---

## Phase 1: プロジェクト初期化（設定ファイル整備）

**Status**: [ ] pending

**Intent**:  
既に `package.json` / `CLAUDE.md` が存在しているため、不足している `.env.example`（`env.example` として存在）と `.gitignore` の内容を確認し、スケルトン状態の各ファイルを整備する。

**Expected Outcomes**:  
- `.env.example` が正しいキー（ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_TOKEN_EXPIRY_HOURS/PORT/MAX_PLAYERS）を持つ  
- `.gitignore` に `node_modules/`・`.env`・`game.db`・`*.log` が含まれる  
- `lang/` ディレクトリが存在する  
- `check-db.js` がスケルトン状態で存在する  

**Todo List**:
- [ ] `env.example` の内容を `v2_0_B_implementation_prompts_v1.1.md` Prompt 1-1 と照合し、必要なら補完する
- [ ] `.gitignore` を確認・補完する
- [ ] `lang/ja.json` と `lang/en.json` の空ファイルを確認・作成する
- [ ] `check-db.js` がスケルトン状態であることを確認し、なければ空ファイルを作成する

**Relevant Context**:  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 1-1（設定ファイル定義）  
- `package.json`（完成済み）

---

## Phase 2: データベース設計と初期化

**Status**: [ ] pending

**Intent**:  
`initdb.js` を完全実装する。8テーブルのスキーマ定義・初期シードデータ投入・冪等性・トランザクション・投入前自己検証の4要件を満たす。

**Expected Outcomes**:  
- `npm run initdb` を実行すると `game.db` が生成される  
- テーブル数: 8（skill_types / mission_categories / category_cards / skill_cards / missions / category_skill_links / category_mission_links / game_settings）  
- 初期データ件数: skill_types(3) / mission_categories(4) / category_cards(12) / skill_cards(15〜20) / missions(15〜20) / game_settings(1: skill_mission_ratio='70:30')  
- 再実行しても `UNIQUE constraint failed` が発生しない（冪等性）  
- `category_skill_links` / `category_mission_links` 投入前に `required_*_count ≤ 紐付け数` を自己検証する  
- 全 INSERT を `db.transaction()` でラップする  

**Todo List**:
- [ ] `initdb.js` の既存コードを読み込み、Phase 1-1〜2-1 の仕様と照合する
- [ ] テーブル DDL（SDD Section 4）を `initdb.js` に完全実装する
- [ ] 初期シードデータ（職種12種・スキル15〜20件・ミッション15〜20件）を投入する
- [ ] 冪等性（既存 DB 削除 → 再作成）を実装する（`fs.existsSync` → `fs.unlinkSync`）
- [ ] 投入前の自己検証（閾値 ≤ 紐付け数 チェック）を実装する
- [ ] 全 INSERT を `db.transaction()` でラップする
- [ ] `check-db.js` を実装する（テーブルカウント・バリデーション・game_settings 表示）

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 4（テーブル定義全文）  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 2-1（initdb.js）・Prompt 2-2（check-db.js）  
- `initdb.js`（現在の状態）

---

## Phase 3: サーバー骨格・REST API

**Status**: [ ] pending

**Intent**:  
`server.js` に Express アプリ・認証（UUID Bearer token）・全 REST API エンドポイントを実装する。WebSocket は次フェーズ。

**Expected Outcomes**:  
- `GET /api/health` → `{ ok: true }`  
- `POST /api/auth/login` → UUID token 発行  
- `GET /api/cards/categories`、`/skills`、`/missions`、`/skill-types`、`/mission-categories`、`/category-recipes` が正常レスポンスを返す  
- `GET /api/settings/distribution` → `{ skillRatio: 70, missionRatio: 30 }`  
- `GET /api/lang/:lang` → 翻訳 JSON を返す  
- 全 `/api/admin/*` が Bearer token 認証ガードされる  
- `PUT /api/admin/categories/:id/recipe` でサーバー側バリデーション（閾値 1 以上・紐付け数以下）が動作する  
- CSV インポート (`POST /api/admin/import/:type`) が部分取り込みをせず行番号付きエラーを返す  

**Todo List**:
- [ ] `server.js` の骨格（`require` 群、Express 初期化、HTTP サーバー起動）を実装する
- [ ] 管理画面認証（`issueToken` / `requireAdminAuth` / `POST /api/auth/login`）を実装する
- [ ] 読み取り系 REST API（`/api/cards/*`、`/api/settings/distribution`、`/api/lang/:lang`、`/api/health`）を実装する
- [ ] 管理用 CRUD API（`/api/admin/categories`、`/skills`、`/missions`、`/skill-types`）を実装する
- [ ] `PUT /api/admin/categories/:id/recipe`（閾値バリデーション含む）を実装する
- [ ] `PUT /api/admin/settings/distribution`（合計 100 バリデーション）を実装する
- [ ] `POST /api/admin/import/:type`（CSV upsert、行番号付きエラー）を実装する

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 3・11  
- `project_prompt_v2_0_B.md`「REST API エンドポイント一覧」  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 3-1・3-2

---

## Phase 4: WebSocket — ルーム・ロビー・退出・チャット

**Status**: [ ] pending

**Intent**:  
WebSocket サーバーをアタッチし、ゲーム開始前のメッセージ（`createSession` / `joinSession` / `startGame` / `resign` / `chatMessage`）のハンドラを実装する。セッションオブジェクトはサーバーメモリに保持する。

**Expected Outcomes**:  
- `createSession` で `sessionCreated`（inviteUrl 付き）が返る  
- `joinSession` でロビーへの参加・`COLOR_TAKEN`・`SESSION_FULL`・`MID_GAME_JOIN_NOT_ALLOWED` エラーが正しく動作する  
- `startGame` で `NOT_HOST` / `NOT_ENOUGH_PLAYERS` バリデーションが動作する（`NOT_ALL_SELECTED` は**存在しない**）  
- ロビー中の `resign` でプレイヤーが削除され `playerLeft { phase:'lobby' }` が全員にブロードキャストされる  
- ゲーム中の `resign` で `player.status='left'` になり `playerLeft { phase:'game' }` が全員にブロードキャストされる  
- `chatMessage` がロビー・ゲーム中を問わず全員にブロードキャストされる  

**Todo List**:
- [ ] WebSocket サーバー（`ws.Server`）を HTTP サーバーにアタッチする
- [ ] セッションストア（`Map<sessionId, session>`）と `playerId → ws` マッピングを実装する
- [ ] セッションオブジェクト構造（SDD 5.3節・Prompt 4-1 に準拠）を定義する
- [ ] `handleCreateSession`・`handleJoinSession` を実装する
- [ ] `handleStartGame`（バリデーション付き）を実装する
- [ ] `handleResign`・WebSocket 切断検知（`on('close')`）を実装する
- [ ] `handleChatMessage` を実装する（モデレーション不要・DB 保存不要）

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 5・8・9・10.5  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 4-1〜4-4  
- セッションオブジェクト構造: `{ id, hostPlayerId, players[{id, name, colorId, board:{skillIds:Set, missionIds:Set, achievedCategoryIds:Set}, seenSkillIds:Set, seenMissionIds:Set, status:'active'|'left'}], maxPlayers, turnsPerPlayer, currentTurnIndex, totalTurnsElapsed, status:'lobby'|'in_progress'|'finished' }`

---

## Phase 5: WebSocket — ゲームループ・職種判定

**Status**: [ ] pending

**Intent**:  
`rollDice` / `selectCard` / `nextTurn` / `resetGame` のハンドラと、最重要ロジックである職種カード充足判定（`checkCategoryAchievements`）を実装する。

**Expected Outcomes**:  
- `rollDice` でサイコロ出目 N を決定し、`skill_mission_ratio` に従い N 種類の候補を重複なしで抽選する  
- 候補は手番プレイヤーのみに `candidatesPresented` で送信される  
- 個人ごとの出尽くし判定（`seenSkillIds` / `seenMissionIds`）が機能する  
- `selectCard` のバリデーション（候補外・既所持カードは `INVALID_CANDIDATE_SELECTION`）が動作する  
- カード獲得後に `checkCategoryAchievements` が呼ばれ、条件を満たした職種カードが自動獲得される  
- 1 回のカード獲得で複数の職種カードが同時に達成されうる  
- `nextTurn` で `status='left'` プレイヤーがスキップされる  
- 総ターン数到達で `gameEnded`（同着タイブレークなし）が送信される  

**Todo List**:
- [ ] `handleRollDice`（出目算出・`drawCandidates`・`candidatesPresented` 送信）を実装する
- [ ] `getAvailablePool`（個人単位の出尽くし判定・`seenIds` リセット）を実装する
- [ ] `drawCandidates`（`skill_mission_ratio` 反映・候補内重複排除）を実装する
- [ ] `handleSelectCard`（バリデーション・ボード更新・`cardAcquired` ブロードキャスト）を実装する
- [ ] `checkCategoryAchievements`（SDD 7.1〜7.2節、種類数判定・排他ロックなし・複数同時達成対応）を実装する
- [ ] `handleNextTurn`（left プレイヤースキップ・ゲーム終了判定）を実装する
- [ ] ゲーム終了処理（ランキング生成・同着扱い・`gameEnded` 送信）を実装する
- [ ] `handleResetGame` を実装する

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 6・7（充足判定式・判定タイミング）  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 5-1〜5-4  
- 充足判定式: `|player.skillIds ∩ category.linkedSkillIds| ≥ required_skill_count` かつ `|player.missionIds ∩ category.linkedMissionIds| ≥ required_mission_count`  
- ID型比較バグ防止: `Number()` で統一

---

## Phase 6: index.html — 構造と CSS

**Status**: [ ] pending

**Intent**:  
`index.html` に 2D UI の DOM 骨格と全 CSS を実装する。Three.js CDN は一切含めない。

**Expected Outcomes**:  
- `<div id="app">` が `render()` の書き換え対象として存在する  
- `#sb`（スコアバー）・`#category-dex-modal`（職種図鑑モーダル）が CSS で固定配置される  
- 3 つの必須 CSS アニメーション（`su` / `fo` / `pip`）が定義されている  
- `.candidate-card`（1st tap ハイライト・2nd tap 確定）/ `.card-chip`（スキル・ミッション・未所持）/ `.category-chip`（獲得済みゴールド枠）/ `.toast-notification` のスタイルが定義されている  
- プレイヤーカラー 6 色が CSS 変数またはクラスで利用可能  
- `<script src="game.js">` が `</body>` 直前に配置されている  

**Todo List**:
- [ ] `index.html` の基本 HTML 骨格（`<!DOCTYPE html>` 〜 `</html>`）を実装する
- [ ] `<style>` ブロックにレイアウト・カラーパレット CSS を実装する
- [ ] 必須 CSS アニメーション（`su` / `fo` / `pip`）を実装する
- [ ] UI パーツ CSS（`.candidate-card` / `.card-chip` / `.category-chip` / `.toast-notification`）を実装する
- [ ] `#sb`・`#category-dex-modal` の固定配置 CSS を実装する

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 10  
- `project_prompt_v2_0_B.md`「クライアント UI 構成」「必須 CSS アニメーション」  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 6-1・6-2

---

## Phase 7: game.js — I18n・GameClient 骨格・WebSocket 受信

**Status**: [ ] pending

**Intent**:  
`game.js` の `I18n` クラスと `GameClient` クラス骨格（コンストラクタ・データ取得メソッド・WebSocket 接続・全受信ハンドラ）を実装する。

**Expected Outcomes**:  
- `I18n.load(lang)` が `GET /api/lang/:lang` を fetch し `translations` を格納する  
- `I18n.t(key, params)` がドット区切りキー解決と `{{name}}` プレースホルダー置換を行う  
- `GameClient` のコンストラクタに `mode`・`session`・`myPlayerId`・`categoriesCache`・`skillsCache`・`missionsCache`・`categoryRecipesCache`・`chatLog` が定義される  
- `connectWebSocket()` が WebSocket に接続し、全受信メッセージをハンドルする  
- `game` モード中のイベント（`candidatesPresented` / `cardAcquired` / `categoryAchieved` / `playerLeft` / `chatMessage`）では `render()` を**呼ばない**  

**Todo List**:
- [ ] `I18n` クラス（`load` / `t`）を完全実装する
- [ ] `GameClient` コンストラクタ・プロパティを定義する
- [ ] `fetchCategories` / `fetchSkills` / `fetchMissions` / `fetchCategoryRecipes` を実装する
- [ ] `connectWebSocket()` と WebSocket 受信ルーティングを実装する
- [ ] 全受信メッセージハンドラ（`sessionCreated` 〜 `error`）を実装する（render 呼び出し分岐ルール適用）

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 9・12  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 7-1〜7-3  
- `render()` ルール: `mode==='game'` 時のゲームイベントでは `render()` を呼ばず、個別 DOM 更新関数を呼ぶ

---

## Phase 8: game.js — UI レンダリング

**Status**: [ ] pending

**Intent**:  
`render()` のモード分岐・各画面の描画関数・職種図鑑モーダル・グループチャットサイドパネルを実装する。

**Expected Outcomes**:  
- `renderRoomCreate()`：人数・ターン数・名前・カラー選択 → `createSession` 送信  
- `renderInviteLink()`：招待 URL 表示・コピーボタン・参加状況・「ゲームを開始する」ボタン（2人未満で無効）  
- `renderJoinName()`：名前・カラー選択（使用済みグレーアウト）→ `joinSession` 送信  
- `renderLobby()`：参加者一覧・空き枠プレースホルダー表示  
- `renderGame()`：ヘッダー・スコアバー・ターン操作エリア・プレイヤーボード（参加人数分のみ表示）  
- 候補カードの「1st tap ハイライト → 2nd tap 確定 → `selectCard` 送信」インタラクションが機能する  
- 既所持カードが候補に含まれる場合はクリック不可（`cursor: not-allowed`）  
- `openCategoryDex(playerId)` が全職種カードをチップ単位（所持:色付き・未所持:グレー）で表示する  
- グループチャットサイドパネルが開閉でき、ロビー・ゲーム中を問わず利用できる  

**Todo List**:
- [ ] `render()` のモード分岐を実装する
- [ ] `renderRoomCreate()` を実装する
- [ ] `renderInviteLink()` を実装する
- [ ] `renderJoinName()` を実装する
- [ ] `renderLobby()` を実装する
- [ ] `renderGame()`（ヘッダー・スコアバー・ターン操作エリア・プレイヤーボード）を実装する
- [ ] 候補カード選択インタラクション（`su` アニメーション・1st tap / 2nd tap）を実装する
- [ ] `openCategoryDex(playerId)`（職種図鑑モーダル）を実装する
- [ ] グループチャットサイドパネル（開閉・送受信・自動スクロール）を実装する
- [ ] `DOMContentLoaded` で `GameClient` を初期化し `render()` を呼ぶ

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 10  
- `project_prompt_v2_0_B.md`「render() のルール」「グループチャット」  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 8-1〜8-6

---

## Phase 9: 管理画面実装

**Status**: [ ] pending

**Intent**:  
`admin.html` に管理画面（ログイン・職種/スキル/ミッション CRUD・配布比率タブ・CSV インポート/エクスポート）を実装する。

**Expected Outcomes**:  
- `POST /api/auth/login` 認証後に token が localStorage に保存される  
- タブ「職種カード」「スキルカード」「ミッションカード」「配布比率」が機能する  
- 職種カード編集フォームにスキル/ミッションのチェックボックスと必要枚数入力が存在する  
- バリデーション：必要枚数が 1 未満または選択数超過の場合、赤枠エラーで保存ブロックされる  
- `PUT /api/admin/categories/:id/recipe` の呼び出し後、サーバー側でも検証される  
- 配布比率タブで合計 100 以外は保存できない  
- CSV インポート/エクスポートが各タブで動作する  
- `model_type` 選択 UI は非表示（`'katz'` 固定）  

**Todo List**:
- [ ] `admin.html` のログイン画面（token 保存・401 時のログイン戻し）を実装する
- [ ] タブ UI とタブ切り替えロジックを実装する
- [ ] 各タブの一覧表示・新規作成・編集・削除（CRUD）を実装する
- [ ] 職種カードのレシピエディタ（チェックボックス・必要枚数・バリデーション）を実装する
- [ ] 配布比率タブ（合計 100 バリデーション）を実装する
- [ ] CSV インポート・エクスポート機能を実装する

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 11  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 9-1〜9-3

---

## Phase 10: 多言語対応（lang/ja.json・lang/en.json）

**Status**: [ ] pending

**Intent**:  
全 UI 文言を i18n キーとして `lang/ja.json` / `lang/en.json` に定義する。カード名自体は DB の `name_ja` / `name_en` を使用し、本ファイルでは UI 文言のみ管理する。

**Expected Outcomes**:  
- `room.*` / `lobby.*` / `game.*` / `chat.*` / `admin.*` / `errors.*` の各キーが ja / en 両方のファイルに定義されている  
- `errors.COLOR_TAKEN` / `errors.MID_GAME_JOIN_NOT_ALLOWED` など v2.0-B 新規キーが揃っている  
- `i18n.t('lobby.playerLeft', { name: '太郎' })` のようなプレースホルダー置換が機能する  

**Todo List**:
- [ ] `lang/ja.json` を SDD Section 12 の全必須キーで実装する
- [ ] `lang/en.json` を同一キー構造で実装する

**Relevant Context**:  
- `SDD_Specification_v2_0_B_full.md` Section 12  
- `project_prompt_v2_0_B.md`「i18n（必須要件）」  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 10-1・10-2

---

## Phase 11: 動作確認

**Status**: [ ] pending

**Intent**:  
実装が完了したら `v2_0_B_implementation_prompts_v1.1.md` Prompt 11-1 のチェックリストに沿って動作確認を行う。

**Expected Outcomes**:  
Prompt 11-1 のチェックリスト全項目がパスしている:
- API 動作確認（health / categories / category-recipes / distribution / lang）
- ルーム作成〜ゲーム開始フロー
- ゲームループ（サイコロ・候補提示・カード選択・職種達成・職種図鑑）
- 途中退出（ロビー中・ゲーム中・新規参加不可）
- ゲーム終了（同着扱い）
- グループチャット（開閉・全員配信・ログ消去）
- 管理画面（ログイン・レシピ編集・配布比率・バリデーション）

**Todo List**:
- [ ] `npm install` → `npm run initdb` → `npm start` を実行する
- [ ] Prompt 11-1 のチェックリスト全項目を順番に確認する
- [ ] 問題があれば `v2_0_B_implementation_prompts_v1.1.md` の Prompt D-1〜D-4 を参照してデバッグする

**Relevant Context**:  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 11-1・D-1〜D-4

---

## Phase 12: デプロイメント設定（オプション）

**Status**: [ ] pending

**Intent**:  
Ubuntu サーバーへのデプロイに必要な Nginx リバースプロキシ設定・systemd サービスファイル・setup.sh を作成する。

**Expected Outcomes**:  
- Nginx 設定で WebSocket アップグレードヘッダー（`Upgrade` / `Connection: upgrade`）が設定されている  
- `setup.sh` が npm install / .env 準備 / initdb / systemd 起動を自動化する  

**Todo List**:
- [ ] Nginx 設定ファイル（`/etc/nginx/sites-available/career-collection-game`）を作成する
- [ ] systemd サービスファイル（`career-collection-game.service`）を作成する
- [ ] `setup.sh` を作成する

**Relevant Context**:  
- `v2_0_B_implementation_prompts_v1.1.md` Prompt 12-1・12-2

---

## 全体的な注意事項（全フェーズ共通）

1. **better-sqlite3**: コールバック禁止。`.all()` / `.get()` / `.run()` の 3 パターンのみ。エラーハンドリングは同期 `try/catch`
2. **ID 型比較**: `Number()` で統一（文字列 `"1"` vs 数値 `1` の型不一致バグを防ぐ）
3. **カードの非消費**: 「候補から選べなくする」処理と「ボードから削除する」処理を混同しない（削除は行わない）
4. **職種充足判定**: 「閾値以上」であり「全部揃える」ではない。排他的ロックをしない
5. **セッション状態**: DBに保存しない。サーバーメモリ上のオブジェクトのみ
6. **render() ルール**: `mode === 'game'` のイベント受信時に `render()` を呼ばない
7. **i18n**: 全表示テキストは `i18n.t()` 経由。`i18n.currentLang` を直接参照（キャッシュ変数禁止）
8. **3D**: Three.js / SceneManager は一切使用しない
9. **NOT_ALL_SELECTED**: このエラーコードは v2.0-B には存在しない（開始前の職種選択ステップがない）
