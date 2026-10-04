# Role-Based Card Game Framework — プロジェクトプロンプト v2.0-B（職種コレクション版）

あなたはこのプロジェクトの開発パートナーです。
仕様書 `SDD_Specification_v2.0_B_full.md` と実装プロンプト集 `v2.0-B-implementation-prompts-full.md` を
正として動作してください。本書はその2つの要点を凝縮した、実装セッション用のクイックリファレンスです。

v2.0（ボードゲーム版）とは**並行する別ライン**のゲームモードであり、置き換えではありません。
技術基盤（Node.js/Express/ws/better-sqlite3/i18nの作法）はv1.3.1を継承していますが、
**3D（Three.js/SceneManager）は一切使用しません**。本書はゼロから読んでも実装できるよう
自己完結的に書いています。

---

## プロジェクト概要

**名称**: Role-Based Card Game Framework（職種コレクション版）
**目的**: キャリア教育・職業理解を目的としたオンラインマルチプレイヤーカード収集ゲーム
**対象**: 中学生〜大学生、企業研修（2〜4人グループ）
**理論基盤**: Katz の Three Skills モデル（テクニカル・ヒューマン・コンセプチュアル）
**ゲーム形式**: サイコロで出た数だけ候補カード（スキル/ミッション）が提示され、1枚を選んで
ボードに蓄積する。カードは消費されず永続的に再利用可能。集めたカードの組み合わせで
職種カードのレシピ（管理画面で設定）を自動的に充足していき、制限ターン内に獲得した
職種カードの枚数で勝敗を決める。**開始前の職種選択は行わない**（v1.x/v2.0との最大の違い）。

---

## 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| Runtime | Node.js 24 | `engines: { node: ">=24.0.0" }` |
| DB | better-sqlite3 ^12.8.0 | 同期API。コールバック不使用 |
| Backend | Express + ws（WebSocket） | |
| Frontend | Vanilla JavaScript | フレームワーク不使用 |
| 3D | **なし** | Three.js/SceneManagerは本モードでは使用しない |
| Auth | UUID Bearer token（24h、管理画面のみ） | |

### better-sqlite3 の鉄則

コールバックは一切使わない。3パターンのみ：

```javascript
db.prepare('SELECT * FROM table').all()                    // 複数行
db.prepare('SELECT * FROM table WHERE id=?').get(id)       // 1行
db.prepare('INSERT INTO table (...) VALUES (?)').run(val)  // → res.lastInsertRowid
```

エラーハンドリングは `try/catch`（同期）。

### セッション状態の扱い

進行中のゲームセッション（プレイヤー・ターン・ボード内容）は**DBに保存せず、サーバーメモリ上の
オブジェクトとして保持**する。DBに永続化するのはカードマスタデータと `game_settings`（配布比率）
のみ。

---

## DB テーブル（全8テーブル）

| テーブル | 役割 |
|---|---|
| `category_cards` | 職種カード（`required_skill_count`/`required_mission_count` カラムを持つ） |
| `skill_types` | スキル区分（`model_type='katz'` 固定） |
| `skill_cards` | スキルカード |
| `missions` | ミッションカード（`enabled` カラム） |
| `mission_categories` | ミッションカードの分類軸（職種との紐付けには使わない） |
| `category_skill_links` | **新規**：職種カード⇔スキルカードの多対多紐付け |
| `category_mission_links` | **新規**：職種カード⇔ミッションカードの多対多紐付け |
| `game_settings` | **新規**：キー・バリュー設定（配布比率 `skill_mission_ratio` など） |

**重要**: `skill_cards.matchesCategories`（v1.x/v2.0にあったカンマ区切り紐付けカラム）は
**本モードでは使用しない**。職種との紐付けは `category_skill_links` / `category_mission_links`
で行う。

**重要**: `skill_types.model_type` は `'katz'` 固定。Drucker モデルは実装しない。

完全なCREATE TABLE文は `v2.0-B-implementation-prompts-full.md` Prompt 2-1 を参照。

---

## 職種カード充足ロジック（最重要ロジック）

```
達成 ⇔ |player.skillIds ∩ category.linkedSkillIds| ≥ category.required_skill_count
      かつ
      |player.missionIds ∩ category.linkedMissionIds| ≥ category.required_mission_count
```

- 「紐づいたカードのうち何**種類**を所持しているか」（ユニーク数）で判定する
- 1枚のカードは複数の職種カードの判定に**独立してカウント**される。排他的な割り当て
  （1枚を1つの職種にしか使えないロック）は行わない
- 新しいカードを1枚獲得するたびに、**全職種カードを自動的に再判定**する（複数同時達成もあり得る）
- 管理画面のバリデーション：`required_skill_count`/`required_mission_count` は1以上、かつ
  紐づけたカードの種類数以下でなければならない（0＝条件なしは不可）

詳細アルゴリズムは `SDD_Specification_v2.0_B_full.md` Section 7 を参照。

---

## ゲームフロー

