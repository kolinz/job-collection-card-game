/**
 * check-db.js
 * Role-Based Card Game Framework（職種コレクション版）v2.0-B
 *
 * game.db の内容を確認するデバッグ用スクリプト。
 * 各テーブルの件数・category_cards の整合性チェック・game_settings の表示を行う。
 *
 * 使い方: node check-db.js
 *
 * 不整合がある場合は process.exit(1) で終了する。
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'game.db');
const db = new Database(DB_PATH, { readonly: true });

let hasError = false;

// ---------------------------------------------------------------------------
// 1. 各テーブルのレコード件数確認
// ---------------------------------------------------------------------------
const tables = [
  'skill_types',
  'mission_categories',
  'category_cards',
  'skill_cards',
  'missions',
  'category_skill_links',
  'category_mission_links',
  'game_settings',
];

console.log('=== テーブル件数 ===');
for (const t of tables) {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
  console.log(`  ${t}: ${c} 件`);
}

// ---------------------------------------------------------------------------
// 2. category_cards の全レコード表示
// ---------------------------------------------------------------------------
console.log('\n=== category_cards ===');
const cats = db.prepare(
  'SELECT id, name_ja, required_skill_count, required_mission_count FROM category_cards ORDER BY id'
).all();
for (const cat of cats) {
  console.log(
    `  [${cat.id}] ${cat.name_ja}  ` +
    `required_skill=${cat.required_skill_count}, required_mission=${cat.required_mission_count}`
  );
}

// ---------------------------------------------------------------------------
// 3. 各職種カードの紐付け件数と閾値の整合性チェック
// ---------------------------------------------------------------------------
console.log('\n=== 紐付け整合性チェック ===');
for (const cat of cats) {
  const { skillCount } = db.prepare(
    'SELECT COUNT(*) AS skillCount FROM category_skill_links WHERE category_id = ?'
  ).get(cat.id);
  const { missionCount } = db.prepare(
    'SELECT COUNT(*) AS missionCount FROM category_mission_links WHERE category_id = ?'
  ).get(cat.id);

  const skillOk = cat.required_skill_count <= skillCount;
  const missionOk = cat.required_mission_count <= missionCount;

  const mark = skillOk && missionOk ? '✓' : '✗';
  console.log(
    `  ${mark} [${cat.id}] ${cat.name_ja}` +
    `  skill: ${cat.required_skill_count}/${skillCount}` +
    `  mission: ${cat.required_mission_count}/${missionCount}`
  );

  if (!skillOk) {
    console.error(
      `    ERROR: required_skill_count(${cat.required_skill_count}) > 紐付けスキル数(${skillCount})`
    );
    hasError = true;
  }
  if (!missionOk) {
    console.error(
      `    ERROR: required_mission_count(${cat.required_mission_count}) > 紐付けミッション数(${missionCount})`
    );
    hasError = true;
  }
}

// ---------------------------------------------------------------------------
// 4. game_settings の表示・形式チェック
// ---------------------------------------------------------------------------
console.log('\n=== game_settings ===');
const settings = db.prepare('SELECT key, value FROM game_settings').all();
for (const s of settings) {
  console.log(`  ${s.key} = ${s.value}`);
  if (s.key === 'skill_mission_ratio') {
    const parts = s.value.split(':');
    if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
      const total = Number(parts[0]) + Number(parts[1]);
      if (total !== 100) {
        console.error(`    ERROR: skill_mission_ratio の合計が100ではありません (${total})`);
        hasError = true;
      } else {
        console.log(`    → スキル:${parts[0]}%  ミッション:${parts[1]}%  合計:${total}% ✓`);
      }
    } else {
      console.error(`    ERROR: skill_mission_ratio の形式が "N:N" ではありません`);
      hasError = true;
    }
  }
}

db.close();

if (hasError) {
  console.error('\n[FAILED] 不整合が検出されました。');
  process.exit(1);
} else {
  console.log('\n[OK] DB check complete.');
}
