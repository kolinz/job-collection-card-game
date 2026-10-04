# ---------------------------------------------------------------------------
# Dockerfile — career-collection-game v2.0-B
#
# multi-stage build:
#   builder : npm ci --omit=dev （devDependencies を除外）
#   runner  : 本番イメージ（node:24-slim ベース）
#
# SQLite の game.db は /data ボリュームにマウントして永続化する。
# 起動時に /data/game.db が存在しなければ自動で initdb を実行する。
# ---------------------------------------------------------------------------

# ---- stage 1: dependencies ----
FROM node:24-slim AS builder

WORKDIR /app

# ネイティブモジュール(better-sqlite3)のビルドに必要なツール
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# ---- stage 2: runner ----
FROM node:24-slim

WORKDIR /app

# ランタイムに必要な最小限の共有ライブラリ
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# 非 root ユーザーで実行
RUN groupadd --gid 1001 appgroup \
 && useradd  --uid 1001 --gid appgroup --shell /bin/sh --create-home appuser

# builder からビルド済み node_modules をコピー
COPY --from=builder /app/node_modules ./node_modules

# アプリケーションコードをコピー
COPY --chown=appuser:appgroup . .

# DB 永続化ディレクトリ（ホスト側ボリュームをここにマウントする）
RUN mkdir -p /data && chown appuser:appgroup /data

USER appuser

EXPOSE 3000

# 起動時に /data/game.db がなければ initdb を実行してから server を起動する
CMD ["sh", "-c", "\
  if [ ! -f /data/game.db ]; then \
    echo '[entrypoint] game.db not found — running initdb...' && \
    DB_PATH=/data/game.db node initdb.js && \
    echo '[entrypoint] initdb done'; \
  fi && \
  exec node server.js"]
