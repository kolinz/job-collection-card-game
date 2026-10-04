# 職種コレクションゲーム — Role-Based Card Game Framework v2.0-B

キャリア教育・職業理解を目的とした**オンラインマルチプレイヤーカード収集ゲーム**です。  
プレイヤーはスキルカード・ミッションカードを集めながら、組み合わせで「職種カード」を獲得していきます。  
授業・企業研修での 2〜4 人グループプレイを想定して設計されています。

---

## 🎮 ゲームの概要

| 項目 | 内容 |
|---|---|
| プレイ人数 | 2〜4 人（オンラインマルチプレイ） |
| 対象 | 中学生〜大学生、企業研修参加者 |
| 理論基盤 | Katz の Three Skills モデル（テクニカル・ヒューマン・コンセプチュアル） |
| ゲーム形式 | サイコロ → N 枚の候補提示 → 1 枚選択 → ボードに蓄積 → 職種カード自動獲得 |

### ゲームの流れ

1. ホストがルームを作成し、招待URLを共有する
2. 参加者が招待URLから名前とカラーを選んで入室する
3. ホストがゲーム開始 → ターン制でサイコロを振る
4. 出目の数だけ候補カード（スキル/ミッション）が提示される
5. 1枚選んで自分のボードに追加（カードは消費されず永続所持）
6. 所持カードの組み合わせで職種カードのレシピが自動充足 → 職種カード獲得
7. 総ターン数到達でゲーム終了、獲得した職種カード枚数で順位決定

---

## 🛠 技術スタック

| レイヤー | 技術 |
|---|---|
| Runtime | Node.js 24 |
| Backend | Express + ws（WebSocket） |
| Database | better-sqlite3（SQLite、同期API） |
| Frontend | Vanilla JavaScript + HTML/CSS（フレームワーク不使用） |
| 3D | **なし**（2D のみ） |
| 認証 | UUID Bearer token（管理画面のみ、24h 有効） |

---

## 📁 ファイル構成

```
career-collection-game/
├── server.js          # Express + WebSocket バックエンド
├── index.html         # ゲーム画面（2D UI + CSS）
├── game.js            # I18n + GameClient（フロントエンド）
├── admin.html         # 管理画面
├── initdb.js          # DB 初期化スクリプト
├── check-db.js        # DB 整合性確認スクリプト
├── package.json
├── env.example        # 環境変数テンプレート
├── .gitignore
├── CLAUDE.md          # Claude Code 向けプロジェクト設定
├── lang/
│   ├── ja.json        # 日本語 UI テキスト
│   └── en.json        # 英語 UI テキスト
└── docs/
    ├── SDD_Specification_v2_0_B_full.md        # 完全仕様書
    ├── project_prompt_v2_0_B.md                # プロジェクトプロンプト
    ├── v2_0_B_implementation_prompts_v1.1.md   # 実装プロンプト集
    └── v2_0_B_implementation_plan.md           # 実装プラン
```

---

## 🚀 セットアップ

### 必要環境

- Node.js 24 以上
- npm

### インストールと起動

```bash
# 1. 依存パッケージのインストール
npm install

# 2. 環境変数ファイルの作成
cp env.example .env
# .env を編集して ADMIN_USERNAME / ADMIN_PASSWORD を設定してください

# 3. データベースの初期化
npm run initdb

# 4. サーバー起動
npm start
```

起動後、`http://localhost:3000` でゲーム画面にアクセスできます。

### 開発時の起動（ファイル変更を自動検知）

```bash
npm run dev
```

### DB 整合性の確認

```bash
node check-db.js
```

---

## ⚙️ 環境変数

`.env` ファイルで以下を設定します（`env.example` を参考にしてください）。

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `PORT` | サーバーのポート番号 | `3000` |
| `ADMIN_USERNAME` | 管理画面のログイン名 | `admin` |
| `ADMIN_PASSWORD` | 管理画面のパスワード | `admin123` |
| `ADMIN_TOKEN_EXPIRY_HOURS` | 管理画面トークンの有効時間（時間） | `24` |
| `MAX_PLAYERS` | セッションあたりの最大プレイヤー数 | `4` |

> **注意**: `game.db` と `.env` は `.gitignore` に含まれています。  
> 本番環境では必ず `ADMIN_PASSWORD` を変更してください。

---

## 🗄 データベース

SQLite（`game.db`）に以下のテーブルが作成されます。

| テーブル | 役割 |
|---|---|
| `category_cards` | 職種カード（12種） |
| `skill_cards` | スキルカード（18種） |
| `missions` | ミッションカード（20種） |
| `skill_types` | スキル区分（テクニカル・ヒューマン・コンセプチュアル） |
| `mission_categories` | ミッション区分（企画系・運用系・対人系・分析系） |
| `category_skill_links` | 職種 ⇔ スキルの紐付け |
| `category_mission_links` | 職種 ⇔ ミッションの紐付け |
| `game_settings` | 配布比率などの設定値 |

