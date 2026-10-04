/**
 * server.js
 * Role-Based Card Game Framework（職種コレクション版）v2.0-B
 *
 * Express + ws によるバックエンド。
 * ゲームセッション状態はサーバーメモリ上のオブジェクトとして保持する。
 * DBに永続化するのはカードマスタデータと game_settings のみ。
 * 3D（Three.js/SceneManager）は使用しない。
 */

'use strict';

require('dotenv').config();

const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const PORT         = parseInt(process.env.PORT || '3000', 10);
const ADMIN_USER   = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'admin123';
const TOKEN_EXPIRY = parseInt(process.env.ADMIN_TOKEN_EXPIRY_HOURS || '24', 10) * 60 * 60 * 1000;
const MAX_PLAYERS  = parseInt(process.env.MAX_PLAYERS || '4', 10);

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
// DB_PATH 環境変数があればそちらを優先（Docker ボリュームマウント用）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'game.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.text({ type: 'text/csv' }));
app.use(express.static(__dirname));         // index.html / game.js / admin.html

// /join/:sessionId は SPA のフロントエンドでハンドリングするため index.html を返す
app.get('/join/:sessionId', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------------------
// 管理画面認証（UUID Bearer token方式）
// ---------------------------------------------------------------------------
const adminTokens = new Map(); // token → expiresAtMillis

function issueToken() {
  const token = uuidv4();
  adminTokens.set(token, Date.now() + TOKEN_EXPIRY);
  return token;
}

function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const expiresAt = token && adminTokens.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) adminTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  next();
}

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ ok: true, token: issueToken() });
  }
  res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
});

// ---------------------------------------------------------------------------
// REST API — 読み取り系
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/cards/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM category_cards ORDER BY id').all();
  res.json(rows);
});

app.get('/api/cards/skills', (_req, res) => {
  const rows = db.prepare('SELECT * FROM skill_cards ORDER BY id').all();
  res.json(rows);
});

app.get('/api/cards/missions', (_req, res) => {
  const rows = db.prepare('SELECT * FROM missions WHERE enabled=1 ORDER BY id').all();
  res.json(rows);
});

app.get('/api/cards/skill-types', (_req, res) => {
  const rows = db.prepare('SELECT * FROM skill_types ORDER BY id').all();
  res.json(rows);
});

app.get('/api/cards/mission-categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM mission_categories ORDER BY id').all();
  res.json(rows);
});

// GET /api/cards/category-recipes
// 各職種カードに linkedSkillIds / linkedMissionIds を付けて返す
app.get('/api/cards/category-recipes', (_req, res) => {
  const cats = db.prepare('SELECT * FROM category_cards ORDER BY id').all();
  const skillLinks    = db.prepare('SELECT category_id, skill_id   FROM category_skill_links').all();
  const missionLinks  = db.prepare('SELECT category_id, mission_id FROM category_mission_links').all();

  const skillMap   = {};
  const missionMap = {};
  for (const r of skillLinks)   (skillMap[r.category_id]   ||= []).push(r.skill_id);
  for (const r of missionLinks) (missionMap[r.category_id] ||= []).push(r.mission_id);

  const result = cats.map(c => ({
    ...c,
    linkedSkillIds:   skillMap[c.id]   || [],
    linkedMissionIds: missionMap[c.id] || [],
  }));
  res.json(result);
});

app.get('/api/settings/distribution', (_req, res) => {
  const row = db.prepare("SELECT value FROM game_settings WHERE key='skill_mission_ratio'").get();
  if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  const [s, m] = row.value.split(':').map(Number);
  res.json({ skillRatio: s, missionRatio: m });
});

app.get('/api/lang/:lang', (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'ja';
  const filePath = path.join(__dirname, 'lang', `${lang}.json`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    res.type('application/json').send(data);
  } catch {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  }
});

// ---------------------------------------------------------------------------
// REST API — 管理用 CRUD
// ---------------------------------------------------------------------------