```
① ルーム作成（ホスト）：人数（2〜4人）・1人あたりターン数・自分の名前とカラーを設定
② 招待URL発行・参加待ち：URLをコピーして共有
③ 参加者側：招待URLを開き、名前とカラーを入力して参加
④ 全員集合・ゲーム開始：ホストにのみ「ゲームを開始する」ボタンが有効化
⑤ ゲーム進行（下記ターンループ）
⑥ 総ターン数（参加人数 × 1人あたりターン数）到達でゲーム終了、ランキング表示
```

- 参加＝名前とカラーの入力が完了した時点で即座に「準備完了」（v1.xのような別途の準備完了操作は不要）
- `startGame` バリデーション順：`NOT_HOST` → `NOT_ENOUGH_PLAYERS`（<2）。
  **`NOT_ALL_SELECTED`（職種選択チェック）は本モードには存在しない**（開始前の職種選択自体がないため）

### プレイヤーカラー（v1.xの `AVATAR_COLORS` を流用、アクセサリーは使わない）

```javascript
const PLAYER_COLORS = [
  { id: 1, hex: '#6366f1' }, // インディゴ
  { id: 2, hex: '#f59e0b' }, // アンバー
  { id: 3, hex: '#10b981' }, // エメラルド
  { id: 4, hex: '#ef4444' }, // レッド
  { id: 5, hex: '#38bdf8' }, // スカイ
  { id: 6, hex: '#a855f7' }, // バイオレット
];
```

同一セッション内で他プレイヤーが選択済みのカラーは選べない（`COLOR_TAKEN`）。

### ターンループ

```
1. 手番プレイヤーがサイコロを振る（出目 N）
2. game_settings.skill_mission_ratio の比率で、無限プールから重複なしでN種類の候補を抽選
   （個人ごとの出尽くし判定：全種類を引き終えたらそのプレイヤーの履歴だけリセットして再取得可）
3. 候補を手番プレイヤーにのみ提示。既に所持しているカードが候補に含まれる場合は選択不可
   （表示はするがクリック不可）
4. プレイヤーが未所持の候補から1枚選択（1st tap→ハイライト→2nd tap→確定）
5. 選んだカードをボードに追加（消費なし・永続・再利用可能）
6. 全職種カードを自動再判定し、新たに満たしたものがあれば自動獲得
7. 手番を次へ。離脱済み（status='left'）のプレイヤーは自動スキップ
```

### 勝敗・同着の扱い

終了時点の獲得職種カード枚数の多い順に順位を決定する。**同数の場合はタイブレークを行わず
同着として扱う**（無理に優劣をつけない）。

---

## 途中退出・再入場（重要な確定事項）

| 状況 | 挙動 |
|---|---|
| ロビー中に退出 | 枠が空く。同じ招待URLから新規参加者がそのまま入室可能 |
| ゲーム中に退出 | ボードをグレーアウト＋「退出済み」表示。手番は自動スキップ。**その枠はそのゲームでは補充しない** |
| ゲーム中の新規参加 | **不可**（`MID_GAME_JOIN_NOT_ALLOWED`）。新規参加はロビー段階のみ |
| 再入場 | 誰であっても**常に新規プレイヤー**として扱う。離脱前のセッション・進捗の引き継ぎ（復帰処理）は実装しない |

---

## クライアント UI 構成

Three.js不使用のため、v1.3の `#scene-container`/`#ui-overlay`/`#ui-interactive` の3層DOM構造・
SceneManagerは**不要**。HTML/CSSのみの2D構成。

- **ゲーム画面**：ヘッダー（ターン数・手番表示）／スコアバー（プレイヤーごとにカラー・名前・
  手持ち枚数・獲得職種カード数）／ターン操作エリア（サイコロ・候補カード）／プレイヤーボード
- **プレイヤーボードは参加人数分だけ表示する**（2人なら2枠、3人なら3枠、4人なら4枠。固定4枠を
  前提にしない）
- **職種図鑑モーダル**：各プレイヤーのボードから開く別パネル。全職種カードを一覧し、
  紐づく個々のスキル/ミッションカード名を所持＝色付き／未所持＝グレーアウトのチップで表示。
  集計数字だけでなくカード名そのものを見せる。閾値は「必要2種」のように明記
- **グループチャット**：詳細は下記「グループチャット」節を参照

### グループチャット

- ゲームルーム全体で1本（個別DMなし）。**ロビー中・ゲーム中を問わず常時利用可能**
- UIはサイドパネル形式、開閉ボタンで表示/非表示を切り替える
- **自由入力・モデレーションなし**（フィルタリングやNGワード判定は実装しない）
- ログは**サーバーメモリ上のみ**に保持し、DBには保存しない。ゲーム終了時にログを破棄する
- 途中退出したプレイヤーの発言も削除せずそのまま残す（ゲーム終了で消えるため特別扱い不要）
- WSメッセージ: `chatMessage`（送信: `{ text }` / 受信ブロードキャスト:
  `{ playerId, playerName, text, sentAt }`）

### 必須CSSアニメーション

```css
@keyframes su  { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
@keyframes fo  { to { opacity:0; transform:scale(0.94); } }
@keyframes pip { 0%{transform:scale(1)} 50%{transform:scale(1.5)} 100%{transform:scale(1)} }
```

### render() のルール

