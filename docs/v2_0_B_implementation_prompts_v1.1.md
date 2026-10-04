# Role-Based Card Game Framework — 職種コレクション版 再現実装プロンプト集 v2.0-B（完全版） v1.1

> **仕様書**: `SDD_Specification_v2.0_B_full.md`（本プロンプト集は同仕様書と章番号を対応させています）
> **位置づけ**: v2.0（ボードゲーム版）とは並行する別ラインのゲームモード
> **ベース技術基盤**: v1.3.1（Node.js/Express/ws/better-sqlite3/i18nの作法を継承。Three.jsは不使用）
> **最終更新**: 2026-09-29（v1.1: Prompt 2-1 に initdb.js 実装時の追加安全策を追記）
> **動作環境**: Node.js 24 / better-sqlite3 ^12.8.0

## 📝 変更履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.1 | 2026-09-29 | Prompt 2-1（initdb.js）に、実装時に追加した安全策（投入前の自己検証、再実行可能化、トランザクション化）を明記 |
| v2.0-B（完全版） | 2026-09-27 | 初版 |

---

## 🛠️ このドキュメントの使い方

このファイル1本で、v1.x・v2.0のコードベースが手元になくても「職種コレクション」（v2.0-B）を
ゼロから実装できることを目指した完全版です。各プロンプトは `SDD_Specification_v2.0_B_full.md` の
該当章を参照しながら使ってください。

| ツール | 向いている作業 | プロンプトの使い方 |
|---|---|---|
| **Claude.ai** | 設計・ファイル単位の生成・レビュー | コードブロック内をコピペして会話で使用 |
| **Claude Code** | ファイル操作・実行・テスト・一括実装 | `claude` コマンドまたは `#` ファイル参照 |

> **実行順序**: Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12
> フェーズをまたいだ依存関係があるため、必ず順番通りに実行してください。
> **重要**: 実装フェーズ中はファイル生成のみを行い、指示がない限りビルド・実行・動作確認は行わないこと
> （動作確認はPhase 11でまとめて行う）。

---

## 📋 目次

