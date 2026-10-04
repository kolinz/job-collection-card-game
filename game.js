/**
 * game.js
 * Role-Based Card Game Framework（職種コレクション版）v2.0-B
 *
 * I18n + GameClient（SceneManager不使用・2Dのみ）
 *
 * render() のルール:
 *   - mode === 'room-create' / 'invite-link' / 'join-name' / 'lobby' のときは #app 全体を置き換える。
 *   - mode === 'game' のときは、候補提示・カード獲得・職種達成・退出通知の受信時に
 *     render() を呼ばない。該当DOM要素のみ直接更新する。
 */

'use strict';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const PLAYER_COLORS = [
  { id: 1, hex: '#6366f1' },
  { id: 2, hex: '#f59e0b' },
  { id: 3, hex: '#10b981' },
  { id: 4, hex: '#ef4444' },
  { id: 5, hex: '#38bdf8' },
  { id: 6, hex: '#a855f7' },
];

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ---------------------------------------------------------------------------
// I18n
// ---------------------------------------------------------------------------
class I18n {
  constructor() {
    this.currentLang = 'ja';
    this.translations = {};
  }

  async load(lang) {
    this.currentLang = lang;
    try {
      const res = await fetch(`/api/lang/${lang}`);
      this.translations = await res.json();
    } catch (e) {
      console.error('i18n load error', e);
    }
  }

  t(key, params = {}) {
    const parts = key.split('.');
    let val = this.translations;
    for (const p of parts) {
      if (val == null) return key;
      val = val[p];
    }
    if (typeof val !== 'string') return key;
    return val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
  }
}

// ---------------------------------------------------------------------------
// GameClient
// ---------------------------------------------------------------------------
class GameClient {
  constructor() {
    this.i18n = new I18n();
    this.ws   = null;
    this.mode = 'room-create'; // 'room-create'|'invite-link'|'join-name'|'lobby'|'game'
    this.session = null;       // { id, hostPlayerId, players[], maxPlayers, turnsPerPlayer, ... }
    this.myPlayerId = null;
    this.chatLog = [];
    this.chatPanelOpen = false;
    this.chatUnread = 0;

    // マスタデータキャッシュ
    this.categoriesCache      = [];
    this.skillsCache          = [];
    this.missionsCache        = [];
    this.categoryRecipesCache = [];
    this.skillTypesCache      = [];   // スキル区分
    this.missionCatsCache     = [];   // ミッション区分

    // ゲーム中の一時状態
    this.currentDice     = 0;
    this.currentCandidates = [];
    this.selectedCandidate = null;
    this.currentPlayerId = null;
    this.turnNumber      = 1;
    this.totalTurns      = 0;

    // 招待URLを開いたとき用
    this.joinSessionId   = null;
    this.joinPlayersInfo = null; // 参加前のプレイヤー一覧
  }

  // -------------------------------------------------------------------------
  // 初期化
  // -------------------------------------------------------------------------
  async init() {
    await this.i18n.load('ja');
    await this.fetchAllCards();

    // /join/:sessionId のURLパターンを検出
    const m = location.pathname.match(/^\/join\/([A-Z0-9]+)$/);
    if (m) {
      this.joinSessionId = m[1];
      // セッション情報（参加済みプレイヤー色）を取得するためWS接続
      this.mode = 'join-name';
      this.connectWebSocket();
    } else {
      this.mode = 'room-create';
      this.connectWebSocket();
    }
    this.render();
    this.initChatUI();
    this.initDexModal();
    this.initCardDescModal();
  }

  async fetchAllCards() {
    const [cats, skills, missions, recipes, skillTypes, missionCats] = await Promise.all([
      fetch('/api/cards/categories').then(r => r.json()),
      fetch('/api/cards/skills').then(r => r.json()),
      fetch('/api/cards/missions').then(r => r.json()),
      fetch('/api/cards/category-recipes').then(r => r.json()),
      fetch('/api/cards/skill-types').then(r => r.json()),
      fetch('/api/cards/mission-categories').then(r => r.json()),
    ]);
    this.categoriesCache      = cats;
    this.skillsCache          = skills;
    this.missionsCache        = missions;
    this.categoryRecipesCache = recipes;
    this.skillTypesCache      = skillTypes;
    this.missionCatsCache     = missionCats;
  }