`mode==='room-create'/'invite-link'/'join-name'/'lobby'` のときは `#app` 全体を置き換えてよい。
`mode==='game'` のときは、候補提示・カード獲得・職種達成・退出通知の受信時に `render()` を
**呼ばない**（ボタン状態やハイライト状態のリセットを防ぐため）。該当DOM要素のみ直接更新する。

---

## WebSocket メッセージタイプ（全量）

```
createSession / joinSession
startGame
rollDice
selectCard
nextTurn / resign / resetGame
chatMessage
```

サーバー→クライアント: `sessionCreated` / `playerJoined` / `gameStarted` / `diceRolled` /
`candidatesPresented`（手番プレイヤーのみ） / `cardAcquired` / `categoryAchieved` /
`turnAdvanced` / `playerLeft` / `gameEnded` / `chatMessage` / `error`

エラーコード: `NOT_HOST` / `NOT_ENOUGH_PLAYERS` / `SESSION_FULL` / `COLOR_TAKEN` /
`MID_GAME_JOIN_NOT_ALLOWED` / `INVALID_CANDIDATE_SELECTION`

完全なペイロード定義は `SDD_Specification_v2.0_B_full.md` Section 9 を参照。

---

## REST API エンドポイント一覧

```
GET  /api/cards/categories
GET  /api/cards/skills
GET  /api/cards/missions
GET  /api/cards/skill-types
GET  /api/cards/mission-categories
GET  /api/cards/category-recipes    # 職種カードごとの紐付け一覧（職種図鑑・レシピエディタ用）
GET  /api/settings/distribution     # 配布比率
GET  /api/lang/:lang
POST /api/auth/login
GET  /api/health

POST/PUT/DELETE /api/admin/categories
POST/PUT/DELETE /api/admin/skills
POST/PUT/DELETE /api/admin/missions
POST/PUT/DELETE /api/admin/skill-types
PUT  /api/admin/categories/:id/recipe   # レシピ編集（閾値バリデーション必須、サーバー側でも再検証）
PUT  /api/admin/settings/distribution   # 配布比率編集（合計100を検証）
POST /api/admin/import/:type            # CSV upsert
```

完全な認証実装・CSVフォーマットは `v2.0-B-implementation-prompts-full.md` Prompt 3-1・3-2 を参照。

---

## 管理画面

タブ構成：`職種カード` / `スキルカード` / `ミッションカード` / `配布比率`（＋スキル区分・
ミッション区分の編集）。

**職種カード編集フォーム**：職種名（日英）、紐づけるスキルカード（チェックボックス複数選択）＋
必要枚数入力、紐づけるミッションカード（チェックボックス複数選択）＋必要枚数入力。

**必須バリデーション**：必要枚数は1以上、かつ選択中のカード種類数以下（クライアント・
サーバー双方で検証。超える入力は保存をブロックし、エラーメッセージを表示）。

`model_type` の選択UIは不要（`'katz'` 固定のため非表示のまま）。

---

## i18n（必須要件）

i18n対応は本モードにおいて**必須**。`i18n.t()` 経由での表示、`lang/ja.json`/`lang/en.json` の
構造はv1.x〜を踏襲。表示テキストの参照は常に `i18n.currentLang` を直接使う（キャッシュ変数
`this.language` は使わない）。

新規キー例：`room.*` / `lobby.*` / `game.rollDice` / `game.chooseOneCard` / `game.categoryDex` /
`game.playerLeftGame` / `chat.title` / `chat.toggleOpen` / `chat.placeholder` / `chat.send` /
`admin.requiredSkillCount` / `admin.requiredMissionCount` /
`admin.distributionRatio` / `errors.COLOR_TAKEN` / `errors.MID_GAME_JOIN_NOT_ALLOWED`

完全なキー一覧は `v2.0-B-implementation-prompts-full.md` Phase 10 を参照。

---

## 開発時の注意事項

- Three.js・WebGL・SceneManagerは一切使用しない（3D関連ファイル・CDN依存を作らない）
- `better-sqlite3` はサーバー起動前に `npm install` が必要
- `game.db` は `.gitignore` に含まれる。本番では `npm run initdb` で初期化
- ID比較は型不一致（文字列"1" vs 数値1）に注意し、`Number()` で統一すること
  （過去バージョンで頻発したバグと同種）
- スキル/ミッションカードは消費されない。「所持カードを候補から選べなくする」処理と
  「ボードから削除する」処理を混同しないこと（後者は行わない）
- 職種カードの充足判定は「閾値以上」であり「全部揃える」ではない（閾値未満の紐付けカードが
  余っていても達成扱いにしてよい）

---

## ファイル構成

```
├── server.js
├── index.html       # 2D UI + CSS animations（Three.js CDNなし）
├── game.js           # I18n + GameClient（SceneManagerなし）
├── admin.html
├── initdb.js
├── check-db.js
└── lang/
    ├── ja.json
    └── en.json
```

---

*参照元*: `SDD_Specification_v2.0_B_full.md`（全14章・完全版）、
`v2.0-B-implementation-prompts-full.md`（Phase 1〜12＋デバッグ補足）
