# CLAUDE.md

このファイルは、本リポジトリで Claude（またはClaude Code）に作業を依頼する際の
コンテキスト・注意事項をまとめたものです。

## プロジェクト概要

Role-Based Card Game Framework（職種コレクション版）v2.0-B。
キャリア教育・職業理解を目的としたオンラインマルチプレイヤーカード収集ゲーム。
v2.0（ボードゲーム版）とは並行する別ラインのゲームモードであり、置き換えではない。

正典（Source of Truth）:
- `SDD_Specification_v2.0_B_full.md`（全14章・完全版）
- `v2.0-B-implementation-prompts-full.md`（Phase 1〜12＋デバッグ補足）

## 技術スタック

- Node.js >=24 / Express / ws（WebSocket） / better-sqlite3 ^12.8.0
- フロントエンド: Vanilla JavaScript（フレームワーク不使用）
- 3D: 使用しない（Three.js/SceneManagerは本モードでは一切使わない）

## 開発時の重要ルール（TODO: 詳細化）

- [ ] better-sqlite3 はコールバック禁止。`.all() / .get() / .run()` の3パターンのみ、
      エラーハンドリングは同期 try/catch
- [ ] 進行中のゲームセッション状態はDBに保存せず、サーバーメモリ上に保持する
      （DBに永続化するのはカードマスタデータと game_settings のみ）
- [ ] `skill_cards.matchesCategories` は使用しない
      （職種との紐付けは `category_skill_links` / `category_mission_links` で行う）
- [ ] `skill_types.model_type` は `'katz'` 固定（Druckerモデルは実装しない）
- [ ] 職種カード充足判定は「閾値以上」であり「全部揃える」ではない
- [ ] カードは消費されない。「候補から選べなくする」と「ボードから削除する」を混同しない
- [ ] ID比較は `Number()` で型を統一する
- [ ] 3D関連ファイル・CDN依存を作らない
- [ ] i18n対応は必須。表示テキストは常に `i18n.currentLang` を直接参照する
      （キャッシュ変数 `this.language` は使わない）
- [ ] `render()` は `mode === 'game'` のイベント受信時に呼ばない
      （候補提示・カード獲得・職種達成・退出通知は該当DOM要素のみ直接更新する）

## ディレクトリ構成

```
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
```

## セットアップ（TODO: 実装完了後に更新）

```bash
npm install
cp .env.example .env
npm run initdb
npm start
```