進行中のゲームセッション（プレイヤー・ターン・ボード内容）は**サーバーメモリ上にのみ**保持されます。

---

## 🖥 管理画面

`http://localhost:3000/admin.html` で管理画面にアクセスできます。

- **ログイン**: `.env` で設定した `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- **タブ**: 職種カード / スキルカード / ミッションカード / 配布比率 / スキル区分 / ミッション区分
- **職種カード編集**: レシピ（紐づけるスキル・ミッションカードと必要枚数）を設定できます
- **配布比率**: サイコロで引く候補のスキル:ミッション比率を変更できます（デフォルト 70:30）
- **CSV インポート/エクスポート**: 各タブからカードデータを一括で読み書きできます

---

## 🌐 WebSocket メッセージ

### クライアント → サーバー

| メッセージ | 説明 |
|---|---|
| `createSession` | ルーム作成 |
| `joinSession` | ロビー参加 |
| `startGame` | ゲーム開始（ホストのみ） |
| `rollDice` | サイコロを振る |
| `selectCard` | 候補カードを選択 |
| `nextTurn` | ターン終了 |
| `resign` | 退出 |
| `resetGame` | リセット（ホストのみ） |
| `chatMessage` | チャット送信 |

### サーバー → クライアント

`sessionCreated` / `playerJoined` / `gameStarted` / `diceRolled` / `candidatesPresented` / `cardAcquired` / `categoryAchieved` / `turnAdvanced` / `playerLeft` / `gameEnded` / `chatMessage` / `error`

---

## 🐳 Docker での起動

### 前提

- Docker 24 以上
- Docker Compose Plugin（`docker compose` コマンド）

### 手順

```bash
# 1. 環境変数ファイルを作成・編集
cp env.example .env
# ADMIN_PASSWORD を必ず変更してください
vi .env

# 2. ビルドして起動
docker compose up -d

# 3. ログ確認
docker compose logs -f

# 4. 停止
docker compose down
```

起動後、`http://localhost:3000` でアクセスできます。

### DB の永続化

`game.db` は Docker Volume `db-data` に永続化されます。
コンテナが再起動してもデータは保持されます。

```bash
# DB を完全にリセットしたい場合
docker compose down -v
docker compose up -d
```

### 環境変数の上書き

`.env` の `PORT` を変えるとホスト側の公開ポートが変わります。

```bash
PORT=8080 docker compose up -d
# → http://localhost:8080 でアクセス可能
```

---

## ☁️ IBM Cloud VPC IaaS へのデプロイ

**Ubuntu 22.04 LTS の Virtual Server Instance (VSI)** を対象とした手順です。

### VPC Security Group の事前設定

IBM Cloud コンソールで、対象 VSI の Security Group に以下のインバウンドルールを追加してください。

| プロトコル | ポート | 用途 |
|---|---|---|
| TCP | 22 | SSH |
| TCP | 80 | HTTP（Nginx） |
| TCP | 443 | HTTPS（SSL 化後） |

### デプロイ手順

```bash
# 1. VSI に SSH でログイン
ssh root@<VSI-PUBLIC-IP>

# 2. リポジトリをクローン
git clone https://github.com/your-org/career-collection-game.git
cd career-collection-game

# 3. セットアップスクリプトを実行（Docker / Nginx / systemd を一括設定）
sudo bash deploy/setup.sh
```

スクリプトが初回に `.env` を生成して停止します。
`ADMIN_PASSWORD` を変更してから再実行してください。

```bash
vi /opt/career-collection-game/.env   # ADMIN_PASSWORD を変更
sudo bash deploy/setup.sh             # 再実行
```

### SSL 化（Let's Encrypt）

ドメインを取得した後：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

`deploy/nginx.conf` の `server_name _` をドメイン名に変更してから実行してください。

### 運用コマンド

```bash
# ログ確認
docker compose -f /opt/career-collection-game/docker-compose.yml logs -f

# アプリ再起動
sudo systemctl restart career-collection-game

# アプリ停止
sudo systemctl stop career-collection-game

# DB リセット（全データ消去）
cd /opt/career-collection-game
docker compose down -v && docker compose up -d
```

### deploy/ ディレクトリの構成

```
deploy/
├── setup.sh                       # 一括セットアップスクリプト
├── nginx.conf                     # Nginx リバースプロキシ設定
└── career-collection-game.service # systemd サービス定義
```

---

## 📝 ライセンス

[MIT License](LICENSE)
