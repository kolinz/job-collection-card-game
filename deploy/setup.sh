#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy/setup.sh — IBM Cloud VPC IaaS (Ubuntu 22.04+) デプロイスクリプト
#
# 実行方法:
#   sudo bash deploy/setup.sh
#
# 前提:
#   - Ubuntu 22.04 LTS の新規 VSI（Virtual Server Instance）
#   - IBM Cloud VPC Security Group でポート 22 / 80 / 443 を開放済み
#   - このスクリプトはリポジトリルートから実行する
# ---------------------------------------------------------------------------

set -euo pipefail

APP_DIR=/opt/career-collection-game
NGINX_CONF=/etc/nginx/sites-available/career-collection-game
SERVICE_FILE=/etc/systemd/system/career-collection-game.service

echo "================================================================"
echo "  Career Collection Game — セットアップスクリプト"
echo "================================================================"

# ---- 1. Docker のインストール（未インストールの場合のみ） ----
if ! command -v docker &>/dev/null; then
  echo "[1/7] Docker をインストールします..."
  apt-get update -q
  apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  echo "[1/7] Docker インストール完了"
else
  echo "[1/7] Docker は既にインストール済みです（スキップ）"
fi

# ---- 2. Nginx のインストール（未インストールの場合のみ） ----
if ! command -v nginx &>/dev/null; then
  echo "[2/7] Nginx をインストールします..."
  apt-get update -q
  apt-get install -y --no-install-recommends nginx
  echo "[2/7] Nginx インストール完了"
else
  echo "[2/7] Nginx は既にインストール済みです（スキップ）"
fi

# ---- 3. アプリケーションファイルを配置 ----
echo "[3/7] アプリケーションを ${APP_DIR} に配置します..."
mkdir -p "${APP_DIR}"
# リポジトリルートから全ファイルをコピー（.git / node_modules を除く）
rsync -a --exclude='.git' --exclude='node_modules' --exclude='game.db' \
  "$(dirname "$(realpath "$0")")/../" "${APP_DIR}/"
echo "[3/7] 配置完了"

# ---- 4. 環境変数ファイルの準備 ----
echo "[4/7] 環境変数ファイルを確認します..."
if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/env.example" "${APP_DIR}/.env"
  echo ""
  echo "  ⚠️  ${APP_DIR}/.env を作成しました。"
  echo "  ⚠️  必ず ADMIN_PASSWORD を変更してから再実行してください。"
  echo ""
  echo "     vi ${APP_DIR}/.env"
  echo ""
  exit 1
else
  echo "[4/7] .env は既に存在します（スキップ）"
fi

# ---- 5. Docker イメージのビルドと起動 ----
echo "[5/7] Docker イメージをビルドして起動します..."
cd "${APP_DIR}"
docker compose pull --ignore-pull-failures 2>/dev/null || true
docker compose build --no-cache
docker compose up -d --remove-orphans
echo "[5/7] コンテナ起動完了"

# ---- 6. Nginx リバースプロキシを設定 ----
echo "[6/7] Nginx を設定します..."
cp "${APP_DIR}/deploy/nginx.conf" "${NGINX_CONF}"
# デフォルト設定を無効化
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi
# サイトを有効化
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/career-collection-game
nginx -t
systemctl reload nginx
echo "[6/7] Nginx 設定完了"

# ---- 7. systemd サービスを登録 ----
echo "[7/7] systemd サービスを登録します..."
cp "${APP_DIR}/deploy/career-collection-game.service" "${SERVICE_FILE}"
# WorkingDirectory をインストール先に書き換え
sed -i "s|WorkingDirectory=.*|WorkingDirectory=${APP_DIR}|" "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable career-collection-game
echo "[7/7] systemd サービス登録完了"

# ---- 完了メッセージ ----
echo ""
echo "================================================================"
echo "  ✅ セットアップが完了しました！"
echo ""
echo "  ゲーム画面:  http://$(hostname -I | awk '{print $1}')"
echo "  管理画面:    http://$(hostname -I | awk '{print $1}')/admin.html"
echo ""
echo "  ログ確認:    docker compose -f ${APP_DIR}/docker-compose.yml logs -f"
echo "  停止:        systemctl stop career-collection-game"
echo "  再起動:      systemctl restart career-collection-game"
echo ""
echo "  SSL 化 (Let's Encrypt):"
echo "    apt-get install -y certbot python3-certbot-nginx"
echo "    certbot --nginx -d <your-domain>"
echo "================================================================"
