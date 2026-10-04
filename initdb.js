/**
 * initdb.js
 * Role-Based Card Game Framework（職種コレクション版）v2.0-B
 *
 * game.db（better-sqlite3）の初期化スクリプト。
 * `npm run initdb` で実行する。
 *
 * 全8テーブル:
 *   skill_types / mission_categories / category_cards / skill_cards /
 *   missions / category_skill_links / category_mission_links / game_settings
 *
 * 注意:
 *   - skill_cards.matchesCategories（カンマ区切り紐付けカラム）は本モードでは使用しない。
 *     職種との紐付けは category_skill_links / category_mission_links で行う。
 *   - skill_types.model_type は 'katz' 固定（Druckerモデルは実装しない）。
 *   - 各 category_cards の required_skill_count / required_mission_count は、
 *     そのカードに紐付けたカード種類数を超えないように投入する（SDD 7.3節のバリデーションと
 *     矛盾しないため）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// DB_PATH 環境変数があればそちらを優先（Docker ボリュームマウント用）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'game.db');

// 既存の game.db があれば削除してから新規作成する（再実行可能にするため）
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// スキーマ定義（全8テーブル）
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE skill_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ja TEXT NOT NULL,
      name_en TEXT NOT NULL,
      model_type TEXT NOT NULL DEFAULT 'katz'
  );

  CREATE TABLE mission_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ja TEXT NOT NULL,
      name_en TEXT NOT NULL
  );

  CREATE TABLE category_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ja TEXT NOT NULL,
      name_en TEXT NOT NULL,
      required_skill_count INTEGER NOT NULL DEFAULT 1,
      required_mission_count INTEGER NOT NULL DEFAULT 1,
      description_ja TEXT
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
`);

// ---------------------------------------------------------------------------
// 初期データ
// ---------------------------------------------------------------------------

// --- skill_types（3件） ---
const skillTypes = [
  { name_ja: 'テクニカルスキル', name_en: 'Technical Skill' },
  { name_ja: 'ヒューマンスキル', name_en: 'Human Skill' },
  { name_ja: 'コンセプチュアルスキル', name_en: 'Conceptual Skill' },
];

// --- mission_categories（4件） ---
const missionCategories = [
  { name_ja: '企画系', name_en: 'Planning' },
  { name_ja: '運用系', name_en: 'Operations' },
  { name_ja: '対人系', name_en: 'Interpersonal' },
  { name_ja: '分析系', name_en: 'Analysis' },
];

// --- skill_cards（18件、各skill_typeに6件ずつ） ---
// skill_type_id: 1=テクニカル, 2=ヒューマン, 3=コンセプチュアル
const skillCards = [
  // テクニカルスキル
  { name_ja: 'プログラミング', name_en: 'Programming', skill_type_id: 1,
    description_ja: 'ソフトウェアを実装する力', description_en: 'Ability to implement software' },
  { name_ja: 'データベース設計', name_en: 'Database Design', skill_type_id: 1,
    description_ja: 'データ構造を設計する力', description_en: 'Ability to design data structures' },
  { name_ja: 'ネットワーク構築', name_en: 'Network Configuration', skill_type_id: 1,
    description_ja: 'ネットワークを構築・設定する力', description_en: 'Ability to build and configure networks' },
  { name_ja: 'クラウドインフラ管理', name_en: 'Cloud Infrastructure Management', skill_type_id: 1,
    description_ja: 'クラウド環境を管理・運用する力', description_en: 'Ability to manage cloud environments' },
  { name_ja: 'セキュリティ対策', name_en: 'Security Measures', skill_type_id: 1,
    description_ja: '情報セキュリティを守る力', description_en: 'Ability to protect information security' },
  { name_ja: 'UI/UX設計', name_en: 'UI/UX Design', skill_type_id: 1,
    description_ja: '使いやすい画面・体験を設計する力', description_en: 'Ability to design usable interfaces and experiences' },

  // ヒューマンスキル
  { name_ja: 'コミュニケーション', name_en: 'Communication', skill_type_id: 2,
    description_ja: '相手に伝え、理解し合う力', description_en: 'Ability to convey and understand ideas with others' },
  { name_ja: 'チームマネジメント', name_en: 'Team Management', skill_type_id: 2,
    description_ja: 'チームをまとめ動かす力', description_en: 'Ability to lead and coordinate a team' },
  { name_ja: '交渉力', name_en: 'Negotiation', skill_type_id: 2,
    description_ja: '利害を調整し合意を導く力', description_en: 'Ability to negotiate and reach agreement' },
  { name_ja: 'プレゼンテーション', name_en: 'Presentation', skill_type_id: 2,
    description_ja: '分かりやすく伝える力', description_en: 'Ability to present ideas clearly' },
  { name_ja: 'ファシリテーション', name_en: 'Facilitation', skill_type_id: 2,
    description_ja: '議論を促進しまとめる力', description_en: 'Ability to facilitate discussions' },
  { name_ja: 'カスタマーサポート', name_en: 'Customer Support', skill_type_id: 2,
    description_ja: '顧客対応を丁寧に行う力', description_en: 'Ability to support customers attentively' },

  // コンセプチュアルスキル
  { name_ja: '論理的思考', name_en: 'Logical Thinking', skill_type_id: 3,
    description_ja: '筋道立てて考える力', description_en: 'Ability to think logically' },
  { name_ja: '戦略立案', name_en: 'Strategic Planning', skill_type_id: 3,
    description_ja: '中長期の方針を描く力', description_en: 'Ability to design long-term strategy' },
  { name_ja: 'データ分析', name_en: 'Data Analysis', skill_type_id: 3,
    description_ja: 'データから示唆を導く力', description_en: 'Ability to draw insights from data' },
  { name_ja: '問題解決力', name_en: 'Problem Solving', skill_type_id: 3,
    description_ja: '課題の原因を特定し解決する力', description_en: 'Ability to identify and solve problems' },
  { name_ja: '業務プロセス設計', name_en: 'Business Process Design', skill_type_id: 3,
    description_ja: '業務の流れを設計・改善する力', description_en: 'Ability to design and improve business processes' },
  { name_ja: 'リスク管理', name_en: 'Risk Management', skill_type_id: 3,
    description_ja: 'リスクを予測し備える力', description_en: 'Ability to anticipate and manage risk' },
];

// --- missions（20件、各mission_categoryに5件ずつ） ---
// mission_category_id: 1=企画系, 2=運用系, 3=対人系, 4=分析系
const missions = [
  // 企画系
  { name_ja: '新規サービス企画書作成', name_en: 'Draft New Service Proposal', mission_category_id: 1,
    description_ja: '新しいサービスの企画書を作成する', description_en: 'Create a proposal for a new service', enabled: 1 },
  { name_ja: '予算計画の立案', name_en: 'Budget Planning', mission_category_id: 1,
    description_ja: '年度予算の計画を立てる', description_en: 'Plan the annual budget', enabled: 1 },
  { name_ja: 'マーケティング戦略立案', name_en: 'Marketing Strategy Planning', mission_category_id: 1,
    description_ja: 'マーケティング施策の戦略を立てる', description_en: 'Plan a marketing strategy', enabled: 1 },
  { name_ja: '商品ロードマップ作成', name_en: 'Product Roadmap Creation', mission_category_id: 1,
    description_ja: '商品開発のロードマップを作る', description_en: 'Create a product development roadmap', enabled: 1 },
  { name_ja: '事業計画のプレゼン', name_en: 'Business Plan Presentation', mission_category_id: 1,
    description_ja: '事業計画を経営陣にプレゼンする', description_en: 'Present a business plan to executives', enabled: 1 },

  // 運用系
  { name_ja: 'システム運用監視', name_en: 'System Operations Monitoring', mission_category_id: 2,
    description_ja: '稼働中システムを監視する', description_en: 'Monitor a live system', enabled: 1 },
  { name_ja: '障害対応訓練', name_en: 'Incident Response Drill', mission_category_id: 2,
    description_ja: '障害発生時の対応訓練を行う', description_en: 'Run an incident response drill', enabled: 1 },
  { name_ja: 'サーバー保守作業', name_en: 'Server Maintenance', mission_category_id: 2,
    description_ja: 'サーバーの定期保守を行う', description_en: 'Perform routine server maintenance', enabled: 1 },
  { name_ja: '業務マニュアル整備', name_en: 'Operations Manual Update', mission_category_id: 2,
    description_ja: '業務マニュアルを整備する', description_en: 'Update the operations manual', enabled: 1 },
  { name_ja: '定例レポート作成', name_en: 'Regular Report Creation', mission_category_id: 2,
    description_ja: '定例の運用レポートを作成する', description_en: 'Create a regular operations report', enabled: 1 },

  // 対人系
  { name_ja: 'クライアント折衝', name_en: 'Client Negotiation', mission_category_id: 3,
    description_ja: 'クライアントと条件を折衝する', description_en: 'Negotiate terms with a client', enabled: 1 },
  { name_ja: 'チームビルディング研修', name_en: 'Team Building Workshop', mission_category_id: 3,
    description_ja: 'チームビルディング研修を実施する', description_en: 'Run a team-building workshop', enabled: 1 },
  { name_ja: '顧客ヒアリング', name_en: 'Customer Interview', mission_category_id: 3,
    description_ja: '顧客のニーズをヒアリングする', description_en: 'Interview a customer about their needs', enabled: 1 },
  { name_ja: '社内研修の実施', name_en: 'Internal Training Session', mission_category_id: 3,
    description_ja: '社内向けの研修を実施する', description_en: 'Conduct an internal training session', enabled: 1 },
  { name_ja: 'トラブル対応の電話応対', name_en: 'Phone-based Troubleshooting', mission_category_id: 3,
    description_ja: '電話でトラブル対応を行う', description_en: 'Handle troubleshooting over the phone', enabled: 1 },

  // 分析系
  { name_ja: 'ユーザーデータ分析', name_en: 'User Data Analysis', mission_category_id: 4,
    description_ja: 'ユーザー行動データを分析する', description_en: 'Analyze user behavior data', enabled: 1 },
  { name_ja: '品質テスト計画立案', name_en: 'QA Test Plan Design', mission_category_id: 4,
    description_ja: '品質保証のテスト計画を立てる', description_en: 'Design a QA test plan', enabled: 1 },
  { name_ja: 'セキュリティ監査', name_en: 'Security Audit', mission_category_id: 4,
    description_ja: 'システムのセキュリティ監査を行う', description_en: 'Perform a security audit of a system', enabled: 1 },
  { name_ja: 'パフォーマンス改善分析', name_en: 'Performance Improvement Analysis', mission_category_id: 4,
    description_ja: 'システムの性能改善点を分析する', description_en: 'Analyze system performance for improvements', enabled: 1 },
  { name_ja: '市場調査レポート作成', name_en: 'Market Research Report', mission_category_id: 4,
    description_ja: '市場調査の結果をレポートにまとめる', description_en: 'Compile market research findings into a report', enabled: 1 },
];

// --- category_cards（12件） ---
// required_skill_count / required_mission_count は、下の linkDefs で紐付ける
// カード種類数を超えないように設定している。
const categoryCards = [
  { name_ja: 'Webエンジニア',         name_en: 'Web Engineer',            required_skill_count: 3, required_mission_count: 1,
    description_ja: 'Webアプリケーションの設計・実装・運用を担うエンジニアです。\nプログラミングやUI設計など技術スキルを活かして、サービスを形にする役割を担います。' },
  { name_ja: 'プロジェクトマネージャー', name_en: 'Project Manager',        required_skill_count: 2, required_mission_count: 2,
    description_ja: 'プロジェクトの計画・進行・完了を管理するリーダーです。\nスケジュール・予算・チームをまとめ、目標に向かって組織を動かします。' },
  { name_ja: 'コンサルタント',         name_en: 'Consultant',              required_skill_count: 3, required_mission_count: 2,
    description_ja: 'クライアントの課題を分析し、解決策を提案する専門家です。\n論理的思考と戦略立案力を武器に、組織の変革を支援します。' },
  { name_ja: 'データアナリスト',       name_en: 'Data Analyst',            required_skill_count: 2, required_mission_count: 2,
    description_ja: 'データを収集・分析し、ビジネス上の示唆を導き出す専門家です。\n数字から価値を見つけ、意思決定をサポートします。' },
  { name_ja: 'UXデザイナー',           name_en: 'UX Designer',             required_skill_count: 2, required_mission_count: 1,
    description_ja: 'ユーザーが使いやすい体験・画面を設計するデザイナーです。\nリサーチとプロトタイプを通じて、直感的なサービスを生み出します。' },
  { name_ja: 'ヘルプデスク',           name_en: 'Help Desk',               required_skill_count: 1, required_mission_count: 1,
    description_ja: '社内外のユーザーからの問い合わせに対応するサポート担当です。\n丁寧なコミュニケーションで、ユーザーの困りごとを解決します。' },
  { name_ja: 'QAエンジニア',           name_en: 'QA Engineer',             required_skill_count: 2, required_mission_count: 1,
    description_ja: 'ソフトウェアの品質を保証するテスト専門家です。\nバグを発見・報告し、リリース前の品質を高める役割を担います。' },
  { name_ja: 'インフラエンジニア',     name_en: 'Infrastructure Engineer', required_skill_count: 3, required_mission_count: 1,
    description_ja: 'サーバー・ネットワーク・クラウド基盤を構築・運用するエンジニアです。\nシステムの土台を支え、安定稼働を守ります。' },
  { name_ja: 'ネットワークエンジニア', name_en: 'Network Engineer',        required_skill_count: 2, required_mission_count: 1,
    description_ja: 'ネットワーク設備の設計・構築・運用を専門とするエンジニアです。\n通信インフラを整備し、セキュアな接続環境を維持します。' },
  { name_ja: 'プロダクトオーナー',     name_en: 'Product Owner',           required_skill_count: 3, required_mission_count: 1,
    description_ja: 'プロダクトのビジョンを定め、開発優先度を決定するリーダーです。\nユーザーとビジネスの橋渡し役として、価値あるプロダクトを育てます。' },
  { name_ja: 'セキュリティエンジニア', name_en: 'Security Engineer',       required_skill_count: 2, required_mission_count: 2,
    description_ja: 'システムのセキュリティ対策・監査を担当するエンジニアです。\n脅威から組織を守り、安全なIT環境を構築します。' },
  { name_ja: 'データベースエンジニア', name_en: 'Database Engineer',       required_skill_count: 2, required_mission_count: 1,
    description_ja: 'データベースの設計・構築・チューニングを行うエンジニアです。\nデータの信頼性とパフォーマンスを維持し、システムの核を担います。' },
];

// --- 職種カード ⇔ スキルカード / ミッションカードの紐付け ---
// skill_cards / missions の配列インデックス（1始まり = 挿入されるID）を指定。
// 各職種の紐付け数は、対応する required_skill_count / required_mission_count 以上になるようにしている。
const linkDefs = [
  { // 1: Webエンジニア
    skills: [1, 6, 13, 16],      // プログラミング / UI/UX設計 / 論理的思考 / 問題解決力
    missions: [6, 17],           // システム運用監視 / 品質テスト計画立案
  },
  { // 2: プロジェクトマネージャー
    skills: [7, 8, 14],          // コミュニケーション / チームマネジメント / 戦略立案
    missions: [2, 10, 12],       // 予算計画の立案 / 定例レポート作成 / チームビルディング研修
  },
  { // 3: コンサルタント
    skills: [9, 10, 13, 14],     // 交渉力 / プレゼンテーション / 論理的思考 / 戦略立案
    missions: [1, 11],           // 新規サービス企画書作成 / クライアント折衝
  },
  { // 4: データアナリスト
    skills: [2, 13, 15],         // データベース設計 / 論理的思考 / データ分析
    missions: [16, 19, 20],      // ユーザーデータ分析 / パフォーマンス改善分析 / 市場調査レポート作成
  },
  { // 5: UXデザイナー
    skills: [6, 7, 16],          // UI/UX設計 / コミュニケーション / 問題解決力
    missions: [4, 13],           // 商品ロードマップ作成 / 顧客ヒアリング
  },
  { // 6: ヘルプデスク
    skills: [7, 12],             // コミュニケーション / カスタマーサポート
    missions: [9, 15],           // 業務マニュアル整備 / トラブル対応の電話応対
  },
  { // 7: QAエンジニア
    skills: [1, 13, 16],         // プログラミング / 論理的思考 / 問題解決力
    missions: [7, 17],           // 障害対応訓練 / 品質テスト計画立案
  },
  { // 8: インフラエンジニア
    skills: [3, 4, 5, 16],       // ネットワーク構築 / クラウドインフラ管理 / セキュリティ対策 / 問題解決力
    missions: [6, 8],            // システム運用監視 / サーバー保守作業
  },
  { // 9: ネットワークエンジニア
    skills: [3, 5, 16],          // ネットワーク構築 / セキュリティ対策 / 問題解決力
    missions: [6, 18],           // システム運用監視 / セキュリティ監査
  },
  { // 10: プロダクトオーナー
    skills: [7, 11, 14, 17],     // コミュニケーション / ファシリテーション / 戦略立案 / 業務プロセス設計
    missions: [4, 5],            // 商品ロードマップ作成 / 事業計画のプレゼン
  },
  { // 11: セキュリティエンジニア
    skills: [3, 5, 18],          // ネットワーク構築 / セキュリティ対策 / リスク管理
    missions: [7, 18],           // 障害対応訓練 / セキュリティ監査
  },
  { // 12: データベースエンジニア
    skills: [2, 4, 13],          // データベース設計 / クラウドインフラ管理 / 論理的思考
    missions: [8, 16],           // サーバー保守作業 / ユーザーデータ分析
  },
];

// ---------------------------------------------------------------------------
// 投入前の自己検証（required_* count が紐付け数を超えていないか）
// ---------------------------------------------------------------------------
categoryCards.forEach((cat, idx) => {
  const def = linkDefs[idx];
  if (cat.required_skill_count > def.skills.length) {
    throw new Error(
      `Seed data error: "${cat.name_ja}" の required_skill_count(${cat.required_skill_count}) が ` +
      `紐付けスキル数(${def.skills.length})を超えています`
    );
  }
  if (cat.required_mission_count > def.missions.length) {
    throw new Error(
      `Seed data error: "${cat.name_ja}" の required_mission_count(${cat.required_mission_count}) が ` +
      `紐付けミッション数(${def.missions.length})を超えています`
    );
  }
});

// ---------------------------------------------------------------------------
// データ投入（トランザクション）
// ---------------------------------------------------------------------------

const insertSkillType = db.prepare(
  'INSERT INTO skill_types (name_ja, name_en, model_type) VALUES (?, ?, ?)'
);
const insertMissionCategory = db.prepare(
  'INSERT INTO mission_categories (name_ja, name_en) VALUES (?, ?)'
);
const insertCategoryCard = db.prepare(
  'INSERT INTO category_cards (name_ja, name_en, required_skill_count, required_mission_count, description_ja) VALUES (?, ?, ?, ?, ?)'
);
const insertSkillCard = db.prepare(
  'INSERT INTO skill_cards (name_ja, name_en, skill_type_id, description_ja, description_en) VALUES (?, ?, ?, ?, ?)'
);
const insertMission = db.prepare(
  'INSERT INTO missions (name_ja, name_en, mission_category_id, description_ja, description_en, enabled) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertCategorySkillLink = db.prepare(
  'INSERT INTO category_skill_links (category_id, skill_id) VALUES (?, ?)'
);
const insertCategoryMissionLink = db.prepare(
  'INSERT INTO category_mission_links (category_id, mission_id) VALUES (?, ?)'
);
const insertGameSetting = db.prepare(
  'INSERT INTO game_settings (key, value) VALUES (?, ?)'
);

const seedAll = db.transaction(() => {
  // skill_types
  for (const st of skillTypes) {
    insertSkillType.run(st.name_ja, st.name_en, 'katz');
  }

  // mission_categories
  for (const mc of missionCategories) {
    insertMissionCategory.run(mc.name_ja, mc.name_en);
  }

  // category_cards
  for (const cc of categoryCards) {
    insertCategoryCard.run(cc.name_ja, cc.name_en, cc.required_skill_count, cc.required_mission_count, cc.description_ja || null);
  }

  // skill_cards
  for (const sc of skillCards) {
    insertSkillCard.run(sc.name_ja, sc.name_en, sc.skill_type_id, sc.description_ja, sc.description_en);
  }

  // missions
  for (const m of missions) {
    insertMission.run(m.name_ja, m.name_en, m.mission_category_id, m.description_ja, m.description_en, m.enabled);
  }

  // category_skill_links / category_mission_links
  linkDefs.forEach((def, idx) => {
    const categoryId = idx + 1; // AUTOINCREMENT開始値は1、投入順=ID
    for (const skillId of def.skills) {
      insertCategorySkillLink.run(categoryId, skillId);
    }
    for (const missionId of def.missions) {
      insertCategoryMissionLink.run(categoryId, missionId);
    }
  });

  // game_settings
  insertGameSetting.run('skill_mission_ratio', '70:30');
});

seedAll();

// ---------------------------------------------------------------------------
// 完了メッセージ
// ---------------------------------------------------------------------------

const counts = {
  mission_categories: db.prepare('SELECT COUNT(*) AS c FROM mission_categories').get().c,
  category_cards: db.prepare('SELECT COUNT(*) AS c FROM category_cards').get().c,
  skill_types: db.prepare('SELECT COUNT(*) AS c FROM skill_types').get().c,
  skill_cards: db.prepare('SELECT COUNT(*) AS c FROM skill_cards').get().c,
  missions: db.prepare('SELECT COUNT(*) AS c FROM missions').get().c,
  category_skill_links: db.prepare('SELECT COUNT(*) AS c FROM category_skill_links').get().c,
  category_mission_links: db.prepare('SELECT COUNT(*) AS c FROM category_mission_links').get().c,
  game_settings: db.prepare('SELECT COUNT(*) AS c FROM game_settings').get().c,
};

console.log('Database initialized successfully!');
console.log(
  `Tables: mission_categories(${counts.mission_categories}), ` +
  `category_cards(${counts.category_cards}), ` +
  `skill_types(${counts.skill_types}), ` +
  `skill_cards(${counts.skill_cards}), ` +
  `missions(${counts.missions}), ` +
  `category_skill_links(${counts.category_skill_links}), ` +
  `category_mission_links(${counts.category_mission_links}), ` +
  `game_settings(${counts.game_settings})`
);

db.close();