// ---- 職種カード ----
app.get('/api/admin/categories', requireAdminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM category_cards ORDER BY id').all());
});

app.post('/api/admin/categories', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, description_ja = null } = req.body;
  const r = db.prepare(
    'INSERT INTO category_cards (name_ja, name_en, required_skill_count, required_mission_count, description_ja) VALUES (?,?,1,1,?)'
  ).run(name_ja, name_en, description_ja);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/admin/categories/:id', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, description_ja = null } = req.body;
  db.prepare('UPDATE category_cards SET name_ja=?, name_en=?, description_ja=? WHERE id=?').run(name_ja, name_en, description_ja, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/categories/:id', requireAdminAuth, (req, res) => {
  db.prepare('DELETE FROM category_skill_links WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM category_mission_links WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM category_cards WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/admin/categories/:id/recipe
app.put('/api/admin/categories/:id/recipe', requireAdminAuth, (req, res) => {
  const catId = Number(req.params.id);
  const { skillIds, missionIds, requiredSkillCount, requiredMissionCount } = req.body;

  const rsc = Number(requiredSkillCount);
  const rmc = Number(requiredMissionCount);

  if (rsc < 1 || rmc < 1) {
    return res.status(400).json({ ok: false, error: 'required_count must be >= 1' });
  }
  if (rsc > skillIds.length) {
    return res.status(400).json({ ok: false, error: `required_skill_count(${rsc}) > linkedSkills(${skillIds.length})` });
  }
  if (rmc > missionIds.length) {
    return res.status(400).json({ ok: false, error: `required_mission_count(${rmc}) > linkedMissions(${missionIds.length})` });
  }

  const update = db.transaction(() => {
    db.prepare('UPDATE category_cards SET required_skill_count=?, required_mission_count=? WHERE id=?').run(rsc, rmc, catId);
    db.prepare('DELETE FROM category_skill_links WHERE category_id=?').run(catId);
    db.prepare('DELETE FROM category_mission_links WHERE category_id=?').run(catId);
    const insSkill = db.prepare('INSERT INTO category_skill_links (category_id, skill_id) VALUES (?,?)');
    for (const sid of skillIds) insSkill.run(catId, Number(sid));
    const insMission = db.prepare('INSERT INTO category_mission_links (category_id, mission_id) VALUES (?,?)');
    for (const mid of missionIds) insMission.run(catId, Number(mid));
  });
  update();
  res.json({ ok: true });
});

// ---- スキルカード ----
app.get('/api/admin/skills', requireAdminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM skill_cards ORDER BY id').all());
});

app.post('/api/admin/skills', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, skill_type_id, description_ja, description_en } = req.body;
  const r = db.prepare(
    'INSERT INTO skill_cards (name_ja, name_en, skill_type_id, description_ja, description_en) VALUES (?,?,?,?,?)'
  ).run(name_ja, name_en, Number(skill_type_id), description_ja || null, description_en || null);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/admin/skills/:id', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, skill_type_id, description_ja, description_en } = req.body;
  db.prepare(
    'UPDATE skill_cards SET name_ja=?, name_en=?, skill_type_id=?, description_ja=?, description_en=? WHERE id=?'
  ).run(name_ja, name_en, Number(skill_type_id), description_ja || null, description_en || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/skills/:id', requireAdminAuth, (req, res) => {
  db.prepare('DELETE FROM category_skill_links WHERE skill_id=?').run(req.params.id);
  db.prepare('DELETE FROM skill_cards WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- ミッションカード ----
app.get('/api/admin/missions', requireAdminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM missions ORDER BY id').all());
});

app.post('/api/admin/missions', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, mission_category_id, description_ja, description_en, enabled } = req.body;
  const r = db.prepare(
    'INSERT INTO missions (name_ja, name_en, mission_category_id, description_ja, description_en, enabled) VALUES (?,?,?,?,?,?)'
  ).run(name_ja, name_en, Number(mission_category_id), description_ja || null, description_en || null, enabled == null ? 1 : Number(enabled));
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/admin/missions/:id', requireAdminAuth, (req, res) => {
  const { name_ja, name_en, mission_category_id, description_ja, description_en, enabled } = req.body;
  db.prepare(
    'UPDATE missions SET name_ja=?, name_en=?, mission_category_id=?, description_ja=?, description_en=?, enabled=? WHERE id=?'
  ).run(name_ja, name_en, Number(mission_category_id), description_ja || null, description_en || null, Number(enabled), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/missions/:id', requireAdminAuth, (req, res) => {
  db.prepare('DELETE FROM category_mission_links WHERE mission_id=?').run(req.params.id);
  db.prepare('DELETE FROM missions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- スキル区分 ----
app.get('/api/admin/skill-types', requireAdminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM skill_types ORDER BY id').all());
});

app.post('/api/admin/skill-types', requireAdminAuth, (req, res) => {
  const { name_ja, name_en } = req.body;
  const r = db.prepare("INSERT INTO skill_types (name_ja, name_en, model_type) VALUES (?,?,'katz')").run(name_ja, name_en);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/admin/skill-types/:id', requireAdminAuth, (req, res) => {
  const { name_ja, name_en } = req.body;
  db.prepare('UPDATE skill_types SET name_ja=?, name_en=? WHERE id=?').run(name_ja, name_en, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/skill-types/:id', requireAdminAuth, (req, res) => {
  db.prepare('DELETE FROM skill_types WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- ミッション区分 ----
app.get('/api/admin/mission-categories', requireAdminAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM mission_categories ORDER BY id').all());
});

app.post('/api/admin/mission-categories', requireAdminAuth, (req, res) => {
  const { name_ja, name_en } = req.body;
  const r = db.prepare('INSERT INTO mission_categories (name_ja, name_en) VALUES (?,?)').run(name_ja, name_en);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/admin/mission-categories/:id', requireAdminAuth, (req, res) => {
  const { name_ja, name_en } = req.body;
  db.prepare('UPDATE mission_categories SET name_ja=?, name_en=? WHERE id=?').run(name_ja, name_en, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/mission-categories/:id', requireAdminAuth, (req, res) => {
  db.prepare('DELETE FROM mission_categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- 配布比率 ----
app.put('/api/admin/settings/distribution', requireAdminAuth, (req, res) => {
  const { skillRatio, missionRatio } = req.body;
  const s = Number(skillRatio);
  const m = Number(missionRatio);
  if (isNaN(s) || isNaN(m) || s + m !== 100) {
    return res.status(400).json({ ok: false, error: 'ratios must sum to 100' });
  }
  db.prepare("INSERT OR REPLACE INTO game_settings (key, value) VALUES ('skill_mission_ratio', ?)").run(`${s}:${m}`);
  res.json({ ok: true });
});

// ---- CSV インポート ----
const CSV_HEADERS = {
  categories:  ['id', 'name_ja', 'name_en', 'required_skill_count', 'required_mission_count'],
  skills:      ['id', 'name_ja', 'name_en', 'skill_type_id', 'description_ja', 'description_en'],
  missions:    ['id', 'name_ja', 'name_en', 'mission_category_id', 'description_ja', 'description_en', 'enabled'],
  'skill-types': ['id', 'name_ja', 'name_en', 'model_type'],
};

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const headers = lines[0].split(',').map(h => h.trim());
  return { headers, rows: lines.slice(1).map(l => l.split(',').map(c => c.trim())) };
}

app.post('/api/admin/import/:type', requireAdminAuth, (req, res) => {
  const type = req.params.type;
  if (!CSV_HEADERS[type]) return res.status(400).json({ ok: false, error: 'unknown type' });

  const { headers, rows } = parseCsv(req.body);
  const expected = CSV_HEADERS[type];

  // ヘッダーチェック
  for (const h of expected) {
    if (!headers.includes(h)) {
      return res.status(400).json({ ok: false, error: `missing column: ${h}` });
    }
  }

  const col = (row, name) => row[headers.indexOf(name)] ?? '';

  // 全行バリデーション
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    if (type === 'skills') {
      if (!col(row, 'name_ja') || !col(row, 'name_en') || isNaN(Number(col(row, 'skill_type_id')))) {
        return res.status(400).json({ ok: false, error: `line ${lineNum}: invalid data` });
      }
    } else if (type === 'missions') {
      if (!col(row, 'name_ja') || !col(row, 'name_en') || isNaN(Number(col(row, 'mission_category_id')))) {
        return res.status(400).json({ ok: false, error: `line ${lineNum}: invalid data` });
      }
    } else if (type === 'categories') {
      if (!col(row, 'name_ja') || !col(row, 'name_en')) {
        return res.status(400).json({ ok: false, error: `line ${lineNum}: missing name` });
      }
    }
  }

  let inserted = 0;
  let updated = 0;

  const doImport = db.transaction(() => {
    for (const row of rows) {
      const id = col(row, 'id') ? Number(col(row, 'id')) : null;
      const existing = id ? db.prepare(`SELECT id FROM ${typeToTable(type)} WHERE id=?`).get(id) : null;

      if (existing) {
        // UPDATE
        if (type === 'categories') {
          db.prepare('UPDATE category_cards SET name_ja=?, name_en=? WHERE id=?').run(
            col(row, 'name_ja'), col(row, 'name_en'), id
          );
        } else if (type === 'skills') {
          db.prepare('UPDATE skill_cards SET name_ja=?, name_en=?, skill_type_id=?, description_ja=?, description_en=? WHERE id=?').run(
            col(row, 'name_ja'), col(row, 'name_en'), Number(col(row, 'skill_type_id')),
            col(row, 'description_ja') || null, col(row, 'description_en') || null, id
          );
        } else if (type === 'missions') {
          db.prepare('UPDATE missions SET name_ja=?, name_en=?, mission_category_id=?, description_ja=?, description_en=?, enabled=? WHERE id=?').run(
            col(row, 'name_ja'), col(row, 'name_en'), Number(col(row, 'mission_category_id')),
            col(row, 'description_ja') || null, col(row, 'description_en') || null,
            col(row, 'enabled') !== '' ? Number(col(row, 'enabled')) : 1, id
          );
        } else if (type === 'skill-types') {
          db.prepare("UPDATE skill_types SET name_ja=?, name_en=? WHERE id=?").run(
            col(row, 'name_ja'), col(row, 'name_en'), id
          );
        }
        updated++;
      } else {
        // INSERT
        if (type === 'categories') {
          db.prepare('INSERT INTO category_cards (name_ja, name_en, required_skill_count, required_mission_count) VALUES (?,?,1,1)').run(
            col(row, 'name_ja'), col(row, 'name_en')
          );
        } else if (type === 'skills') {
          db.prepare('INSERT INTO skill_cards (name_ja, name_en, skill_type_id, description_ja, description_en) VALUES (?,?,?,?,?)').run(
            col(row, 'name_ja'), col(row, 'name_en'), Number(col(row, 'skill_type_id')),
            col(row, 'description_ja') || null, col(row, 'description_en') || null
          );
        } else if (type === 'missions') {
          db.prepare('INSERT INTO missions (name_ja, name_en, mission_category_id, description_ja, description_en, enabled) VALUES (?,?,?,?,?,?)').run(
            col(row, 'name_ja'), col(row, 'name_en'), Number(col(row, 'mission_category_id')),
            col(row, 'description_ja') || null, col(row, 'description_en') || null,
            col(row, 'enabled') !== '' ? Number(col(row, 'enabled')) : 1
          );
        } else if (type === 'skill-types') {
          db.prepare("INSERT INTO skill_types (name_ja, name_en, model_type) VALUES (?,?,'katz')").run(
            col(row, 'name_ja'), col(row, 'name_en')
          );
        }
        inserted++;
      }
    }
  });
  doImport();
  res.json({ ok: true, inserted, updated });
});

function typeToTable(type) {
  const map = { categories: 'category_cards', skills: 'skill_cards', missions: 'missions', 'skill-types': 'skill_types' };
  return map[type];
}

// ---------------------------------------------------------------------------
// ゲームセッション管理（サーバーメモリ）
// ---------------------------------------------------------------------------
const sessions = new Map();     // sessionId → session
const wsToPlayer = new Map();   // ws → { sessionId, playerId }

function generateSessionId() {
  return uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function broadcast(session, msg) {
  const raw = JSON.stringify(msg);
  for (const p of session.players) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(raw);
  }
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function sendError(ws, code) {
  sendTo(ws, { type: 'error', payload: { code } });
}

// ---------------------------------------------------------------------------
// マスタデータ読み込み（メモリキャッシュ）
// ---------------------------------------------------------------------------
function getAllSkillCards() {
  return db.prepare('SELECT * FROM skill_cards ORDER BY id').all();
}
function getAllMissionCards() {
  return db.prepare('SELECT * FROM missions WHERE enabled=1 ORDER BY id').all();
}
function getAllCategoriesWithRecipes() {
  const cats = db.prepare('SELECT * FROM category_cards ORDER BY id').all();
  const sl = db.prepare('SELECT category_id, skill_id FROM category_skill_links').all();
  const ml = db.prepare('SELECT category_id, mission_id FROM category_mission_links').all();
  const sm = {}, mm = {};
  for (const r of sl) (sm[r.category_id] ||= []).push(r.skill_id);
  for (const r of ml) (mm[r.category_id] ||= []).push(r.mission_id);
  return cats.map(c => ({
    ...c,
    linkedSkillIds:   sm[c.id] || [],
    linkedMissionIds: mm[c.id] || [],
  }));
}
function getSkillMissionRatio() {
  const row = db.prepare("SELECT value FROM game_settings WHERE key='skill_mission_ratio'").get();
  const [s, m] = (row ? row.value : '70:30').split(':').map(Number);
  return { skill: s / 100, mission: m / 100 };
}

// ---------------------------------------------------------------------------
// WebSocketサーバー
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const { type, payload = {} } = msg;
    const ctx = wsToPlayer.get(ws);

    switch (type) {
      case 'createSession':  handleCreateSession(ws, payload); break;
      case 'joinSession':    handleJoinSession(ws, payload);   break;
      case 'startGame':      if (ctx) handleStartGame(ws, ctx);    break;
      case 'rollDice':       if (ctx) handleRollDice(ws, ctx);     break;
      case 'selectCard':     if (ctx) handleSelectCard(ws, ctx, payload); break;
      case 'nextTurn':       if (ctx) handleNextTurn(ws, ctx);    break;
      case 'resign':         handleResign(ws, ctx);            break;
      case 'resetGame':      if (ctx) handleResetGame(ws, ctx);   break;
      case 'chatMessage':    if (ctx) handleChatMessage(ws, ctx, payload); break;
    }
  });

  ws.on('close', () => {
    const ctx = wsToPlayer.get(ws);
    if (ctx) {
      handleResign(ws, ctx);
      wsToPlayer.delete(ws);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4: ルーム・ロビー・退出・チャット
// ---------------------------------------------------------------------------

function handleCreateSession(ws, data) {
  const { playerName, colorId, maxPlayers, turnsPerPlayer } = data;
  const max = Math.min(Math.max(Number(maxPlayers) || 2, 2), Math.min(MAX_PLAYERS, 4));
  const tpp = Math.max(Number(turnsPerPlayer) || 5, 1);
  const sessionId = generateSessionId();
  const playerId  = uuidv4();

  const player = makePlayer(playerId, playerName, Number(colorId), ws);
  const session = {
    id: sessionId,
    hostPlayerId: playerId,
    players: [player],
    maxPlayers: max,
    turnsPerPlayer: tpp,
    currentTurnIndex: 0,
    totalTurnsElapsed: 0,
    totalTurns: 0,
    status: 'lobby',
    chatLog: [],
    currentCandidates: null, // { playerId, cards: [] }
  };

  sessions.set(sessionId, session);
  wsToPlayer.set(ws, { sessionId, playerId });

  const inviteUrl = `/join/${sessionId}`;
  sendTo(ws, { type: 'sessionCreated', payload: { sessionId, inviteUrl, player: sanitizePlayer(player) } });
}

function handleJoinSession(ws, data) {
  const { sessionId, playerName, colorId } = data;
  const session = getSession(sessionId);
  if (!session) return sendError(ws, 'SESSION_NOT_FOUND');

  if (session.status !== 'lobby') return sendError(ws, 'MID_GAME_JOIN_NOT_ALLOWED');
  if (session.players.length >= session.maxPlayers) return sendError(ws, 'SESSION_FULL');

  const usedColors = session.players.map(p => p.colorId);
  if (usedColors.includes(Number(colorId))) return sendError(ws, 'COLOR_TAKEN');

  const playerId = uuidv4();
  const player   = makePlayer(playerId, playerName, Number(colorId), ws);
  session.players.push(player);
  wsToPlayer.set(ws, { sessionId, playerId });

  broadcast(session, { type: 'playerJoined', payload: { player: sanitizePlayer(player), players: session.players.map(sanitizePlayer) } });
}

function handleStartGame(ws, { sessionId, playerId }) {
  const session = getSession(sessionId);
  if (!session) return;
  if (session.hostPlayerId !== playerId) return sendError(ws, 'NOT_HOST');
  if (session.players.length < 2) return sendError(ws, 'NOT_ENOUGH_PLAYERS');

  session.status = 'in_progress';
  session.totalTurns = session.players.length * session.turnsPerPlayer;
  session.currentTurnIndex = 0;
  session.totalTurnsElapsed = 0;

  const turnOrder = session.players.map(p => p.id);
  broadcast(session, {
    type: 'gameStarted',
    payload: {
      turnOrder,
      totalTurns: session.totalTurns,
      currentPlayerId: session.players[0].id,
      turnNumber: 1,
    },
  });
}

function handleResign(ws, ctx) {
  if (!ctx) return;
  const { sessionId, playerId } = ctx;
  const session = getSession(sessionId);
  if (!session) return;

  wsToPlayer.delete(ws);

  if (session.status === 'lobby') {
    session.players = session.players.filter(p => p.id !== playerId);
    // ホストが退出した場合は別のプレイヤーにホスト権限を移す
    if (session.hostPlayerId === playerId && session.players.length > 0) {
      session.hostPlayerId = session.players[0].id;
    }
    broadcast(session, { type: 'playerLeft', payload: { playerId, phase: 'lobby', players: session.players.map(sanitizePlayer) } });
    if (session.players.length === 0) sessions.delete(sessionId);
  } else {
    const player = session.players.find(p => p.id === playerId);
    if (player) player.status = 'left';
    broadcast(session, { type: 'playerLeft', payload: { playerId, phase: 'game' } });

    // 全員退出でゲーム終了
    if (session.players.every(p => p.status === 'left')) {
      session.status = 'finished';
      sessions.delete(sessionId);
    } else if (session.status === 'in_progress') {
      // 手番が退出プレイヤーなら自動的に次へ
      const currentPlayer = session.players[session.currentTurnIndex % session.players.length];
      if (currentPlayer && currentPlayer.id === playerId) {
        advanceTurn(session);
      }
    }
  }
}

function handleChatMessage(ws, { sessionId, playerId }, { text }) {
  const session = getSession(sessionId);
  if (!session) return;
  const player = session.players.find(p => p.id === playerId);
  if (!player) return;

  const msg = { playerId, playerName: player.name, text: String(text).slice(0, 500), sentAt: Date.now() };
  session.chatLog.push(msg);
  broadcast(session, { type: 'chatMessage', payload: msg });
}

// ---------------------------------------------------------------------------
// Phase 5: ゲームループ・職種判定
// ---------------------------------------------------------------------------

function handleRollDice(ws, { sessionId, playerId }) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'in_progress') return;

  const currentPlayer = getCurrentPlayer(session);
  if (!currentPlayer || currentPlayer.id !== playerId) return;
  if (session.currentCandidates) return; // 既に候補提示済み

  const diceValue = Math.floor(Math.random() * 6) + 1;
  broadcast(session, { type: 'diceRolled', payload: { playerId, diceValue } });

  const candidates = drawCandidates(session, currentPlayer, diceValue);
  session.currentCandidates = { playerId, cards: candidates };

  sendTo(ws, { type: 'candidatesPresented', payload: { candidates } });
}

function handleSelectCard(ws, { sessionId, playerId }, { candidateCardId }) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'in_progress') return;

  const currentPlayer = getCurrentPlayer(session);
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  const cands = session.currentCandidates;
  if (!cands || cands.playerId !== playerId) return sendError(ws, 'INVALID_CANDIDATE_SELECTION');

  const card = cands.cards.find(c => c.id === Number(candidateCardId));
  if (!card) return sendError(ws, 'INVALID_CANDIDATE_SELECTION');

  const ownedSet = card.cardType === 'skill' ? currentPlayer.board.skillIds : currentPlayer.board.missionIds;
  if (ownedSet.has(Number(card.id))) return sendError(ws, 'INVALID_CANDIDATE_SELECTION');

  // カードをボードに追加
  ownedSet.add(Number(card.id));
  if (card.cardType === 'skill') {
    currentPlayer.seenSkillIds.add(Number(card.id));
  } else {
    currentPlayer.seenMissionIds.add(Number(card.id));
  }

  session.currentCandidates = null;

  broadcast(session, { type: 'cardAcquired', payload: { playerId, card, cardType: card.cardType } });

  // 職種カード充足判定
  const newlyAchieved = checkCategoryAchievements(currentPlayer);
  for (const categoryId of newlyAchieved) {
    broadcast(session, { type: 'categoryAchieved', payload: { playerId, categoryId } });
  }
}

function handleNextTurn(ws, { sessionId, playerId }) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'in_progress') return;

  const currentPlayer = getCurrentPlayer(session);
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  advanceTurn(session);
}

function advanceTurn(session) {
  session.totalTurnsElapsed++;
  session.currentCandidates = null;

  // アクティブなプレイヤー数でゲーム終了判定
  const activePlayers = session.players.filter(p => p.status === 'active');
  if (activePlayers.length === 0 || session.totalTurnsElapsed >= session.totalTurns) {
    endGame(session);
    return;
  }

  // 次の手番を決定（left プレイヤーをスキップ）
  let next = (session.currentTurnIndex + 1) % session.players.length;
  let safety = 0;
  while (session.players[next].status === 'left') {
    next = (next + 1) % session.players.length;
    if (++safety > session.players.length) { endGame(session); return; }
  }
  session.currentTurnIndex = next;

  broadcast(session, {
    type: 'turnAdvanced',
    payload: {
      currentPlayerId: session.players[next].id,
      turnNumber: session.totalTurnsElapsed + 1,
    },
  });
}

function endGame(session) {
  session.status = 'finished';

  // ランキング生成（同着タイブレークなし）
  const scores = session.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    categoryCount: p.board.achievedCategoryIds.size,
  })).sort((a, b) => b.categoryCount - a.categoryCount);

  let rank = 1;
  const rankings = scores.map((s, i) => {
    if (i > 0 && s.categoryCount < scores[i - 1].categoryCount) rank = i + 1;
    return { ...s, rank };
  });

  broadcast(session, { type: 'gameEnded', payload: { rankings } });

  // チャットログをクリア（ゲーム終了後）
  session.chatLog = [];
}

function handleResetGame(ws, { sessionId, playerId }) {
  const session = getSession(sessionId);
  if (!session || session.hostPlayerId !== playerId) return;

  // セッション削除（再ゲームは新規作成で対応）
  sessions.delete(sessionId);
  broadcast(session, { type: 'gameReset', payload: {} });
}

// ---------------------------------------------------------------------------
// 候補抽選ロジック（SDD 6.2〜6.3節）
// ---------------------------------------------------------------------------

function getAvailablePool(player, cardType) {
  const allCards = cardType === 'skill' ? getAllSkillCards() : getAllMissionCards();
  const seenIds  = cardType === 'skill' ? player.seenSkillIds : player.seenMissionIds;

  let available = allCards.filter(c => !seenIds.has(c.id));
  if (available.length === 0) {
    seenIds.clear();
    available = allCards;
  }
  return available;
}

function drawCandidates(session, player, diceValue) {
  const ratio = getSkillMissionRatio();
  const candidates = [];
  const usedIds = new Set();

  for (let i = 0; i < diceValue; i++) {
    const wantSkill = Math.random() < ratio.skill;
    const cardType  = wantSkill ? 'skill' : 'mission';
    let pool = getAvailablePool(player, cardType).filter(c => !usedIds.has(c.id));

    // プール枯渇対策（比率に関わらず反対側から補充）
    if (pool.length === 0) {
      const fallback = cardType === 'skill' ? 'mission' : 'skill';
      pool = getAvailablePool(player, fallback).filter(c => !usedIds.has(c.id));
    }
    if (pool.length === 0) break; // 全カード使い尽くし（実際には発生しにくい）

    const card = pool[Math.floor(Math.random() * pool.length)];
    usedIds.add(card.id);
    candidates.push({ ...card, cardType });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// 職種カード充足判定（SDD 7章）
// ---------------------------------------------------------------------------

function checkCategoryAchievements(player) {
  const categories = getAllCategoriesWithRecipes();
  const newlyAchieved = [];

  for (const category of categories) {
    if (player.board.achievedCategoryIds.has(category.id)) continue;

    const skillMatch   = countIntersection(player.board.skillIds,   category.linkedSkillIds);
    const missionMatch = countIntersection(player.board.missionIds, category.linkedMissionIds);

    if (skillMatch >= category.required_skill_count && missionMatch >= category.required_mission_count) {
      player.board.achievedCategoryIds.add(category.id);
      newlyAchieved.push(category.id);
    }
  }
  return newlyAchieved;
}

function countIntersection(playerSet, linkedIds) {
  let count = 0;
  for (const id of linkedIds) {
    if (playerSet.has(Number(id))) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makePlayer(id, name, colorId, ws) {
  return {
    id,
    name,
    colorId,
    ws,
    status: 'active',
    board: {
      skillIds:            new Set(),
      missionIds:          new Set(),
      achievedCategoryIds: new Set(),
    },
    seenSkillIds:   new Set(),
    seenMissionIds: new Set(),
  };
}

function sanitizePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    colorId: p.colorId,
    status: p.status,
    skillCount:    p.board.skillIds.size,
    missionCount:  p.board.missionIds.size,
    categoryCount: p.board.achievedCategoryIds.size,
    skillIds:      [...p.board.skillIds],
    missionIds:    [...p.board.missionIds],
    achievedCategoryIds: [...p.board.achievedCategoryIds],
  };
}

function getCurrentPlayer(session) {
  const p = session.players[session.currentTurnIndex % session.players.length];
  return p && p.status === 'active' ? p : null;
}

// ---------------------------------------------------------------------------
// サーバー起動
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