- [Phase 1: プロジェクト初期化](#phase-1-プロジェクト初期化)
- [Phase 2: データベース設計と初期化](#phase-2-データベース設計と初期化)
- [Phase 3: サーバーサイド実装①—骨格・REST API](#phase-3-サーバーサイド実装骨格rest-api)
- [Phase 4: サーバーサイド実装②—ルーム・ロビー・退出](#phase-4-サーバーサイド実装ルームロビー退出)
- [Phase 5: サーバーサイド実装③—ゲームループ・職種判定](#phase-5-サーバーサイド実装ゲームループ職種判定)
- [Phase 6: index.html の構造と CSS](#phase-6-indexhtml-の構造と-css)
- [Phase 7: game.js — I18n・GameClient 骨格・WebSocket](#phase-7-gamejs--i18ngameclient-骨格websocket)
- [Phase 8: game.js — UI レンダリング](#phase-8-gamejs--ui-レンダリング)
- [Phase 9: 管理画面実装](#phase-9-管理画面実装)
- [Phase 10: 多言語対応システム](#phase-10-多言語対応システム)
- [Phase 11: 動作確認（デプロイ前チェック）](#phase-11-動作確認デプロイ前チェック)
- [Phase 12: デプロイメント設定](#phase-12-デプロイメント設定)
- [補足: デバッグ・確認用プロンプト](#補足-デバッグ確認用プロンプト)

---

## Phase 1: プロジェクト初期化

### Prompt 1-1: 設定ファイルの生成

```
以下の3ファイルを作成してください。

## package.json
{
  "name": "career-collection-game",
  "version": "2.0.0-b",
  "description": "Online multiplayer career-card collection game (v2.0-B)",
  "main": "server.js",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "initdb": "node initdb.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "better-sqlite3": "^12.8.0",
    "uuid": "^9.0.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}

## .env.example
# 認証（管理画面）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_TOKEN_EXPIRY_HOURS=24

# サーバー
PORT=3000

# ゲームバランス
MAX_PLAYERS=4

## .gitignore
node_modules/
.env
game.db
*.log
```

> 3D非対応のため、`DICE_ROLL_DURATION`・`TOKEN_MOVE_DURATION` 等の3D演出系の環境変数は不要。
> 配布比率（スキル:ミッション）は環境変数ではなく `game_settings` テーブルで管理する
> （SDD 4.4節・14章）。

---

### Prompt 1-2: ディレクトリ構造の作成

```
以下のディレクトリ構造を作成し、各ファイルを空のスケルトン状態で用意してください。

career-collection-game/
├── server.js
├── index.html
├── game.js
├── admin.html
├── initdb.js
├── check-db.js
├── package.json
├── .env.example
├── .gitignore
├── CLAUDE.md
└── lang/
    ├── ja.json
    └── en.json

Three.js・SceneManager関連のファイルは本モードでは不要のため作成しない。
```

---

### Prompt 1-3: CLAUDE.md の作成（Claude Code 専用）

```
このプロジェクト用の CLAUDE.md を作成してください。

## プロジェクト概要
- 「職種コレクション」（v2.0-B）: ITスキル/ミッションカードを集めて職種カードを獲得する
  オンラインマルチプレイヤーカードゲーム
- 仕様書: SDD_Specification_v2.0_B_full.md を参照
- v2.0（ボードゲーム版）とは並行する別ラインであり、置き換えではない

## 技術スタック
- バックエンド: Node.js 24 + Express + WebSocket (ws) + better-sqlite3
- フロントエンド: Vanilla JavaScript + HTML/CSS のみ（**Three.js不使用・3D要素一切なし**）
- DB: SQLite (game.db) / better-sqlite3 同期API
- 認証: 管理画面のみトークンベース（Bearer token、ADMIN_TOKEN_EXPIRY_HOURS 時間有効）

## 絶対に守るべきルール
- 職種カード（category_cards）は開始前に選択するものではなく、プレイ中に複数獲得する対象
  （v1.x/v2.0との最大の違い。SDD 1.4節）
- スキルカード・ミッションカードは消費されない。永続的にボードに残り、何度でも再利用できる
- 1枚のカードが複数の職種カードのレシピに同時にカウントされてよい（排他的割り当てをしない）
- 職種カードの充足判定は「紐づいたカードの**種類数**が閾値以上か」（SDD 7章）
- 同点（獲得職種カード枚数が同じ）の場合はタイブレークをせず同着として扱う（SDD 2.3節）
- ゲーム中に離脱したプレイヤーの枠は、そのゲームが終わるまで補充しない（SDD 8.3節）
- 招待URLからの入室は常に新規プレイヤー扱い。離脱前のセッション引き継ぎは行わない（SDD 8.4節）
- i18n対応は必須要件（SDD 12章）。全表示テキストは i18n.t() 経由で取得する

## better-sqlite3 の鉄則
- コールバック禁止。db.prepare().all()/get()/run() の3パターンのみ
- エラーハンドリングは同期の try/catch

## DB 重要事項
- 進行中のゲームセッション状態（プレイヤー・ターン・ボード内容）はDBに保存せず、
  サーバーメモリ上のオブジェクトとして保持する（SDD 3.2節）
- DBに永続化するのはカードマスタデータと game_settings（配布比率）のみ
```

---

## Phase 2: データベース設計と初期化

### Prompt 2-1: initdb.js の完全実装

```
#SDD_Specification_v2.0_B_full.md の Section 4 を参照して、initdb.js を実装してください。
このプロンプトは自己完結しています。他バージョンのコードやDBファイルを参照する必要はありません。

## 使用ライブラリ
const fs       = require('fs');
const Database = require('better-sqlite3');

## テーブル定義（全8テーブル、以下のSQLをそのまま使用すること）

CREATE TABLE skill_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    model_type TEXT NOT NULL DEFAULT 'katz'   -- 本モードでは常に 'katz' 固定。管理画面のmodel_type選択UIは非表示でよい
);

CREATE TABLE mission_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL
);
-- これはミッションカードの分類軸（skill_typesのミッション版）であり、
-- 職種カードとの紐付けには使わない。職種との紐付けは下記の
-- category_skill_links / category_mission_links で行う。

CREATE TABLE category_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    required_skill_count INTEGER NOT NULL DEFAULT 1,
    required_mission_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE skill_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    skill_type_id INTEGER NOT NULL,
    description_ja TEXT,
    description_en TEXT,
    FOREIGN KEY(skill_type_id) REFERENCES skill_types(id)
);
-- 注意: v1.x/v2.0にあった skill_cards.matchesCategories カラム（職種IDのカンマ区切り文字列）は
-- 本モードでは使用しない。職種カードとの紐付けは category_skill_links テーブルで行う（下記）。

CREATE TABLE missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    mission_category_id INTEGER NOT NULL,
    description_ja TEXT,
    description_en TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(mission_category_id) REFERENCES mission_categories(id)
);

CREATE TABLE category_skill_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES category_cards(id),
    FOREIGN KEY(skill_id) REFERENCES skill_cards(id),
    UNIQUE(category_id, skill_id)
);

CREATE TABLE category_mission_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    mission_id INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES category_cards(id),
    FOREIGN KEY(mission_id) REFERENCES missions(id),
    UNIQUE(category_id, mission_id)
);

CREATE TABLE game_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- 初期データ: ('skill_mission_ratio', '70:30')

## データ件数（初期データ、たたき台の具体例）
- skill_types: 3件、例）id=1 name_ja='テクニカルスキル' model_type='katz' / id=2 name_ja='ヒューマンスキル' / id=3 name_ja='コンセプチュアルスキル'
- mission_categories: 4件、任意の分類名でよい（例: '企画系'/'運用系'/'対人系'/'分析系'）
- category_cards: 12件（Webエンジニア、プロジェクトマネージャー、コンサルタント、データアナリスト、
  UXデザイナー、ヘルプデスク、QAエンジニア、インフラエンジニア、ネットワークエンジニア、
  プロダクトオーナー、セキュリティエンジニア、データベースエンジニア）。それぞれ
  required_skill_count / required_mission_count を1〜4の範囲で設定
- skill_cards: 15〜20件程度、各skill_type_idに満遍なく割り当てる
- missions: 15〜20件程度、各mission_category_idに満遍なく割り当てる、enabled=1
- category_skill_links / category_mission_links: 各職種カードにつきスキル2〜4種・ミッション1〜2種を紐付け
  （紐付け数 ≥ required_*_count となるように投入すること。閾値が紐付け数を超えるデータを
  投入してはならない — SDD 7.3節のバリデーションと矛盾しないこと）

## 完了メッセージ
"Database initialized successfully!"
"Tables: mission_categories(4), category_cards(12), skill_types(3), skill_cards(N), missions(N), category_skill_links(N), category_mission_links(N), game_settings(1)"
```

#### 🔧 実装時の追加安全策（v1.1で追記）

実際に initdb.js を実装・実行検証した際、上記プロンプトの要件を満たすために以下の3点を
追加実装した。以後 initdb.js を再実装・改修する際もこの3点を踏襲すること。

1. **投入前の自己検証（シードデータの整合性チェック）**
   `category_skill_links` / `category_mission_links` を投入する前に、各 `category_cards` について
   `required_skill_count ≤ 紐付け予定スキル数` かつ `required_mission_count ≤ 紐付け予定ミッション数`
   であることをJS側で検証し、満たさない場合は例外を投げて投入を中止する。
   SDD 7.3節のバリデーション（管理画面での閾値チェック）と初期データ自体が矛盾しないことを、
   投入時点で機械的に保証するための措置。手作業でシードデータを増減させた際の設定ミスを
   実行時エラーとして検出できる。

2. **再実行可能化（冪等性の担保）**
   スクリプト冒頭で `game.db` が既に存在する場合は削除してから新規作成する
   （`fs.existsSync` → `fs.unlinkSync`）。`npm run initdb` を複数回実行しても
   `UNIQUE constraint failed` 等のエラーで失敗せず、常にクリーンな初期状態を再現できるようにする。

3. **一括投入のトランザクション化**
   `skill_types` 〜 `game_settings` までの全INSERTを `db.transaction()` で1つにまとめる。
   途中で例外が発生した場合（例: 上記1の自己検証エラーや外部キー制約違反）に、
   一部テーブルだけ投入済みという中途半端な状態でDBファイルが残ることを防ぐ。

いずれもプロンプト本文の要求（テーブル定義・データ件数・完了メッセージ）に追加で行った
防御的実装であり、テーブルスキーマやデータ件数の要件自体を変更するものではない。

---

### Prompt 2-2: DB 確認スクリプト

```
check-db.js を作成してください。

## 確認内容（better-sqlite3 同期APIで実装）
1. 各テーブルのレコード件数確認
2. category_cards の全レコード（id, name_ja, required_skill_count, required_mission_count）を表示
3. 各 category_cards について、category_skill_links / category_mission_links の紐付け件数を集計し、
   required_skill_count ≤ 紐付けスキル数、required_mission_count ≤ 紐付けミッション数 を
   満たしているか検証する（満たしていない職種カードがあれば警告を表示）
4. game_settings の内容を表示（skill_mission_ratio が想定形式 "N:N" であることを確認）

不整合がある場合は process.exit(1) してください。
```

---

## Phase 3: サーバーサイド実装①—骨格・REST API

### Prompt 3-1: server.js の骨格・認証

```
#SDD_Specification_v2.0_B_full.md の Section 3, 14章 を参照して、
server.js の基本骨格を実装してください。

## 定数定義
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TOKEN_EXPIRY   = parseInt(process.env.ADMIN_TOKEN_EXPIRY_HOURS || '24', 10) * 60 * 60 * 1000;
const MAX_PLAYERS    = parseInt(process.env.MAX_PLAYERS || '4', 10);

## 管理画面認証（UUID Bearer token方式）
このプロンプトは自己完結しています。以下の具体的な実装パターンを使用してください。

const { v4: uuidv4 } = require('uuid');
const adminTokens = new Map(); // token(string) -> expiresAtMillis(number)

function issueToken() {
  const token = uuidv4();
  adminTokens.set(token, Date.now() + TOKEN_EXPIRY);
  return token;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const expiresAt = token && adminTokens.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) adminTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  next();
}

// POST /api/auth/login
app.post('/api/auth/login', express.json(), (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ ok: true, token: issueToken() });
  }
  res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
});

// 全ての /api/admin/* ルートに requireAdminAuth を適用すること

## Express + WebSocket サーバーの起動
Express アプリと ws.Server を同一HTTPサーバー上に構築する。
```

---

### Prompt 3-2: REST API エンドポイント

```
#SDD_Specification_v2.0_B_full.md の Section 4, 11章 を参照して、
以下のREST APIをserver.jsに実装してください（better-sqlite3同期API使用）。

GET  /api/cards/categories          # category_cards 一覧（配列直接返却）
GET  /api/cards/skills              # skill_cards 一覧
GET  /api/cards/missions            # missions 一覧
GET  /api/cards/skill-types         # skill_types 一覧
GET  /api/cards/mission-categories  # mission_categories 一覧
GET  /api/cards/category-recipes    # 職種カードごとの紐付け一覧（category_skill_links + category_mission_links を
                                     #   category_id ごとにJOINして返す。管理画面のレシピエディタ・
                                     #   クライアントの職種図鑑モーダル双方から利用）
GET  /api/settings/distribution     # game_settings の skill_mission_ratio を返す
GET  /api/lang/:lang                # 翻訳ファイル（lang/ja.json, lang/en.json）
POST /api/auth/login                # { ok, token }
GET  /api/health                    # { ok: true }

## 管理画面用（Bearer token必須）
POST/PUT/DELETE /api/admin/categories
POST/PUT/DELETE /api/admin/skills
POST/PUT/DELETE /api/admin/missions
POST/PUT/DELETE /api/admin/skill-types
PUT  /api/admin/categories/:id/recipe   # { skillIds: [...], missionIds: [...], requiredSkillCount, requiredMissionCount }
                                         #   SDD 7.3節のバリデーション（閾値1以上・紐付け数以下）を
                                         #   サーバー側でも必ず再検証し、違反時は400エラーで拒否する
PUT  /api/admin/settings/distribution   # { skillRatio, missionRatio }（合計100であることを検証）
POST /api/admin/import/:type            # CSV upsert（:type は categories|skills|missions|skill-types）
```

## CSVインポートの仕様（POST /api/admin/import/:type）
- リクエストボディはCSVテキストそのもの（Content-Type: text/csv）
- 1行目はヘッダー行として扱い、カラム名でマッピングする
- id列が空、または既存テーブルに存在しないidの場合は新規INSERT、既存idの場合はUPDATE（upsert）
- 各:typeごとのヘッダー列：
  - categories: id,name_ja,name_en,required_skill_count,required_mission_count
  - skills: id,name_ja,name_en,skill_type_id,description_ja,description_en
  - missions: id,name_ja,name_en,mission_category_id,description_ja,description_en,enabled
  - skill-types: id,name_ja,name_en,model_type
- 1行でも必須カラムが欠けている、または数値であるべき列に非数値が入っている場合は
  そのCSV全体を取り込まず、400エラーで行番号とエラー内容を返す（部分的な取り込みはしない）
- レスポンス: { ok: true, inserted: N, updated: N }

---

## Phase 4: サーバーサイド実装②—ルーム・ロビー・退出

### Prompt 4-1: セッション作成・参加（createSession / joinSession）

```
#SDD_Specification_v2.0_B_full.md の Section 5 を参照して、
handleCreateSession / handleJoinSession を実装してください。

## セッションオブジェクトの構造
{
  id: string,
  hostPlayerId: string,
  players: [
    {
      id, name, colorId,
      board: { skillIds: Set, missionIds: Set, achievedCategoryIds: Set },
      seenSkillIds: Set, seenMissionIds: Set,   // SDD 6.3節：個人ごとの出尽くし判定用
      status: 'active' | 'left'
    }
  ],
  maxPlayers: number,        // 2〜4（SDD 5.3節）
  turnsPerPlayer: number,    // v2.0-B新規
  currentTurnIndex: number,
  totalTurnsElapsed: number,
  status: 'lobby' | 'in_progress' | 'finished',
}

## handleCreateSession
- data: { playerName, colorId, maxPlayers, turnsPerPlayer }
- maxPlayers は 2〜4 の範囲でなければならない
- 招待URL（例: `/join/${sessionId}`）を生成し sessionCreated で返す

## handleJoinSession
- data: { sessionId, playerName, colorId }
- session.status !== 'lobby' の場合 → エラー MID_GAME_JOIN_NOT_ALLOWED（SDD 8.3節）
- session.players.length >= session.maxPlayers の場合 → エラー SESSION_FULL
- 既に他プレイヤーが使用中の colorId が指定された場合 → エラー COLOR_TAKEN（SDD 5.2節）
- 成功時は playerJoined を全員にブロードキャスト
```

---

### Prompt 4-2: ゲーム開始バリデーション（startGame）

```
#SDD_Specification_v2.0_B_full.md の Section 5.4 を参照して、
handleStartGame を実装してください。

## バリデーション順序（v1.xとの違いに注意）
1. NOT_HOST：送信者がホストでなければエラー
2. NOT_ENOUGH_PLAYERS：session.players.length < 2 ならエラー

**v1.x/v2.0にあった「NOT_ALL_SELECTED」（職種選択済みチェック）は本モードには存在しない。**
参加＝名前とカラーの入力が完了した時点で即座に「準備完了」であり、別途の準備完了操作は不要
（SDD 5.4節）。

## 成功時の処理
- session.status = 'in_progress'
- ターン順（turnOrder）を決定（参加順でよい）
- totalTurns = session.maxPlayers... ではなく実際の参加人数 × turnsPerPlayer で算出し、
  session に保存する
- gameStarted を全員にブロードキャスト
```

---

### Prompt 4-3: 途中退出・再入場処理（resign / playerLeft）

```
#SDD_Specification_v2.0_B_full.md の Section 8 を参照して、
handleResign（またはWebSocket切断検知）を実装してください。

## ロビー中の退出（session.status === 'lobby'）
- session.players から該当プレイヤーを完全に削除する（枠を空ける）
- playerLeft { playerId, phase: 'lobby' } を全員にブロードキャスト
- 以後、同じ招待URLから新規参加者が通常の joinSession フローで入室できる（4-1節の通り）

## ゲーム中の退出（session.status === 'in_progress'）
- 該当プレイヤーを削除せず、player.status = 'left' に変更する（それまでのboard内容は保持）
- playerLeft { playerId, phase: 'game' } を全員にブロードキャスト
- ターン進行ロジック（Phase 5）側で、status === 'left' のプレイヤーの手番は自動的にスキップする
- この枠への新規参加は受け付けない（4-1節の MID_GAME_JOIN_NOT_ALLOWED により自然に防がれる）

## 再入場の扱い（SDD 8.4節）
- 招待URLから入ってきた人物を離脱前のプレイヤーと同一視する処理は一切実装しない
  （再接続トークン・セッション引き継ぎのロジックを作らないこと自体が正しい実装）
- 再入場は常に「ロビー段階の新規 joinSession」としてのみ成立する
```

---

### Prompt 4-4: グループチャット処理（chatMessage）

```
#SDD_Specification_v2.0_B_full.md の Section 9, 10.5 を参照して、
handleChatMessage を実装してください。

## 処理内容
- data: { text }
- 送信者がそのセッションの参加者（ホスト・非ホスト問わず、status==='left'でも可）であることのみ確認する
- ロビー中・ゲーム中いずれの session.status でも受け付ける（利用タイミングの制限をしない）
- 入力内容に対するフィルタリング・NGワード判定・文字数制限などのモデレーション処理は
  一切実装しないこと（SDD 10.5節の確定事項）
- chatMessage { playerId, playerName, text, sentAt: Date.now() } を全員にブロードキャストする

## ログの保持
- セッションオブジェクトにチャットログを持たせる場合も、あくまでサーバーメモリ上の配列としてのみ
  保持し、DBには一切保存しない
- ゲーム終了処理（Phase 5-4）で session.status = 'finished' にする際、チャットログの配列も
  クリアする（あるいはセッション自体を破棄するタイミングで一緒に消えるのであれば、
  明示的なクリア処理は不要）
- 途中退出したプレイヤー（status==='left'）の過去の発言はログから削除しない
```

---

## Phase 5: サーバーサイド実装③—ゲームループ・職種判定

### Prompt 5-1: サイコロ・候補抽選ロジック（rollDice）

```
#SDD_Specification_v2.0_B_full.md の Section 6.1, 6.2, 6.3 を参照して、
handleRollDice を実装してください。

## 処理フロー
1. 現在の手番プレイヤーのみ実行可能（それ以外はエラー）
2. 出目 N（1〜6）を算出
3. diceRolled { playerId, diceValue: N } を全員にブロードキャスト（演出用）
4. drawCandidates(session, player, N) で候補カードをN種類（重複なし）抽選
   - game_settings.skill_mission_ratio に従って各候補がスキル/ミッションどちらかを決める
   - 個人ごとの出尽くし判定（seenSkillIds / seenMissionIds）を適用し、
     全種類を引き終えていたら該当プレイヤーの seen セットをリセットして再度全種類を対象にする
   - 候補内で同じカードが2回出ないようにする（重複なし）
   - 既にプレイヤーが所持しているカードが候補に含まれること自体は許容する
5. candidatesPresented { candidates } を**手番プレイヤーにのみ**送信（他プレイヤーには送らない）

## drawCandidates の実装（疑似コードそのまま実装）
function drawCandidates(session, player, diceValue) { ... }  // SDD 6.2節の疑似コード通り

function getAvailablePool(player, cardType) { ... }           // SDD 6.3節の疑似コード通り
```

---

### Prompt 5-2: カード選択・ボード更新（selectCard）

```
#SDD_Specification_v2.0_B_full.md の Section 6.1, 9.3 を参照して、
handleSelectCard を実装してください。

## バリデーション
- data.candidateCardId が直前に candidatesPresented で送った候補IDに含まれているか検証
- 含まれていない場合、または既にプレイヤーが所持しているカード（未所持のもののみ選択可 —
  SDD 6.2節の確定事項）を選ぼうとした場合はエラー INVALID_CANDIDATE_SELECTION

## 成功時の処理
1. 選択されたカードを player.board.skillIds または missionIds に追加（Set、重複追加は自然に無視される）
2. player.seenSkillIds / seenMissionIds にも追加（出尽くし判定の履歴として）
3. cardAcquired { playerId, card, cardType } を全員にブロードキャスト
4. checkCategoryAchievements(player) を呼び、新たに達成した職種カードがあれば
   categoryAchieved { playerId, categoryId } を職種カードごとに全員にブロードキャスト
   （同時に複数達成することがある点に注意 — SDD 7.2節）
```

---

### Prompt 5-3: 職種カード充足判定ロジック

```
#SDD_Specification_v2.0_B_full.md の Section 7 を参照して、
checkCategoryAchievements(player) を実装してください。

## アルゴリズム（SDD 7.1節・7.2節の疑似コードをそのまま実装）
function checkCategoryAchievements(player) {
  const newlyAchieved = [];
  for (const category of getAllCategoriesWithRecipes()) {   // category_skill_links / category_mission_links をJOIN
    if (player.board.achievedCategoryIds.has(category.id)) continue;
    const skillMatch = countIntersection(player.board.skillIds, category.linkedSkillIds);
    const missionMatch = countIntersection(player.board.missionIds, category.linkedMissionIds);
    if (skillMatch >= category.required_skill_count && missionMatch >= category.required_mission_count) {
      player.board.achievedCategoryIds.add(category.id);
      newlyAchieved.push(category.id);
    }
  }
  return newlyAchieved;
}

## 注意点
- 判定は「種類数（ユニーク数）」で行う。同じカードを重複してカウントしない
- 1枚のカードは他の職種カードの判定にも独立してカウントされる（排他的ロックをしない）
- getAllCategoriesWithRecipes() の結果はサーバー起動時、またはカード獲得のたびに
  DBから取得してよい（マスタデータは頻繁には変わらないため、キャッシュしてもよい）
```

---

### Prompt 5-4: ターン進行・ゲーム終了・同着判定

```
#SDD_Specification_v2.0_B_full.md の Section 2.3, 6.1, 8.2 を参照して、
handleNextTurn とゲーム終了処理を実装してください。

## handleNextTurn
- session.totalTurnsElapsed をインクリメント
- 次の手番プレイヤーを決定する際、status === 'left' のプレイヤーは**自動的にスキップ**する
  （SDD 8.2節）
- turnAdvanced { currentPlayerId, turnNumber } を全員にブロードキャスト
- session.totalTurnsElapsed >= (アクティブ参加人数 × turnsPerPlayer) に達したらゲーム終了処理へ

## ゲーム終了処理
1. 各プレイヤー（status === 'left' も含む）の achievedCategoryIds.size を集計
2. 降順にソートしてランキングを作成
3. **同数の場合はタイブレークを行わず同着として扱う**（SDD 2.3節・確定事項）。
   同じ枚数のプレイヤーには同じ順位を割り当てること（例: 1位が2人いれば次は3位ではなく
   そのまま同率1位が2人、という表現でよい）
4. gameEnded { rankings: [{ playerId, categoryCount, rank }] } を全員にブロードキャスト
5. session.status = 'finished'
```

---

## Phase 6: index.html の構造と CSS

### Prompt 6-1: DOM構造とベースCSS

```
#SDD_Specification_v2.0_B_full.md の Section 10 を参照して、index.html を実装してください。

## 重要事項
**Three.js・WebGL Canvas は一切使用しない。** v1.3で導入された
`#scene-container` / `#ui-overlay` / `#ui-interactive` の3層DOM構造・SceneManagerは不要。

## DOM構造（シンプルな2D構成）
<div id="app">
  <!-- render() が画面全体を書き換える。モードに応じて以下のいずれかを描画 -->
  <!-- room-create / invite-link / join-name / lobby / game -->
</div>

## ゲーム画面のみ、以下の要素をCSSで固定配置する
- スコアバー（#sb）：画面上部に横一列固定
- 職種図鑑モーダル（#category-dex-modal）：画面中央に固定表示、背後に半透明の暗いオーバーレイ

## カラーパレット・フォント
- プレイヤーカラー（SDD 5.2節）: #6366f1 / #f59e0b / #10b981 / #ef4444 / #38bdf8 / #a855f7
- スキルカードのアクセントカラー: 任意の1色（例: #1D4ED8）
- ミッションカードのアクセントカラー: 任意の1色（例: #7C3AED）
- 獲得済み職種カード: ダーク背景 + ゴールド枠

## 必須CSSアニメーション
@keyframes su  { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
@keyframes fo  { to { opacity:0; transform:scale(0.94); } }
@keyframes pip { 0%{transform:scale(1)} 50%{transform:scale(1.5)} 100%{transform:scale(1)} }
```

---

### Prompt 6-2: 候補カード・チップのスタイル

```
以下のUIパーツのCSSクラスを定義してください。

- .candidate-card：候補カード表示用。1st tap でハイライト（枠線+グロウ）、2nd tap で確定
- .card-chip（スキル）：塗りつぶし背景（青系）、白文字、角丸
- .card-chip（ミッション）：塗りつぶし背景（紫系）、白文字、角丸
- .card-chip（未所持・グレーアウト）：淡色背景、ミュートカラー文字
- .category-chip（獲得済み）：ダーク背景 + ゴールドの内枠（box-shadow: inset）
- .toast-notification：画面上部中央に固定、退出通知等に使用（SDD 10.4節）
```

---

## Phase 7: game.js — I18n・GameClient 骨格・WebSocket

### Prompt 7-1: I18n クラス

```
I18n クラスを以下の通り実装してください。

class I18n {
  constructor() { this.currentLang = 'ja'; this.translations = {}; }
  async load(lang) { /* GET /api/lang/:lang を fetch し this.translations に格納 */ }
  t(key, params = {}) { /* ドット区切りキーで translations から取得、{{name}}等のプレースホルダ置換 */ }
}

表示テキストは必ず i18n.t() 経由で取得すること（this.language のようなキャッシュされた変数を
参照するのではなく、常に i18n.currentLang を参照する — v1.3.1のバグ修正事項を踏襲）。
```

---

### Prompt 7-2: GameClient 骨格・データ取得

```
#SDD_Specification_v2.0_B_full.md の Section 4 を参照して、GameClient クラスの骨格を実装してください。

class GameClient {
  constructor() {
    this.mode = 'room-create'; // 'room-create' | 'invite-link' | 'join-name' | 'lobby' | 'game'
    this.session = null;
    this.myPlayerId = null;
    this.categoriesCache = [];
    this.skillsCache = [];
    this.missionsCache = [];
    this.categoryRecipesCache = []; // GET /api/cards/category-recipes
    this.ws = null;
  }
  async fetchCategories() { /* GET /api/cards/categories */ }
  async fetchSkills() { /* GET /api/cards/skills */ }
  async fetchMissions() { /* GET /api/cards/missions */ }
  async fetchCategoryRecipes() { /* GET /api/cards/category-recipes（職種図鑑モーダル用） */ }
  connectWebSocket() { /* ws接続、再接続処理（WS_RECONNECT_DELAY） */ }
}
```

---

### Prompt 7-3: WebSocketメッセージハンドラ

```
#SDD_Specification_v2.0_B_full.md の Section 9 を参照して、
GameClient内にWebSocketメッセージの受信ハンドラを実装してください。

## 受信するメッセージと処理内容
sessionCreated      → this.session を初期化、mode='invite-link' にして render()
playerJoined        → this.session.players を更新して render()
gameStarted         → this.session.status='in_progress'、mode='game' にして render()
diceRolled          → サイコロの演出をトリガー（render()は呼ばない）
candidatesPresented → 候補カード表示エリアを更新（render()は呼ばない。#ui部分のみ直接DOM操作）
cardAcquired        → 該当プレイヤーのボード表示を更新（render()は呼ばない）
categoryAchieved    → 該当プレイヤーの獲得職種カード表示を更新 + 演出
turnAdvanced        → 手番表示・スコアバーを更新
playerLeft          → phase==='lobby' ならプレイヤーリストから除去、
                       phase==='game' なら該当ボードをグレーアウト表示に切り替え（10.4節）
gameEnded           → 最終ランキング表示（同着の扱いに注意。同順位のプレイヤーは同じ順位数字で表示）
chatMessage         → チャットログ配列（this.chatLog）に追加し、チャットパネルが開いていれば
                       末尾に1件追加表示（render()は呼ばない。パネルが閉じていても内部の配列には
                       蓄積し、未読バッジ等は任意）
error               → エラーコードをi18nキーに変換してトースト表示

## 重要なルール（render()の再生成に関する注意）
render() を呼ぶと画面全体（または#ui-interactive）が再生成され、直前のボタン状態やハイライト状態が
リセットされてしまう。上記のうち「render()は呼ばない」と明記したものは、対象のDOM要素のみを
直接更新すること。
```

---

## Phase 8: game.js — UI レンダリング

### Prompt 8-1: render() のモード分岐

```
#SDD_Specification_v2.0_B_full.md の Section 10.1 を参照して、
GameClient.render() を実装してください。

render() {
  switch (this.mode) {
    case 'room-create': this.renderRoomCreate(); break;
    case 'invite-link':  this.renderInviteLink(); break;
    case 'join-name':    this.renderJoinName(); break;
    case 'lobby':        this.renderLobby(); break;
    case 'game':         this.renderGame(); break;
  }
}

mode==='room-create'/'invite-link'/'join-name'/'lobby' のときは #app 全体を置き換えてよい。
mode==='game' のときは、初回のみ #app 全体を構築し、以後の更新は各要素を直接DOM操作すること
（Phase 7-3の方針と一貫させる）。
```

---

### Prompt 8-2: ルーム作成・招待・参加画面

```
#SDD_Specification_v2.0_B_full.md の Section 5.1, 5.2 を参照して、以下を実装してください。

## renderRoomCreate()
- プレイヤー人数（2/3/4人ボタン）、1人あたりターン数（数値入力）、自分の名前（テキスト）、
  カラー選択（6色の丸ボタン）
- 「ルームを作成する」→ createSession 送信

## renderInviteLink()
- 招待URL表示 + コピーボタン（navigator.clipboard.writeText）
- 参加状況リスト（現在の参加人数 / maxPlayers）、空き枠は「参加者を待っています…」表示
- ホストのみ「ゲームを開始する」ボタン。NOT_ENOUGH_PLAYERS の場合は無効化 + 補足テキスト表示

## renderJoinName()
- 招待URLを開いたプレイヤー向け。「{ホスト名}さんの部屋に参加します」の見出し
- 名前入力、カラー選択（既に使用中の色は選択不可・グレーアウト）
- 「参加する」→ joinSession 送信
```

---

### Prompt 8-3: ゲーム画面（スコアバー・プレイヤーボード）

```
#SDD_Specification_v2.0_B_full.md の Section 10.2 を参照して、renderGame() を実装してください。

## スコアバー（#sb）
プレイヤーごとに：カラー、名前、手持ちスキル/ミッション枚数、獲得職種カード数（バッジ表示）。
現在の手番プレイヤーは枠線等で強調する。

## プレイヤーボード
**そのセッションに実際に参加している人数分だけ**表示する（2人なら2枠、3人なら3枠、4人なら4枠。
固定の4枠グリッドを前提にしない — SDD 10.2節）。各ボードに以下を表示：
- プレイヤー名
- 所持スキルカード（チップ、青系）
- 所持ミッションカード（チップ、紫系）
- 獲得済み職種カード（チップ、ダーク+ゴールド枠）
- 「職種図鑑を見る」ボタン（クリックで職種図鑑モーダルを開く）

status==='left' のプレイヤーのボードは不透明度を下げてグレーアウトし、「退出済み」バッジを
表示する（Phase 7-3のplayerLeftハンドラから呼ばれる）。
```

---

### Prompt 8-4: サイコロ・候補カード選択インタラクション

```
#SDD_Specification_v2.0_B_full.md の Section 6.1, 6.2 を参照して、実装してください。

## サイコロ
「サイコロを振る」ボタン → rollDice 送信 → diceRolled 受信でサイコロの出目演出
（自分の手番のときのみボタンを有効化）

## 候補カード表示・選択
candidatesPresented 受信時、出目N枚の候補カードを、Phase 6-1で定義した `su` キーフレーム
アニメーション（フェードイン+下から上へのスライド）でスライドアップ表示する。
- 既に所持しているカードが候補に含まれる場合は、クリック不可の見た目（グレーアウト+cursor:not-allowed）
  にする（SDD 6.2節確定事項）
- 1st tap：ハイライト（枠線+グロウ）
- 2nd tap（同じカードを再度tap）：確定 → selectCard 送信 → 候補エリアを閉じる
```

---

### Prompt 8-5: 職種図鑑モーダル

```
#SDD_Specification_v2.0_B_full.md の Section 10.3 を参照して、
職種図鑑モーダル（openCategoryDex(playerId)）を実装してください。

## 表示内容
- 対象プレイヤー名、「獲得 X / 全職種数」のサマリー
- 全職種カードを縦一覧表示（スクロール可）。各職種カードについて：
  - 獲得済みなら金枠バッジ「獲得済み」を表示
  - 紐づく個々のスキルカード名・ミッションカード名をそれぞれチップで列挙し、
    そのプレイヤーが所持しているカードは色付き、未所持はグレーアウトで表示する
    （集計数字だけでなく、カード名そのものを見せる — SDD 10.3節確定事項）
  - 各ブロックの見出しに必要枚数を明記（例:「スキル（必要2種）」。全て必須の場合は
    「必要4種・全て」のように表示）
- 「閉じる」ボタンでモーダルを閉じる
```

---

### Prompt 8-6: グループチャットのサイドパネル

```
#SDD_Specification_v2.0_B_full.md の Section 10.5 を参照して、
グループチャットのUIを実装してください。

## 開閉ボタン
画面の隅（例: 右下）に常時表示される丸ボタンを設置し、クリックでサイドパネルの表示/非表示を
切り替える。ロビー画面・ゲーム画面のどちらでも同じボタン・同じパネルが使えるようにする
（mode切り替えでチャットパネルの状態やログが失われないようにする）。

## サイドパネルの構成
- メッセージ一覧（プレイヤー名 + 本文、新しいメッセージが下に追加されていく形。自動スクロール）
- 入力欄 + 「送信」ボタン（Enterキーでも送信可）
- 送信時に chatMessage { text } を送信し、入力欄をクリアする
- 受信した chatMessage は Prompt 7-3 のハンドラで this.chatLog に追加されるので、
  パネルが開いている場合はその都度末尾に1件だけDOM追加する（一覧全体を再描画しない）

## 表示に関する注意
- モデレーションやNGワードフィルタは一切実装しない（自由入力のまま表示する）
- 退出済み（status==='left'）のプレイヤーが過去に送ったメッセージも通常通り表示し続ける
- ゲーム終了（gameEnded受信）時に this.chatLog を空配列にリセットし、パネルの表示内容もクリアする
```

---

## Phase 9: 管理画面実装

### Prompt 9-1: タブ構成・基本CRUD

```
#SDD_Specification_v2.0_B_full.md の Section 11.1 を参照して、admin.html の
タブ構成（職種カード / スキルカード / ミッションカード / 配布比率、およびスキル区分・
ミッション区分の編集）を実装してください。

## ログイン画面
POST /api/auth/login（Prompt 3-1で実装済み）にusername/passwordを送信し、
返却された token を localStorage に保存する。以後の /api/admin/* へのリクエストには
Authorization: Bearer <token> ヘッダーを付与する。トークンが無効（401）の場合はログイン画面に戻す。

## 各タブの基本構成
- 一覧表示（テーブル形式）＋ 新規作成ボタン ＋ 各行に編集・削除ボタン
- 編集フォームはモーダルまたは別セクションで表示し、Prompt 3-2 で定義したREST API
  （POST/PUT/DELETE /api/admin/categories 等）を呼び出す
- 各タブ上部に「CSVインポート」ボタンを設置し、ファイル選択後 Prompt 3-2 のCSV仕様に従って
  POST /api/admin/import/:type を呼び出す。エラー時はレスポンスのエラー内容をそのまま表示する
- 「CSVエクスポート」ボタンは、一覧データをPrompt 3-2のCSVヘッダー形式と同じ列順でテキスト化し、
  ブラウザのダウンロード機能で.csvファイルとして保存させる

model_type の選択UIは不要（'katz'固定のため非表示のまま）。
```

---

### Prompt 9-2: 職種カードのレシピエディタ + バリデーション

```
#SDD_Specification_v2.0_B_full.md の Section 11.2, 11.3, 7.3 を参照して、
職種カード編集フォームにレシピエディタを実装してください。

## フォーム構成
- 職種名（日本語/英語、i18nキー表示）
- 紐づけるスキルカード：チェックボックス一覧（複数選択）
- 必要枚数（スキル）：数値入力
- 紐づけるミッションカード：チェックボックス一覧（複数選択）
- 必要枚数（ミッション）：数値入力

## バリデーション（クライアント側・サーバー側の両方で実装すること）
- 必要枚数は1以上でなければならない（0は不可）
- 必要枚数は、現在チェックされているカードの種類数を超えてはならない
- 超えている場合：赤枠 + エラーメッセージ「必要枚数は選択したカード数（N種）以下にしてください」を
  表示し、保存ボタンを無効化する
- サーバー側（PUT /api/admin/categories/:id/recipe）でも同じ検証を行い、
  違反時は400エラーで拒否する（クライアント側のバリデーションだけに頼らない）
```

---

### Prompt 9-3: 配布比率タブ

```
#SDD_Specification_v2.0_B_full.md の Section 11.4 を参照して、
「配布比率」タブを実装してください。

## UI
スキルカード : ミッションカード = [70] : [30]（数値入力2つ）

## バリデーション
合計が100になることを検証する（クライアント・サーバー双方）。
保存は PUT /api/admin/settings/distribution を呼び出し、game_settings テーブルを更新する。
```

---

## Phase 10: 多言語対応システム

### Prompt 10-1: lang/ja.json の作成

```
#SDD_Specification_v2.0_B_full.md の Section 12 を参照して、lang/ja.json を作成してください。

## 必須キー（12.1節の一覧に加え、既存の共通キーも含める）
room.create / room.playerCount / room.turnsPerPlayer / room.yourName / room.yourColor
lobby.inviteLink / lobby.copyLink / lobby.waitingForPlayers / lobby.playerLeft / lobby.startGame
game.rollDice / game.chooseOneCard / game.categoryDex / game.playerLeftGame / game.achieved
chat.title / chat.toggleOpen / chat.toggleClose / chat.placeholder / chat.send
admin.requiredSkillCount / admin.requiredMissionCount / admin.distributionRatio
errors.NOT_HOST / errors.NOT_ENOUGH_PLAYERS / errors.SESSION_FULL / errors.COLOR_TAKEN /
errors.MID_GAME_JOIN_NOT_ALLOWED / errors.INVALID_CANDIDATE_SELECTION

すべての職種カード・スキルカード・ミッションカードの表示名はDBの name_ja/name_en を使用し、
UI文言のみ本ファイルで管理する。
```

---

### Prompt 10-2: lang/en.json の作成

```
lang/ja.json と同一のキー構造で、英語訳を lang/en.json として作成してください。
```

---

## Phase 11: 動作確認（デプロイ前チェック）

### Prompt 11-1: 動作確認チェックリスト

```
以下のチェックリストを順番に確認してください。

## API動作確認
curl http://localhost:3000/api/health                  → {"ok":true}
curl http://localhost:3000/api/cards/categories         → 12件
curl http://localhost:3000/api/cards/category-recipes   → 各職種にlinkedSkillIds/linkedMissionIdsが含まれる
curl http://localhost:3000/api/settings/distribution    → {"skillRatio":70,"missionRatio":30}
curl http://localhost:3000/api/lang/ja                  → translationsが返る

## ルーム作成〜ゲーム開始フロー
□ ルーム作成画面で人数・ターン数・名前・カラーを設定できる
□ 招待URLが発行され、コピーできる
□ 別ブラウザ/シークレットウィンドウから招待URLを開き、名前・カラーを入力して参加できる
□ 使用済みカラーは選択できない（COLOR_TAKEN）
□ 2人未満では「ゲームを開始する」が無効
□ ホスト以外には「ゲームを開始する」ボタンが出ない、または押してもNOT_HOSTで拒否される

## ゲームループ
□ サイコロを振ると出目N枚の候補カードが表示される（重複なし）
□ 既に所持しているカードが候補に出た場合、選択できない
□ カードを選択するとボードに追加され、他プレイヤーの画面にも反映される
□ 紐づくスキル/ミッションの種類数が閾値を満たすと、職種カードが自動的に獲得される
□ 1回のカード獲得で複数の職種カードが同時に達成されることがある
□ 職種図鑑モーダルで、獲得済み/未達成カードの個々のスキル/ミッションカードの所持状況が見える

## 途中退出
□ ロビー中に1人退出すると、枠が空いて新規参加者が入れる
□ ゲーム中に1人退出すると、そのボードがグレーアウトされ「退出済み」と表示される
□ 退出したプレイヤーの手番が自動的にスキップされる
□ ゲーム中に空いた枠には新規参加者が入れない（MID_GAME_JOIN_NOT_ALLOWED）

## ゲーム終了
□ 総ターン数に達するとゲームが終了し、ランキングが表示される
□ 同数の場合は同着として表示され、無理な順位付けがされていない

## グループチャット
□ チャットの開閉ボタンでサイドパネルの表示/非表示が切り替わる
□ ロビー中でもゲーム中でもメッセージを送受信できる
□ 送信したメッセージが自分を含む全員の画面に表示される
□ 途中退出したプレイヤーの過去の発言がそのまま残っている
□ ゲーム終了（ランキング表示）と同時にチャットログが消える

## 管理画面
□ /admin.html でログインできる
□ 職種カード編集でスキル/ミッションのチェックボックスと必要枚数を設定できる
□ 必要枚数が紐付け数を超える入力をするとエラー表示され保存できない
□ 配布比率タブで合計100以外を入力するとエラーになる

問題のある項目は「補足: デバッグ・確認用プロンプト」を参照してください。
```

---

## Phase 12: デプロイメント設定

### Prompt 12-1: Nginx リバースプロキシ設定

```
Amazon Lightsail等のUbuntuサーバーを前提に、以下の内容で /etc/nginx/sites-available/career-collection-game
を作成してください。

server {
    listen 80;
    server_name <ドメイン名>;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # WebSocketのアップグレードに必須
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

シンボリックリンクを sites-enabled に作成し、nginx -t で構文チェック後 systemctl reload nginx する。
続けて certbot --nginx -d <ドメイン名> でLet's Encrypt証明書を取得しSSL化する。

本モードはThree.js/WebGLを使用しないため、追加のCDN許可設定（fonts.googleapis.com等を除く）は不要。
```

---

### Prompt 12-2: systemd サービス化・起動スクリプト

```
以下の内容で /etc/systemd/system/career-collection-game.service を作成してください。

[Unit]
Description=Career Collection Game (v2.0-B)
After=network.target

[Service]
Type=simple
User=<実行ユーザー名>
WorkingDirectory=/opt/career-collection-game
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/opt/career-collection-game/.env

[Install]
WantedBy=multi-user.target

続けて、以下の手順を自動化する setup.sh を作成してください。
1. npm install --production
2. .env が存在しなければ .env.example をコピーして作成（デプロイ担当者に値の編集を促すメッセージを表示）
3. game.db が存在しなければ npm run initdb を実行
4. systemctl daemon-reload && systemctl enable --now career-collection-game
```

---

## 補足: デバッグ・確認用プロンプト

### Prompt D-1: 職種カード充足ロジックの診断

```
職種カードが「達成されるはずなのに達成されない」または「意図せず達成されてしまう」場合の
診断をしてください。

## 確認ポイント
1. category_skill_links / category_mission_links の紐付けが正しくDBに入っているか
   （管理画面で紐付けたカードが、GET /api/cards/category-recipes のレスポンスに
   反映されているか確認）
2. player.board.skillIds / missionIds が Set 型で正しく管理されており、
   重複追加やID型の不一致（文字列"1" vs 数値1）が起きていないか
   → SDD/v1.x で過去に起きたID型不一致バグと同種の問題が起きやすい箇所。
     必ず Number() で統一して比較すること
3. checkCategoryAchievements が「新規獲得したカードを引いたタイミングごと」に
   正しく呼ばれているか（selectCard ハンドラ内、SDD 7.2節）
4. 既に achievedCategoryIds に含まれる職種カードを毎回再判定していないか（無駄な処理だが
   バグの原因にはならないため優先度は低い）
```

---

### Prompt D-2: 候補抽選・出尽くし判定の診断

```
候補カードが偏る、または同じカードばかり出る場合の診断をしてください。

## 確認ポイント
1. game_settings.skill_mission_ratio が正しくパースされているか（"70:30" → {skill:0.7, mission:0.3}）
2. player.seenSkillIds / seenMissionIds が正しく蓄積されており、全種類を引いた時点で
   リセットされているか（SDD 6.3節の疑似コード通りか確認）
3. 1回の候補提示内で同じカードIDが重複して選ばれていないか（drawUniqueFromPool の実装確認）
```

---

### Prompt D-3: WebSocket・退出処理の診断

```
途中退出まわりの動作がおかしい場合の診断をしてください。

## 確認ポイント
1. ロビー中の退出で session.players から正しく削除されているか
   （削除し忘れると SESSION_FULL が誤って発生する）
2. ゲーム中の退出で player.status='left' に変更されているか（削除してしまうと
   スコアバーやランキングから消えてしまい、SDD 8.2節の「記録として残す」仕様に反する）
3. ターン進行ロジックが status==='left' のプレイヤーを正しくスキップしているか
   （無限ループや手番の飛ばし過ぎに注意）
4. MID_GAME_JOIN_NOT_ALLOWED が session.status で正しく判定されているか
```

---

### Prompt D-4: better-sqlite3 関連エラーの診断

```
better-sqlite3 のネイティブモジュール関連エラー（"invalid ELF header" や
"was compiled against a different Node.js version" 等）が出た場合の対処:

1. npm rebuild better-sqlite3 を実行し、現在のNode.jsバージョン向けに再ビルドする
2. それでも解消しない場合は node_modules を削除して npm install からやり直す:
   rm -rf node_modules package-lock.json && npm install
3. DBファイル自体が壊れている疑いがある場合は再初期化する:
   rm game.db && npm run initdb
4. Dockerを使用している場合、ビルド時のNode.jsバージョンと実行時のNode.jsバージョンが
   一致しているか確認する（バージョン不一致がネイティブモジュールエラーの典型的な原因）
```

---

*本ドキュメントの位置づけ*: `SDD_Specification_v2.0_B_full.md` と章番号を対応させた完全版実装プロンプト集
*次のアクション*: プロジェクトプロンプト（project-prompt-v2.0-B.md）の作成、または本プロンプト集を
使った新しいチャット（Claude.ai / Claude Code）での実装開始