  // -------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------
  connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);

    this.ws.addEventListener('open', () => {
      // join-name モードでは自動でセッション情報をリクエストしない（参加時にのみ送る）
    });

    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.handleMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      // 再接続は省略（再読み込みで対応）
    });
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  // -------------------------------------------------------------------------
  // WebSocket メッセージハンドラ
  // -------------------------------------------------------------------------
  handleMessage({ type, payload }) {
    switch (type) {
      case 'sessionCreated':      this.onSessionCreated(payload);    break;
      case 'playerJoined':        this.onPlayerJoined(payload);      break;
      case 'gameStarted':         this.onGameStarted(payload);       break;
      case 'diceRolled':          this.onDiceRolled(payload);        break;
      case 'candidatesPresented': this.onCandidatesPresented(payload); break;
      case 'cardAcquired':        this.onCardAcquired(payload);      break;
      case 'categoryAchieved':    this.onCategoryAchieved(payload);  break;
      case 'turnAdvanced':        this.onTurnAdvanced(payload);      break;
      case 'playerLeft':          this.onPlayerLeft(payload);        break;
      case 'gameEnded':           this.onGameEnded(payload);         break;
      case 'chatMessage':         this.onChatMessage(payload);       break;
      case 'error':               this.onError(payload);             break;
    }
  }

  onSessionCreated({ sessionId, inviteUrl, player, players }) {
    this.myPlayerId = player.id;
    this.session = {
      id: sessionId,
      hostPlayerId: player.id,
      players: [player],
      maxPlayers: this._pendingMaxPlayers || 4,
      turnsPerPlayer: this._pendingTurnsPerPlayer || 5,
    };
    this.mode = 'invite-link';
    this.render();
  }

  onPlayerJoined({ player, players }) {
    if (this.session) {
      this.session.players = players;
      if (this.mode === 'lobby' || this.mode === 'invite-link') {
        this.render();
      }
    } else {
      // joinSession の結果として自分が参加した
      this.myPlayerId = player.id;
      this.session = { players, hostPlayerId: null, id: this.joinSessionId };
      this.mode = 'lobby';
      this.render();
    }
  }

  onGameStarted({ turnOrder, totalTurns, currentPlayerId, turnNumber }) {
    this.currentPlayerId = currentPlayerId;
    this.totalTurns      = totalTurns;
    this.turnNumber      = turnNumber;
    this.mode = 'game';
    this.render();
    this.updateTurnBar();
    this.updateScoreBar();
    this.updateTurnAction();
    this.showChatUI(true);
  }

  onDiceRolled({ playerId, diceValue }) {
    this.currentDice = diceValue;
    const el = document.getElementById('dice-display');
    if (el) {
      el.textContent = DICE_FACES[diceValue] || diceValue;
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = 'pip .4s ease';
    }
    // 候補提示前にサイコロボタンを無効化
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) rollBtn.disabled = true;
  }

  onCandidatesPresented({ candidates }) {
    this.currentCandidates = candidates;
    this.selectedCandidate = null;
    this.updateCandidatesArea();
  }

  onCardAcquired({ playerId, card, cardType }) {
    const player = this.session && this.session.players.find(p => p.id === playerId);
    if (player) {
      if (cardType === 'skill') {
        player.skillIds = [...(player.skillIds || []), card.id];
        player.skillCount = (player.skillCount || 0) + 1;
      } else {
        player.missionIds = [...(player.missionIds || []), card.id];
        player.missionCount = (player.missionCount || 0) + 1;
      }
      this.updateBoard(playerId);
      this.updateScoreBar();
    }
    this.showToast(`${player ? player.name : ''}: ${card.name_ja}`, 'info', 2000);
  }

  onCategoryAchieved({ playerId, categoryId }) {
    const player = this.session && this.session.players.find(p => p.id === playerId);
    if (player) {
      player.achievedCategoryIds = [...(player.achievedCategoryIds || []), categoryId];
      player.categoryCount = (player.categoryCount || 0) + 1;
      this.updateBoard(playerId);
      this.updateScoreBar();
    }
    const cat = this.categoriesCache.find(c => c.id === categoryId);
    this.showToast(`🎉 ${player ? player.name : ''}: ${cat ? cat.name_ja : ''}`, 'success', 3000);
  }

  onTurnAdvanced({ currentPlayerId, turnNumber }) {
    this.currentPlayerId = currentPlayerId;
    this.turnNumber      = turnNumber;
    this.currentCandidates = [];
    this.selectedCandidate = null;
    this.updateTurnBar();
    this.updateScoreBar();
    this.updateTurnAction();
  }

  onPlayerLeft({ playerId, phase, players }) {
    if (phase === 'lobby') {
      if (this.session) this.session.players = players || this.session.players.filter(p => p.id !== playerId);
      if (this.mode === 'invite-link' || this.mode === 'lobby') this.render();
    } else {
      const player = this.session && this.session.players.find(p => p.id === playerId);
      if (player) {
        player.status = 'left';
        this.updateBoard(playerId);
        this.updateScoreBar();
        this.showToast(this.i18n.t('game.playerLeftGame', { name: player.name }), 'info', 4000);
      }
    }
  }

  onGameEnded({ rankings }) {
    this.mode = 'game-over';
    const app = document.getElementById('app');
    if (!app) return;

    let rows = rankings.map(r => {
      const player = this.session && this.session.players.find(p => p.id === r.playerId);
      const name   = r.playerName || (player ? player.name : r.playerId);
      const isMe   = r.playerId === this.myPlayerId;
      return `<div class="ranking-item">
        <div class="rank-num ${r.rank === 1 ? 'rank-1' : ''}">${r.rank}</div>
        <div class="rank-name">${escHtml(name)}${isMe ? ' 👤' : ''}</div>
        <div class="rank-score">${r.categoryCount} 職種</div>
      </div>`;
    }).join('');

    app.innerHTML = `<div class="ranking-screen">
      <h1>🏁 ゲーム終了</h1>
      <div class="ranking-list">${rows}</div>
      <button class="btn-primary" style="max-width:320px;margin-top:24px" id="btn-play-again">
        もう一度プレイする
      </button>
    </div>`;

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      location.href = '/';
    });

    // チャットログクリア
    this.chatLog = [];
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.innerHTML = '';
  }

  onChatMessage({ playerId, playerName, text, sentAt }) {
    this.chatLog.push({ playerId, playerName, text, sentAt });
    if (this.chatPanelOpen) {
      this.appendChatMessage({ playerId, playerName, text, sentAt });
    } else {
      this.chatUnread++;
      const badge = document.getElementById('chat-badge');
      if (badge) { badge.textContent = this.chatUnread; badge.classList.add('show'); }
    }
  }

  onError({ code }) {
    const msg = this.i18n.t(`errors.${code}`) || code;
    this.showToast(msg, 'error');
  }

  // -------------------------------------------------------------------------
  // render() — モード分岐
  // -------------------------------------------------------------------------
  render() {
    switch (this.mode) {
      case 'room-create': this.renderRoomCreate(); break;
      case 'invite-link': this.renderInviteLink(); break;
      case 'join-name':   this.renderJoinName();   break;
      case 'lobby':       this.renderLobby();      break;
      case 'game':        this.renderGame();        break;
    }
  }

  // -------------------------------------------------------------------------
  // renderRoomCreate
  // -------------------------------------------------------------------------
  renderRoomCreate() {
    const app = document.getElementById('app');
    let selectedCount = 4;
    let selectedColor = 1;
    let turnsPerPlayer = 5;

    const colorOptions = PLAYER_COLORS.map(c =>
      `<div class="color-dot ${c.id === selectedColor ? 'selected' : ''}"
        style="background:${c.hex}"
        data-color="${c.id}"></div>`
    ).join('');

    app.innerHTML = `<div class="room-screen">
      <h1>職種コレクション</h1>
      <h2>ルームを作成する</h2>
      <div class="card">
        <div class="form-row">
          <label>プレイヤー人数</label>
          <div class="btn-group" id="count-group">
            ${[2,3,4].map(n => `<button class="btn-count ${n === selectedCount ? 'selected' : ''}" data-count="${n}">${n}人</button>`).join('')}
          </div>
        </div>
        <div class="form-row">
          <label>1人あたりのターン数</label>
          <input type="number" id="turns-input" value="${turnsPerPlayer}" min="1" max="20">
        </div>
        <div class="form-row">
          <label>あなたの名前</label>
          <input type="text" id="name-input" placeholder="名前を入力" maxlength="20">
        </div>
        <div class="form-row">
          <label>カラーを選択</label>
          <div class="color-picker" id="color-picker">${colorOptions}</div>
        </div>
        <button class="btn-primary" id="create-btn">ルームを作成する</button>
      </div>
    </div>`;

    // 人数選択
    document.getElementById('count-group').addEventListener('click', e => {
      const btn = e.target.closest('.btn-count');
      if (!btn) return;
      selectedCount = Number(btn.dataset.count);
      document.querySelectorAll('.btn-count').forEach(b => b.classList.toggle('selected', Number(b.dataset.count) === selectedCount));
    });

    // カラー選択
    document.getElementById('color-picker').addEventListener('click', e => {
      const dot = e.target.closest('.color-dot');
      if (!dot) return;
      selectedColor = Number(dot.dataset.color);
      document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', Number(d.dataset.color) === selectedColor));
    });

    // 作成ボタン
    document.getElementById('create-btn').addEventListener('click', () => {
      const name = document.getElementById('name-input').value.trim();
      const tpp  = Math.max(1, parseInt(document.getElementById('turns-input').value) || 5);
      if (!name) { this.showToast('名前を入力してください', 'error'); return; }
      this._pendingMaxPlayers    = selectedCount;
      this._pendingTurnsPerPlayer = tpp;
      this.send('createSession', { playerName: name, colorId: selectedColor, maxPlayers: selectedCount, turnsPerPlayer: tpp });
    });
  }

  // -------------------------------------------------------------------------
  // renderInviteLink（ホストのロビー）
  // -------------------------------------------------------------------------
  renderInviteLink() {
    const app = document.getElementById('app');
    if (!this.session) return;
    const inviteUrl = `${location.origin}/join/${this.session.id}`;
    const players   = this.session.players || [];
    const max       = this.session.maxPlayers || 4;
    const isHost    = this.myPlayerId === this.session.hostPlayerId;
    const enoughPlayers = players.length >= 2;

    const playerItems = players.map(p => {
      const isMe = p.id === this.myPlayerId;
      const color = PLAYER_COLORS.find(c => c.id === p.colorId)?.hex || '#6366f1';
      return `<div class="player-item">
        <div class="dot" style="background:${color}"></div>
        <span>${escHtml(p.name)}${isMe ? ' (あなた)' : ''}</span>
      </div>`;
    });
    for (let i = players.length; i < max; i++) {
      playerItems.push(`<div class="player-item waiting">⏳ 参加者を待っています…</div>`);
    }

    app.innerHTML = `<div class="room-screen">
      <h1>職種コレクション</h1>
      <h2>ルームを準備中… (${players.length}/${max}人)</h2>
      <div class="card">
        <div class="form-row">
          <label>招待リンク</label>
          <div class="invite-url-box">
            <input type="text" id="invite-url" value="${escHtml(inviteUrl)}" readonly>
            <button class="btn-copy" id="copy-btn">コピー</button>
          </div>
        </div>
        <div class="player-list">${playerItems.join('')}</div>
        ${isHost
          ? `<button class="btn-primary" id="start-btn" ${!enoughPlayers ? 'disabled' : ''}>ゲームを開始する</button>
             ${!enoughPlayers ? '<p style="text-align:center;font-size:0.8rem;color:#64748b;margin-top:6px">2人以上そろってから開始できます</p>' : ''}`
          : '<p style="text-align:center;color:#64748b">ホストがゲームを開始するのを待っています…</p>'
        }
      </div>
    </div>`;

    document.getElementById('copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(inviteUrl).then(() => this.showToast('コピーしました', 'success', 1500));
    });
    document.getElementById('start-btn')?.addEventListener('click', () => {
      this.send('startGame');
    });
  }

  // -------------------------------------------------------------------------
  // renderJoinName（招待URLを開いたプレイヤー）
  // -------------------------------------------------------------------------
  renderJoinName() {
    const app = document.getElementById('app');
    const takenColors = (this.joinPlayersInfo || []).map(p => p.colorId);
    let selectedColor = PLAYER_COLORS.find(c => !takenColors.includes(c.id))?.id || 1;

    const colorOptions = PLAYER_COLORS.map(c => {
      const taken = takenColors.includes(c.id);
      return `<div class="color-dot ${taken ? 'taken' : ''} ${c.id === selectedColor ? 'selected' : ''}"
        style="background:${c.hex}"
        data-color="${c.id}"></div>`;
    }).join('');

    app.innerHTML = `<div class="room-screen">
      <h1>職種コレクション</h1>
      <h2>ルームに参加する</h2>
      <div class="card">
        <div class="form-row">
          <label>あなたの名前</label>
          <input type="text" id="name-input" placeholder="名前を入力" maxlength="20">
        </div>
        <div class="form-row">
          <label>カラーを選択</label>
          <div class="color-picker" id="color-picker">${colorOptions}</div>
        </div>
        <button class="btn-primary" id="join-btn">参加する</button>
      </div>
    </div>`;

    document.getElementById('color-picker').addEventListener('click', e => {
      const dot = e.target.closest('.color-dot');
      if (!dot || dot.classList.contains('taken')) return;
      selectedColor = Number(dot.dataset.color);
      document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', Number(d.dataset.color) === selectedColor));
    });

    document.getElementById('join-btn').addEventListener('click', () => {
      const name = document.getElementById('name-input').value.trim();
      if (!name) { this.showToast('名前を入力してください', 'error'); return; }
      this.send('joinSession', { sessionId: this.joinSessionId, playerName: name, colorId: selectedColor });
    });
  }

  // -------------------------------------------------------------------------
  // renderLobby（参加者側のロビー）
  // -------------------------------------------------------------------------
  renderLobby() {
    this.renderInviteLink(); // ロビーの表示はホストと同じ構造を流用
  }

  // -------------------------------------------------------------------------
  // renderGame — ゲーム画面の初回構築
  // -------------------------------------------------------------------------
  renderGame() {
    const app = document.getElementById('app');
    const n   = this.session?.players.length || 2;

    app.innerHTML = `<div class="game-layout">
      <div id="sb"></div>
      <div id="turn-bar">
        <span id="turn-bar-left"></span>
        <span id="turn-bar-right"></span>
      </div>
      <div class="game-main">
        <div id="turn-action">
          <div id="dice-display">${DICE_FACES[0] || '🎲'}</div>
          <button class="btn-roll" id="roll-btn">サイコロを振る</button>
          <div id="candidates-area"></div>
          <button class="btn-next-turn" id="next-turn-btn" disabled>ターン終了</button>
        </div>
        <div id="boards-area" class="players-${n}"></div>
      </div>
    </div>`;

    // ボード初期描画
    if (this.session?.players) {
      this.session.players.forEach(p => this.renderBoardForPlayer(p));
    }

    this.updateScoreBar();
    this.updateTurnBar();
    this.updateTurnAction();

    // サイコロボタン
    document.getElementById('roll-btn')?.addEventListener('click', () => {
      this.send('rollDice');
    });

    // ターン終了ボタン
    document.getElementById('next-turn-btn')?.addEventListener('click', () => {
      this.send('nextTurn');
      document.getElementById('next-turn-btn').disabled = true;
      document.getElementById('candidates-area').innerHTML = '';
      this.selectedCandidate = null;
      this.currentCandidates = [];
    });
  }

  // -------------------------------------------------------------------------
  // スコアバー更新
  // -------------------------------------------------------------------------
  updateScoreBar() {
    const sb = document.getElementById('sb');
    if (!sb || !this.session?.players) return;
    sb.innerHTML = this.session.players.map(p => {
      const color = PLAYER_COLORS.find(c => c.id === p.colorId)?.hex || '#6366f1';
      const isActive = p.id === this.currentPlayerId;
      return `<div class="sb-player pc-${p.colorId} ${isActive ? 'active-turn' : ''}" style="--pc:${color}">
        <div class="sb-dot"></div>
        <span class="sb-name">${escHtml(p.name)}</span>
        <span class="sb-badge">S:${p.skillCount || 0}</span>
        <span class="sb-badge">M:${p.missionCount || 0}</span>
        <span class="sb-badge cat">職:${p.categoryCount || 0}</span>
      </div>`;
    }).join('');
  }

  // -------------------------------------------------------------------------
  // ターンバー更新
  // -------------------------------------------------------------------------
  updateTurnBar() {
    const l = document.getElementById('turn-bar-left');
    const r = document.getElementById('turn-bar-right');
    if (!l || !r) return;
    const current = this.session?.players.find(p => p.id === this.currentPlayerId);
    l.textContent = `ターン ${this.turnNumber} / ${this.totalTurns}`;
    r.textContent = current
      ? (current.id === this.myPlayerId ? '⭐ あなたの手番' : `${current.name} の手番`)
      : '';
  }

  // -------------------------------------------------------------------------
  // ターン操作エリア更新
  // -------------------------------------------------------------------------
  updateTurnAction() {
    const rollBtn     = document.getElementById('roll-btn');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    if (!rollBtn) return;

    const isMyTurn = this.currentPlayerId === this.myPlayerId;
    rollBtn.disabled     = !isMyTurn || this.currentCandidates.length > 0;
    nextTurnBtn.disabled = !isMyTurn || this.currentCandidates.length > 0 || !this.currentDice;

    // 候補エリアが空でサイコロ済み → ターン終了を有効化
    if (isMyTurn && this.currentDice > 0 && this.currentCandidates.length === 0) {
      if (nextTurnBtn) nextTurnBtn.disabled = false;
    }
  }

  // -------------------------------------------------------------------------
  // 候補カードエリア更新
  // -------------------------------------------------------------------------
  updateCandidatesArea() {
    const area = document.getElementById('candidates-area');
    if (!area) return;

    if (!this.currentCandidates.length) {
      area.innerHTML = '';
      return;
    }

    const myPlayer = this.session?.players.find(p => p.id === this.myPlayerId);
    const ownedSkills   = new Set(myPlayer?.skillIds || []);
    const ownedMissions = new Set(myPlayer?.missionIds || []);

    let html = `<p class="candidates-label">候補カードから1枚を選択してください</p>`;
    html += this.currentCandidates.map(card => {
      const isOwned = card.cardType === 'skill'
        ? ownedSkills.has(card.id)
        : ownedMissions.has(card.id);
      const typeLabel = card.cardType === 'skill' ? 'スキル' : 'ミッション';
      return `<div class="candidate-card ${isOwned ? 'owned' : ''}" data-id="${card.id}" data-type="${card.cardType}">
        <div class="c-name">${escHtml(card.name_ja)}</div>
        <span class="c-type ${card.cardType}">${typeLabel}</span>
        ${isOwned ? '<span style="font-size:0.72rem;color:#64748b;margin-left:6px">所持済み</span>' : ''}
        <button class="btn-card-desc" data-desc-id="${card.id}" data-desc-type="${card.cardType}">説明を見る</button>
      </div>`;
    }).join('');

    html += `<button class="btn-confirm" id="confirm-card-btn" disabled style="margin-top:4px">このカードに決定する</button>`;
    area.innerHTML = html;

    // 候補カードのクリック（1st tap → 2nd tap）
    area.querySelectorAll('.candidate-card:not(.owned)').forEach(el => {
      el.addEventListener('click', () => {
        const id   = Number(el.dataset.id);
        const type = el.dataset.type;
        if (this.selectedCandidate === id) {
          // 2nd tap → 確定
          this.send('selectCard', { candidateCardId: id });
          this.currentCandidates = [];
          area.innerHTML = '';
          const nextTurnBtn = document.getElementById('next-turn-btn');
          if (nextTurnBtn) nextTurnBtn.disabled = false;
        } else {
          // 1st tap → ハイライト
          area.querySelectorAll('.candidate-card').forEach(c => c.classList.remove('selected'));
          el.classList.add('selected');
          this.selectedCandidate = id;
          const confirmBtn = document.getElementById('confirm-card-btn');
          if (confirmBtn) confirmBtn.disabled = false;
        }
      });
    });

    // 「説明を見る」ボタン（カード選択に伝播させない）
    area.querySelectorAll('.btn-card-desc').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id   = Number(btn.dataset.descId);
        const type = btn.dataset.descType;
        this.showCardDesc(id, type);
      });
    });

    // 確定ボタンでも選択可
    document.getElementById('confirm-card-btn')?.addEventListener('click', () => {
      if (this.selectedCandidate) {
        this.send('selectCard', { candidateCardId: this.selectedCandidate });
        this.currentCandidates = [];
        area.innerHTML = '';
        const nextTurnBtn = document.getElementById('next-turn-btn');
        if (nextTurnBtn) nextTurnBtn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------------------
  // プレイヤーボード描画
  // -------------------------------------------------------------------------
  renderBoardForPlayer(p) {
    const boardsArea = document.getElementById('boards-area');
    if (!boardsArea) return;

    let boardEl = document.getElementById(`board-${p.id}`);
    if (!boardEl) {
      boardEl = document.createElement('div');
      boardEl.id = `board-${p.id}`;
      boardsArea.appendChild(boardEl);
    }

    const color   = PLAYER_COLORS.find(c => c.id === p.colorId)?.hex || '#6366f1';
    const isMe    = p.id === this.myPlayerId;
    const isLeft  = p.status === 'left';

    const skillChips = (p.skillIds || []).map(id => {
      const card = this.skillsCache.find(s => s.id === id);
      return card ? `<button class="card-chip skill chip-clickable" data-card-id="${id}" data-card-type="skill">${escHtml(card.name_ja)}</button>` : '';
    }).join('');

    const missionChips = (p.missionIds || []).map(id => {
      const card = this.missionsCache.find(m => m.id === id);
      return card ? `<button class="card-chip mission chip-clickable" data-card-id="${id}" data-card-type="mission">${escHtml(card.name_ja)}</button>` : '';
    }).join('');

    const catChips = (p.achievedCategoryIds || []).map(id => {
      const card = this.categoriesCache.find(c => c.id === id);
      return card ? `<span class="card-chip category-achieved">${escHtml(card.name_ja)}</span>` : '';
    }).join('');

    boardEl.className = `player-board${isMe ? ' my-board' : ''}${isLeft ? ' left-board' : ''}`;
    boardEl.innerHTML = `
      <div class="board-header" style="--pc:${color}">
        <div class="dot"></div>
        <span class="board-name">${escHtml(p.name)}${isMe ? ' (あなた)' : ''}</span>
        ${isLeft ? '<span class="left-badge">退出済み</span>' : ''}
      </div>
      <div class="board-section">
        <div class="board-section-label">スキルカード (${(p.skillIds||[]).length})</div>
        <div class="chip-list">${skillChips || '<span style="font-size:.72rem;color:#475569">なし</span>'}</div>
      </div>
      <div class="board-section">
        <div class="board-section-label">ミッションカード (${(p.missionIds||[]).length})</div>
        <div class="chip-list">${missionChips || '<span style="font-size:.72rem;color:#475569">なし</span>'}</div>
      </div>
      <div class="board-section">
        <div class="board-section-label">職種カード (${(p.achievedCategoryIds||[]).length})</div>
        <div class="chip-list">${catChips || '<span style="font-size:.72rem;color:#475569">なし</span>'}</div>
      </div>
      <button class="btn-dex" data-pid="${p.id}">📖 職種図鑑を見る</button>
    `;

    boardEl.querySelector('.btn-dex')?.addEventListener('click', () => {
      this.openCategoryDex(p.id);
    });

    boardEl.querySelectorAll('.chip-clickable').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showCardDesc(Number(btn.dataset.cardId), btn.dataset.cardType);
      });
    });
  }

  updateBoard(playerId) {
    const player = this.session?.players.find(p => p.id === playerId);
    if (player) this.renderBoardForPlayer(player);
  }

  // -------------------------------------------------------------------------
  // 職種図鑑モーダル
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // カード説明モーダル
  // -------------------------------------------------------------------------
  initCardDescModal() {
    const overlay = document.getElementById('card-desc-overlay');
    document.getElementById('cdm-close-btn')?.addEventListener('click', () => {
      overlay?.classList.remove('open');
    });
    overlay?.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }

  showCardDesc(id, type) {
    const card = type === 'skill'
      ? this.skillsCache.find(s => s.id === id)
      : this.missionsCache.find(m => m.id === id);
    if (!card) return;

    // 区分名を取得
    let categoryName = '';
    if (type === 'skill') {
      const st = this.skillTypesCache.find(t => t.id === card.skill_type_id);
      categoryName = st ? st.name_ja : '';
    } else {
      const mc = this.missionCatsCache.find(c => c.id === card.mission_category_id);
      categoryName = mc ? mc.name_ja : '';
    }

    const typeLabel = type === 'skill' ? 'スキル' : 'ミッション';
    const typeEl = document.getElementById('cdm-type');
    if (typeEl) {
      typeEl.textContent = typeLabel;
      typeEl.className = `cdm-type c-type ${type}`;
    }
    const catEl = document.getElementById('cdm-category');
    if (catEl) {
      catEl.textContent = categoryName;
      catEl.style.display = categoryName ? '' : 'none';
    }
    const nameEl = document.getElementById('cdm-name');
    if (nameEl) nameEl.textContent = card.name_ja;
    const descEl = document.getElementById('cdm-desc');
    if (descEl) descEl.textContent = card.description_ja || '説明がありません。';

    document.getElementById('card-desc-overlay')?.classList.add('open');
  }

  initDexModal() {
    document.getElementById('dex-close-btn')?.addEventListener('click', () => {
      document.getElementById('category-dex-overlay').classList.remove('open');
    });
    document.getElementById('category-dex-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove('open');
      }
    });
  }

  openCategoryDex(playerId) {
    const player  = this.session?.players.find(p => p.id === playerId);
    if (!player) return;
    const overlay = document.getElementById('category-dex-overlay');
    const title   = document.getElementById('dex-title');
    const body    = document.getElementById('dex-body');
    if (!overlay || !title || !body) return;

    const ownedSkills   = new Set((player.skillIds   || []).map(Number));
    const ownedMissions = new Set((player.missionIds || []).map(Number));
    const achievedCats  = new Set((player.achievedCategoryIds || []).map(Number));

    title.textContent = `${player.name} の職種図鑑（${achievedCats.size}/${this.categoryRecipesCache.length}）`;

    body.innerHTML = this.categoryRecipesCache.map(cat => {
      const isAchieved = achievedCats.has(cat.id);
      const skillCount = (cat.linkedSkillIds || []).filter(id => ownedSkills.has(Number(id))).length;
      const missCount  = (cat.linkedMissionIds || []).filter(id => ownedMissions.has(Number(id))).length;
      const skillAll   = cat.required_skill_count === (cat.linkedSkillIds||[]).length;
      const missAll    = cat.required_mission_count === (cat.linkedMissionIds||[]).length;

      const skillChips = (cat.linkedSkillIds || []).map(id => {
        const card  = this.skillsCache.find(s => s.id === id);
        const owned = ownedSkills.has(Number(id));
        return card ? `<span class="card-chip ${owned ? 'skill' : 'grey'}">${escHtml(card.name_ja)}</span>` : '';
      }).join('');

      const missChips = (cat.linkedMissionIds || []).map(id => {
        const card  = this.missionsCache.find(m => m.id === id);
        const owned = ownedMissions.has(Number(id));
        return card ? `<span class="card-chip ${owned ? 'mission' : 'grey'}">${escHtml(card.name_ja)}</span>` : '';
      }).join('');

      const descHtml = cat.description_ja ? `<div class="dex-desc">${renderMarkdown(cat.description_ja)}</div>` : '';
      return `<div class="dex-card ${isAchieved ? 'achieved' : ''}">
        <div class="dex-card-title">
          ${escHtml(cat.name_ja)}
          ${isAchieved ? '<span class="dex-achieved-badge">獲得済み</span>' : ''}
        </div>
        ${descHtml}
        <div class="dex-section">
          <div class="dex-section-label">スキル（必要${skillAll ? `${cat.required_skill_count}種・全て` : `${cat.required_skill_count}種`}  ${skillCount}/${(cat.linkedSkillIds||[]).length}）</div>
          <div class="chip-list">${skillChips || '<span style="font-size:.72rem;color:#475569">紐付けなし</span>'}</div>
        </div>
        <div class="dex-section">
          <div class="dex-section-label">ミッション（必要${missAll ? `${cat.required_mission_count}種・全て` : `${cat.required_mission_count}種`}  ${missCount}/${(cat.linkedMissionIds||[]).length}）</div>
          <div class="chip-list">${missChips || '<span style="font-size:.72rem;color:#475569">紐付けなし</span>'}</div>
        </div>
      </div>`;
    }).join('');

    overlay.classList.add('open');
  }

  // -------------------------------------------------------------------------
  // チャット UI
  // -------------------------------------------------------------------------
  initChatUI() {
    // チャットボタン・パネルを body に追加
    if (!document.getElementById('chat-toggle')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'chat-toggle';
      toggleBtn.innerHTML = '💬<span id="chat-badge"></span>';
      document.body.appendChild(toggleBtn);

      const panel = document.createElement('div');
      panel.id = 'chat-panel';
      panel.innerHTML = `
        <div class="chat-header">チャット</div>
        <div id="chat-messages"></div>
        <div class="chat-footer">
          <input type="text" id="chat-input" placeholder="メッセージを入力…" maxlength="500">
          <button class="btn-chat-send" id="chat-send-btn">送信</button>
        </div>`;
      document.body.appendChild(panel);
    }

    document.getElementById('chat-toggle')?.addEventListener('click', () => {
      this.toggleChat();
    });

    const sendHandler = () => {
      const input = document.getElementById('chat-input');
      const text  = input?.value.trim();
      if (!text) return;
      this.send('chatMessage', { text });
      if (input) input.value = '';
    };

    document.getElementById('chat-send-btn')?.addEventListener('click', sendHandler);
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendHandler();
    });
  }

  showChatUI(show) {
    const btn = document.getElementById('chat-toggle');
    if (btn) btn.style.display = show ? 'flex' : 'none';
  }

  toggleChat() {
    this.chatPanelOpen = !this.chatPanelOpen;
    const panel = document.getElementById('chat-panel');
    if (panel) panel.classList.toggle('open', this.chatPanelOpen);

    if (this.chatPanelOpen) {
      // 未読リセット
      this.chatUnread = 0;
      const badge = document.getElementById('chat-badge');
      if (badge) badge.classList.remove('show');

      // 既存ログを表示
      const msgs = document.getElementById('chat-messages');
      if (msgs) {
        msgs.innerHTML = '';
        this.chatLog.forEach(m => this.appendChatMessage(m, msgs));
        msgs.scrollTop = msgs.scrollHeight;
      }
    }
  }

  appendChatMessage({ playerName, text }, container) {
    const msgs = container || document.getElementById('chat-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="msg-name">${escHtml(playerName)}:</span><span class="msg-text">${escHtml(text)}</span>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // -------------------------------------------------------------------------
  // トースト通知
  // -------------------------------------------------------------------------
  showToast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 最小限のマークダウン → HTML 変換。
 * 対応: ## 見出し2 / ### 見出し3 / - リスト / 空行段落
 */
function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 class="md-h3">${escHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2 class="md-h2">${escHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul class="md-ul">'); inList = true; }
      out.push(`<li>${escHtml(line.slice(2))}</li>`);
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false; }
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p class="md-p">${escHtml(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

// ---------------------------------------------------------------------------
// エントリーポイント
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  window.gameClient = new GameClient();
  window.gameClient.init();
});
