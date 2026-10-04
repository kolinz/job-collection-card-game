# 職種コレクション（v2.0-B）— 完全実装仕様書

**プロジェクト名**: Role-Based Card Game Framework（カードコレクション版）
**バージョン**: v2.0-B
**ベースライン**: v1.3.1（技術基盤を継承）／ v2.0（ボードゲーム版）とは**並行する別ライン**
**本書のステータス**: 🟢 設計論点確定済み
**作成日**: 2026-09-27

> **この仕様書について**
> 本書は「職種コレクション」（v2.0-B）を**ゼロから再現できる完全版**として記述したものです。
> v1.3.1・v2.0（ボードゲーム版）との差分としてではなく、独立した1つのゲームモードとして
> 自己完結的に記述しています。技術基盤（Node.js/Express/ws/better-sqlite3/i18n/管理画面の作法など）は
> v1.3.1から踏襲していますが、ゲームメカニクス・UI・DBスキーマはv2.0-B独自のものです。

---

## 📋 位置づけ

```
v1.x  ：カード選択型（サイコロ→2〜5枚提示→1枚選択→即判定、職種は開始前に1つ選択）
v2.0  ：ボードゲーム型（サイコロ→駒移動→着地マスで自動判定、3D空間あり）
v2.0-B：カードコレクション型（本書）（サイコロ→N枚の候補提示→1枚選択→ボードに蓄積→
        職種カードのレシピを自動充足判定、2DのみでThree.js不使用）
```

v2.0-Bはv2.0を置き換えるものではなく、**並行して選べる別のゲームモード**として位置づける。

---

## 📋 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [ゲームコンセプト](#2-ゲームコンセプト)
3. [技術スタック](#3-技術スタック)
4. [データベース設計](#4-データベース設計)
5. [ルーム作成・招待・入室フロー](#5-ルーム作成招待入室フロー)
6. [ターン処理（ゲームループ）](#6-ターン処理ゲームループ)
7. [職種カード充足ロジック](#7-職種カード充足ロジック)
8. [途中退出・再入場の扱い](#8-途中退出再入場の扱い)
9. [WebSocketメッセージ一覧](#9-websocketメッセージ一覧)
10. [クライアントUI構成](#10-クライアントui構成)
11. [管理画面](#11-管理画面)
12. [多言語対応（i18n）](#12-多言語対応i18n)
13. [環境変数](#13-環境変数)
14. [実装チェックリスト](#14-実装チェックリスト)

---

## 1. プロジェクト概要

### 1.1 目的

キャリア教育・職業理解を目的としたオンラインマルチプレイヤーゲーム。プレイヤーはITスキルカード・
ミッションカードを集めながら、それらの組み合わせで「職種カード」を獲得していく。

### 1.2 対象ユーザー

中学生〜大学生（キャリア教育）、企業研修参加者、2〜4人のグループ。

### 1.3 理論基盤

Katzの Three Skills モデル（テクニカル・ヒューマン・コンセプチュアル）。`skill_types.model_type` は
`'katz'` 固定とし、Druckerモデルは実装しない（v1.x〜継承の絶対ルール）。

### 1.4 v1.x・v2.0との違い（要点）

| 観点 | v1.x | v2.0（ボードゲーム） | v2.0-B（本書） |
|---|---|---|---|
| 開始時の職種選択 | あり（1つ選ぶ） | あり（1つ選ぶ） | **なし**（職種はプレイ中に複数獲得する対象） |
| サイコロの用途 | カード提示 | 駒の移動歩数 | **候補カードの枚数** |
| カードの選択 | 2〜5枚から1枚選択 | 選択なし（自動解決） | **N枚（重複なし）の候補から1枚選択** |
| カードの消費 | 都度提示・消費的 | イベント自動発生 | **消費なし・永続所持・再利用可能** |
| 勝敗 | ポイント最多 | ゴール到達＋ポイント | **獲得済み職種カードの枚数** |
| 3D | あり（v1.3〜） | あり | **なし（2Dのみ）** |

---

## 2. ゲームコンセプト

### 2.1 基本ループ

```
① サイコロを振る（出目 N）
② 場の無限プールから、管理画面設定の比率（スキル:ミッション）に従い、
   重複なしでN種類の候補カードを抽選して提示
③ プレイヤーが候補から1枚を選択
④ 選んだカードを自分のボードに追加（消費なし・以後も再利用可能）
⑤ サーバーが自動的に、ボード内容と全職種カードのレシピを照合
⑥ 条件を満たした職種カードがあれば自動的に獲得（複数同時獲得もあり得る）
```

### 2.2 カードの性質

- スキルカード・ミッションカードは**消費されない**。一度手に入れたカードは永続的にボードに残り、
  複数の職種カードのレシピに何度でも使い回せる。
- 1枚のカードが複数の職種のレシピに関与し、**同時に複数の職種が充足されることを仕様として歓迎する**
  （現実のIT職種でスキルが複数職種にまたがって通用することの反映であり、教育的にも正しいメッセージ
  になるという判断による）。1枚のカードを「どの職種に使うか」という排他的な割り当ては行わない。

### 2.3 勝敗条件

- ゲーム開始時にホストが「1人あたりのターン数」を設定する。
- ゲーム終了条件 ＝ 総ターン数（プレイヤー人数 × 1人あたりターン数）に到達すること。
- 終了時点で、各プレイヤーが獲得している職種カードの**枚数**の多い順に順位を決定する。
- **同点（同じ枚数）だった場合は、無理に優劣をつけず「同着」として扱う。** タイブレークによる
  追加の順位付けは行わない（教育・研修用途のゲームとして、僅差を無理に競わせないという方針）。

---

## 3. 技術スタック

v1.3.1と同一の技術基盤を踏襲する。

| レイヤー | 技術 | 備考 |
|---|---|---|
| Runtime | Node.js 24 | `engines: { "node": ">=24.0.0" }` |
| DB | better-sqlite3 ^12.8.0 | 同期API。コールバック不使用。3パターン（`all`/`get`/`run`）のみ |
| Backend | Express + `ws`（WebSocket） | |
| Frontend | Vanilla JavaScript | フレームワーク不使用 |
| 3D | **なし** | v1.3で導入したThree.js/SceneManagerは本モードでは使用しない |
| Auth（管理画面） | UUID Bearer token（24h） | |
| i18n | `lang/ja.json` + `lang/en.json` | `i18n.t()` 経由で全表示テキストを取得（必須要件、12章参照） |

### 3.1 better-sqlite3の鉄則（既存ルール、継続）

```javascript
db.prepare('SELECT * FROM table').all()              // 複数行
db.prepare('SELECT * FROM table WHERE id=?').get(id) // 1行
db.prepare('INSERT INTO table (...) VALUES (?)').run(val) // → res.lastInsertRowid
```

エラーハンドリングは同期の `try/catch`。

### 3.2 セッション・プレイヤー状態の扱い

better-sqlite3で永続化するのは**カードマスタデータ**（4章）と**設定値**（配布比率など）のみ。
進行中のゲームセッション（プレイヤー、ターン、ボード内容）はv1.x〜v2.0と同様に**サーバーメモリ上の
オブジェクトとして保持**し、DBには保存しない（`game.db` はマスタデータ専用）。

---

## 4. データベース設計

### 4.1 既存テーブル（v1.x〜継承・変更なし）

| テーブル | 役割 |
|---|---|
| `category_cards` | 職種カード（大分類） |
| `skill_types` | スキル区分（中分類、`model_type='katz'`固定） |
| `skill_cards` | スキルカード（小分類） |
| `missions` | ミッションカード |
| `mission_categories` | ミッションカードの区分（`skill_types`のミッション版。職種との紐付けではない） |

> ⚠️ `mission_categories` は「ミッションカードの分類軸」であり、本書7章の職種レシピにおける
> 「職種⇔ミッション」の紐付けには**使用しない**。紐付けには4.3節の新規テーブルを用いる。

### 4.2 `category_cards` への追加カラム

```sql
ALTER TABLE category_cards ADD COLUMN required_skill_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE category_cards ADD COLUMN required_mission_count INTEGER NOT NULL DEFAULT 1;
```

- どちらも**1以上**でなければならない（0は不可＝「条件なし」の職種カードは許容しない）。
- 値は「紐づけたカードの種類数」を超えてはならない（管理画面でバリデーション、11.3節）。

### 4.3 新規テーブル：職種カードのレシピ紐付け

```sql
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
```

- 1つの職種カードは複数のスキルカード・複数のミッションカードと多対多で紐づく。
- 1つのスキル／ミッションカードが複数の職種カードに紐づくことも許容する（2.2節の設計意図どおり）。

### 4.4 新規テーブル：ゲーム設定（配布比率）

```sql
CREATE TABLE game_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

- `key = 'skill_mission_ratio'`、`value` は `"70:30"` のような文字列（スキル:ミッションの比率）。
- 管理画面「配布比率」タブから編集する（11.4節）。汎用キー・バリュー構造にしておくことで、
  将来的な設定項目の追加にコード変更なしで対応できる（拡張性を優先する方針）。

---

## 5. ルーム作成・招待・入室フロー

### 5.1 画面遷移

```
① ルーム作成（ホスト）
   → 人数（2〜4人）・1人あたりターン数・自分の名前とカラーを設定
② 招待URL発行・参加待ち
   → URLをコピーして共有。参加人数を表示（例: 1/4人）
③ 参加者側：名前・カラー入力
   → 招待URLを開いた人が名前とカラーを設定して参加
④ 全員集合・ゲーム開始
   → ホストにのみ「ゲームを開始する」ボタンが有効化される
```

### 5.2 プレイヤーカラー

v1.xの `AVATAR_COLORS`（6色）をプレイヤー識別用カラーとしてそのまま流用する。3Dアバターの
「アクセサリー（帽子・メガネ等）」の概念はv2.0-Bでは使用しない（2Dのため）。

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

- 同一セッション内で他プレイヤーが既に選択したカラーは選択不可（UIでグレーアウト、
  サーバー側でも `COLOR_TAKEN` エラーで拒否する）。
- 最大4人に対し6色用意しているため、枯渇の心配はない。

### 5.3 ルーム作成時のバリデーション

```javascript
function handleCreateSession(ws, data) {
  const session = {
    id: generateSessionId(),
    hostPlayerId: playerId,
    players: [{ id: playerId, name: data.playerName, colorId: data.colorId, board: { skills: [], missions: [], categories: [] } }],
    maxPlayers: data.maxPlayers,       // 2〜4（v1.1から継続する仕様）
    turnsPerPlayer: data.turnsPerPlayer, // v2.0-B新規：1人あたりターン数
    status: 'lobby',                    // 'lobby' | 'in_progress' | 'finished'
    // ...
  };
}
```

`maxPlayers` は2〜4の範囲でなければならない（`MAX_PLAYERS` 環境変数の上限は超えられない）。

### 5.4 ゲーム開始バリデーション

v1.xの `NOT_HOST → NOT_ENOUGH_PLAYERS → NOT_ALL_SELECTED` の順序から、**本モードには開始前の
職種選択ステップが存在しない**ため、`NOT_ALL_SELECTED` 相当のチェックはない。

```
① NOT_HOST：ホスト以外が開始しようとした場合エラー
② NOT_ENOUGH_PLAYERS：参加人数が2人未満の場合エラー
```

参加＝名前とカラーの入力が完了した時点で即座に「準備完了」となる（v1.xのような別途の
準備完了操作は不要）。

---

## 6. ターン処理（ゲームループ）

### 6.1 全体シーケンス

```
1. 現在の手番プレイヤーがサイコロを振る（出目 N、1〜6）
2. サーバーが game_settings.skill_mission_ratio に従い、
   スキルカード・ミッションカードの無限プールから重複なしでN種類の候補を抽選
3. 候補（N枚）を手番プレイヤーにのみ送信
4. 手番プレイヤーが候補から1枚を選択
5. 選択されたカードをそのプレイヤーのボードに追加（永続・消費なし）
6. サーバーが全職種カードのレシピと当該プレイヤーのボードを照合し、
   新たに条件を満たした職種カードがあれば自動的に獲得としてマークする
7. 結果（引いたカード・獲得した職種カードがあれば）を全プレイヤーにブロードキャスト
8. 手番を次のプレイヤーに移す。総ターン数に達していればゲーム終了処理へ
```

### 6.2 候補抽選ロジック（重複なしでN種）

```javascript
function drawCandidates(session, player, diceValue) {
  const ratio = getSkillMissionRatio(); // game_settingsから取得、例: {skill:0.7, mission:0.3}
  const candidates = [];
  const usedIds = new Set();

  for (let i = 0; i < diceValue; i++) {
    const wantSkill = Math.random() < ratio.skill;
    const pool = wantSkill
      ? getAvailablePool(player, 'skill')
      : getAvailablePool(player, 'mission');
    const card = drawUniqueFromPool(pool, usedIds); // 既に候補に出たカードは除外
    usedIds.add(card.id);
    candidates.push({ ...card, cardType: wantSkill ? 'skill' : 'mission' });
  }
  return candidates;
}
```

- 「重複なし」は**この1回の候補提示の中で**同じカードが2枚出ないことを指す。既にプレイヤーが
  所持しているカードが候補に含まれること自体は許容するが、**その場合は選択できないようにする**
  （UI上は表示するがクリック不可／グレーアウトとする）。プレイヤーが実際に選べるのは、候補の中の
  未所持カードのみである。

### 6.3 カードプールの枯渇と再取得（プレイヤー個人単位）

```javascript
function getAvailablePool(player, cardType) {
  const allCards = cardType === 'skill' ? getAllSkillCards() : getAllMissionCards();
  const seenIds = cardType === 'skill' ? player.seenSkillIds : player.seenMissionIds;

  let available = allCards.filter(c => !seenIds.has(c.id));
  if (available.length === 0) {
    // このプレイヤーについて全種類が出尽くした → 個人のドロー履歴をリセットして再取得可能にする
    seenIds.clear();
    available = allCards;
  }
  return available;
}
```

- 出尽くし判定は**プレイヤー個人ごと**に行う（他プレイヤーの抽選状況とは独立）。
- カードは消費されないため、「出尽くし＝そのプレイヤーが全種類を少なくとも1回引いたことがある」
  という意味であり、既に所持しているかどうかとは別軸の管理（`seenSkillIds`/`seenMissionIds`）。

---

## 7. 職種カード充足ロジック

### 7.1 判定式

各職種カード `category` について：

```
達成 ⇔ |player.skills ∩ category.linkedSkills| ≥ category.required_skill_count
      かつ
      |player.missions ∩ category.linkedMissions| ≥ category.required_mission_count
```

- 「紐づいたカードのうち何**種類**を所持しているか」（ユニーク数）で判定する。所持枚数の重複は
  数えない（そもそもカードは1種類につき実質1枚として扱う。同一カードを複数回引いても増分はない）。
- 1枚のカードは他の職種カードの判定にも独立してカウントされる。**排他的な割り当て（ロック）は
  行わない**（2.2節参照）。

### 7.2 判定タイミング

新しいスキル／ミッションカードを1枚獲得するたびに、**全職種カードに対して自動的に再判定**する。

```javascript
function checkCategoryAchievements(player) {
  const newlyAchieved = [];
  for (const category of getAllCategoriesWithRecipes()) {
    if (player.achievedCategoryIds.has(category.id)) continue; // 既に獲得済みはスキップ
    const skillMatch = countIntersection(player.skillIds, category.linkedSkillIds);
    const missionMatch = countIntersection(player.missionIds, category.linkedMissionIds);
    if (skillMatch >= category.required_skill_count && missionMatch >= category.required_mission_count) {
      player.achievedCategoryIds.add(category.id);
      newlyAchieved.push(category.id);
    }
  }
  return newlyAchieved; // 複数同時獲得もあり得る
}
```

### 7.3 管理画面での閾値バリデーション（11.3節と対応）

- `required_skill_count` は 1 以上、かつ紐づけたスキルカードの種類数以下でなければならない。
- `required_mission_count` は 1 以上、かつ紐づけたミッションカードの種類数以下でなければならない。
- 0（条件なし）は許容しない。両方の紐付けが必須（スキルだけ・ミッションだけで成立する職種カードは
  作れない）。

---

## 8. 途中退出・再入場の扱い

### 8.1 ロビー中の退出

- 退出したプレイヤーの枠は**空き枠に戻る**。
- 空いた枠には、同じ招待URLから新規参加者が通常の参加フロー（5.1節③）でそのまま入室できる。
- 残り人数が2人以上であれば、ホストはそのままゲームを開始することもできる。

### 8.2 ゲーム中の退出

- 退出したプレイヤーのボードは**グレーアウト表示**とし、「退出済み」であることを明示する。
  それまでに集めていたカード・獲得済み職種カードは記録として残したまま表示する。
- 手番が回ってきた場合は**自動的にスキップ**する。
- その空いた枠に**そのゲームの途中から新規参加者を補充することはしない**（8.3節）。

### 8.3 途中参加の扱い（確定：不可）

ゲーム進行中（`status = 'in_progress'`）に招待URLを開いた場合、新規参加は受け付けない
（`MID_GAME_JOIN_NOT_ALLOWED` エラー）。新規参加を受け付けるのはロビー段階（`status = 'lobby'`）
のみである。

### 8.4 再入場の扱い（確定：常に新規プレイヤー）

招待URLから（再度）入室してきた人物は、それが離脱前の本人であるかどうかに関わらず、
**常に新規プレイヤーとして扱う**。離脱前のセッション・進捗（所持カード・獲得職種カード等）を
引き継ぐ「復帰」処理は実装しない。これにより、再接続トークンの管理や離脱者の同一性判定
ロジックは不要になる。

---

## 9. WebSocketメッセージ一覧

### 9.1 クライアント → サーバー

| メッセージ | ペイロード | 説明 |
|---|---|---|
| `createSession` | `{ playerName, colorId, maxPlayers, turnsPerPlayer }` | ルーム作成（ホスト） |
| `joinSession` | `{ sessionId, playerName, colorId }` | ロビー段階のみ受付（8.3節） |
| `startGame` | `{}` | ホストのみ。5.4節のバリデーション適用 |
| `rollDice` | `{}` | 現在の手番プレイヤーのみ |
| `selectCard` | `{ candidateCardId }` | 提示された候補の中からのみ選択可 |
| `nextTurn` | `{}` | ターン終了・手番送り |
| `resign` | `{}` | 自主退出（ロビー中／ゲーム中いずれも） |
| `resetGame` | `{}` | ホストのみ。ゲーム終了後の初期化 |
| `chatMessage` | `{ text }` | グループチャットへの投稿（10.5節）。ロビー中・ゲーム中いずれでも送信可 |

### 9.2 サーバー → クライアント

| メッセージ | 主なペイロード | 送信範囲 |
|---|---|---|
| `sessionCreated` | `{ sessionId, inviteUrl }` | 作成者のみ |
| `playerJoined` | `{ player }` | 全員 |
| `gameStarted` | `{ turnOrder, totalTurns }` | 全員 |
| `diceRolled` | `{ playerId, diceValue }` | 全員（演出用） |
| `candidatesPresented` | `{ candidates: [...] }` | 手番プレイヤーのみ（非公開情報） |
| `cardAcquired` | `{ playerId, card, cardType }` | 全員 |
| `categoryAchieved` | `{ playerId, categoryId }` | 全員（同時に複数送信されることがある） |
| `turnAdvanced` | `{ currentPlayerId, turnNumber }` | 全員 |
| `playerLeft` | `{ playerId, phase: 'lobby' \| 'game' }` | 全員 |
| `gameEnded` | `{ rankings: [{ playerId, categoryCount }] }` | 全員 |
| `chatMessage` | `{ playerId, playerName, text, sentAt }` | 全員（10.5節） |
| `error` | `{ code, message }` | 発生元クライアントのみ |

### 9.3 エラーコード

| コード | 発生条件 |
|---|---|
| `NOT_HOST` | ホスト以外が `startGame` を送信 |
| `NOT_ENOUGH_PLAYERS` | 参加人数が2人未満で `startGame` |
| `SESSION_FULL` | `maxPlayers` に達した状態で `joinSession` |
| `COLOR_TAKEN` | 既に他プレイヤーが使用中のカラーを指定 |
| `MID_GAME_JOIN_NOT_ALLOWED` | `status='in_progress'` の状態で `joinSession`（8.3節） |
| `INVALID_CANDIDATE_SELECTION` | `candidatesPresented` に含まれないIDを指定、または既所持のため選択不可のカードを `selectCard` で指定 |

---

## 10. クライアントUI構成

Three.jsは使用せず、HTML/CSSによる2D UIのみで完結する（v1.3で導入した `#scene-container` /
`#ui-overlay` / `#ui-interactive` の3層DOM構造・SceneManagerは本モードでは不要）。

### 10.1 画面遷移

```
ルーム作成 → 招待URL発行・参加待ち → （参加者側）名前・カラー入力
  → 全員集合・ゲーム開始 → ゲーム画面（ターン進行）
```

### 10.2 ゲーム画面の構成要素

| 要素 | 内容 |
|---|---|
| ヘッダー | タイトル、ターン数（現在/総数）、現在の手番プレイヤー名 |
| スコアバー | プレイヤーごとに：カラー、名前、手持ちスキル/ミッション枚数、獲得職種カード数（バッジ） |
| ターン操作エリア | サイコロ表示・「サイコロを振る」ボタン、候補カード（1st tap→2nd tap で確定）※後述 |
| プレイヤーボード（人数分） | プレイヤー名、所持スキルカード（チップ表示）、所持ミッションカード（チップ表示）、獲得済み職種カード（チップ表示）、「職種図鑑を見る」ボタン |

プレイヤーボードは**そのセッションに実際に参加している人数分だけ**表示する（2人なら2枠、
3人なら3枠、4人なら4枠）。固定の4枠グリッドを前提にする必要はない。

**候補カードの選択操作**：v1.xの「1st tap→ハイライト→2nd tap→確定」というインタラクションを
踏襲する。

### 10.3 職種図鑑モーダル

「職種図鑑を見る」ボタンから開く別パネル（モーダル）。全職種カードを一覧表示し、それぞれについて
**紐づく個々のスキルカード／ミッションカード単位**で所持・未所持を可視化する（集計数字だけの
表示ではなく、カード名そのものをチップで列挙する）。

- 獲得済みの職種カードには「獲得済み」バッジ（金枠）を表示する。
- 未達成の職種カードも、紐づく各カードチップを「所持＝色付き」「未所持＝グレーアウト」で表示し、
  各ブロックの見出しに必要枚数（例：「スキル（必要2種）」）を明記する。全て必須の場合は
  「必要4種・全て」のように明示する。

### 10.4 途中退出時の表示

- **ロビー中**：トースト通知「〇〇が退出しました」を表示し、参加者リストから該当プレイヤーを除去、
  空いた枠は「参加者を待っています…」のプレースホルダーに戻す。
- **ゲーム中**：ヘッダーに警告バッジ「〇〇が退出しました（手番は自動スキップ）」を表示し、
  該当プレイヤーのボードを不透明度を下げてグレーアウト、「退出済み」バッジを表示する
  （8.2節）。

### 10.5 グループチャット

- そのゲームルームの参加者全員が見える**1本のグループチャット**（個別ダイレクトメッセージは
  設けない）。
- **ロビー中・ゲーム中を問わず常時利用可能**。
- UIはサイドパネル形式とし、開閉ボタンで表示/非表示を切り替える（常時画面を占有しない）。
- **自由入力・モデレーションなし**。投稿内容に対するフィルタリングや制限は設けない。
- ログは**サーバーメモリ上にのみ**保持し、DBへの永続化は行わない。ゲーム終了（`gameEnded`）と
  同時にログを破棄する。ゲームを再読み込みしても過去ログは復元されない。
- 途中退出（8章）したプレイヤーの発言は**そのまま残す**（削除・マスキングしない）。どのみち
  ゲーム終了時にログ自体が消えるため、退出者の発言だけを特別扱いする必要はない。

---

## 11. 管理画面

v1.xの管理画面（`admin.html`）のタブ構成・CRUDパターン・CSV Import/Export・UUID Bearer認証を
そのまま踏襲する。

### 11.1 タブ構成

```
[職種カード] [スキルカード] [ミッションカード] [配布比率]
```

`skill_types`（スキル区分）・`mission_categories`（ミッション区分）の編集タブも既存どおり維持する
（本書では省略）。`model_type` の選択UIは不要（`'katz'` 固定のため非表示のまま、v1.x〜継続）。

### 11.2 職種カード編集フォーム

```
職種名（日本語）: [____________]
職種名（英語）:   [____________]  ← i18nキー: category.<slug>
---
紐づけるスキルカード（チェックボックス一覧、複数選択）
必要枚数（このうち何種以上）: [__]  最大: 選択中の枚数
---
紐づけるミッションカード（チェックボックス一覧、複数選択）
必要枚数（このうち何種以上）: [__]  最大: 選択中の枚数
---
[保存する]
```

### 11.3 バリデーション（必須）

- `required_skill_count` ／ `required_mission_count` はいずれも**1以上**。
- 各値は、その時点で選択（紐付け）されているカードの種類数を**超えてはならない**。
- 超えている場合は保存をブロックし、赤枠＋エラーメッセージ
  「必要枚数は選択したカード数（N種）以下にしてください」を表示する。

### 11.4 配布比率タブ

```
スキルカード : ミッションカード = [70] : [30]
```

`game_settings` テーブルの `skill_mission_ratio` を編集する（4.4節）。合計が100になるよう
バリデーションする。

---

## 12. 多言語対応（i18n）

**i18n対応は本モードにおいて必須要件とする。** v1.x〜の `i18n.t()` 経由での表示・`lang/ja.json`・
`lang/en.json` の構造をそのまま踏襲する。

### 12.1 v2.0-B新規i18nキー（例）

| キー | 内容 |
|---|---|
| `room.create` | 「ルームを作成する」 |
| `room.playerCount` | 「プレイヤー人数」 |
| `room.turnsPerPlayer` | 「1人あたりのターン数」 |
| `lobby.inviteLink` | 「招待リンク」 |
| `lobby.waitingForPlayers` | 「参加者を待っています…」 |
| `lobby.playerLeft` | 「{{name}}が退出しました」 |
| `game.rollDice` | 「サイコロを振る」 |
| `game.chooseOneCard` | 「候補カードから1枚を選択してください」 |
| `game.categoryDex` | 「職種図鑑を見る」 |
| `game.playerLeftGame` | 「{{name}}が退出しました（手番は自動スキップ）」 |
| `chat.title` | 「チャット」 |
| `chat.toggleOpen` | 「チャットを開く」 |
| `chat.toggleClose` | 「チャットを閉じる」 |
| `chat.placeholder` | 「メッセージを入力…」 |
| `chat.send` | 「送信」 |
| `admin.requiredSkillCount` | 「必要枚数（スキル）」 |
| `admin.requiredMissionCount` | 「必要枚数（ミッション）」 |
| `admin.distributionRatio` | 「配布比率」 |
| `errors.NOT_ENOUGH_PLAYERS` | 「2人以上そろってから開始してください」 |
| `errors.COLOR_TAKEN` | 「そのカラーは既に使用されています」 |
| `errors.MID_GAME_JOIN_NOT_ALLOWED` | 「このゲームは進行中のため途中参加できません」 |

各職種カード・スキルカード・ミッションカードの名前自体も、既存の運用と同様に管理画面で
日本語／英語の両方を登録する。

---

## 13. 環境変数

v1.x〜の環境変数運用方針（`.env` でゲームパラメータを外出しする）を継続する。

| 変数名 | 内容 | デフォルト |
|---|---|---|
| `PORT` | サーバーポート | 既存踏襲 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 管理画面認証 | 既存踏襲 |
| `MAX_PLAYERS` | セッションあたりの人数上限（システム全体） | 4 |

配布比率（`skill_mission_ratio`）は環境変数ではなく `game_settings` テーブル（4.4節）で
管理し、管理画面から動的に変更できるようにする（再デプロイ不要という設計思想をv2.0から継承）。

---

## 14. 実装チェックリスト

- [ ] DBマイグレーション：`category_cards` への `required_skill_count`/`required_mission_count` 追加
- [ ] 新規テーブル：`category_skill_links` / `category_mission_links` / `game_settings`
- [ ] 職種カード充足ロジック（7章）のサーバー実装・単体テスト
- [ ] 候補抽選ロジック（6.2節）・個人単位の出尽くし判定（6.3節）
- [ ] ルーム作成〜招待〜参加〜ロビーのWebSocketハンドラ（5章・9章）
- [ ] 途中退出（ロビー中／ゲーム中）のハンドリングとUI反映（8章）
- [ ] 途中参加不可のガード（`MID_GAME_JOIN_NOT_ALLOWED`）
- [ ] ゲーム画面（2D）・スコアバー・職種図鑑モーダルの実装（10章）
- [ ] グループチャット（サイドパネルUI・サーバーブロードキャスト・ゲーム終了時のログ破棄）の実装（10.5節）
- [ ] 管理画面：職種カードのレシピ編集UI＋バリデーション（11.2〜11.3節）
- [ ] 管理画面：配布比率タブ（11.4節）
- [ ] i18nキーの追加・`lang/ja.json`/`lang/en.json` 更新（12章）

---

*本書ステータス*: 🟢 設計論点確定済み
*次のアクション*: 実装プロンプト集（v2.0-B-implementation-prompts）・
プロジェクトプロンプト（project-prompt-v2.0-B）の作成に進む
