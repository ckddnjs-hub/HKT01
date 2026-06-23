'use strict';
// ══════════════════════════════════════════════════════════════════════
//  chat.js — AI 채팅 (Railway + 복지로 GPT 탭)
// ══════════════════════════════════════════════════════════════════════

// ── Railway 탭 상태 ───────────────────────────────────────────────────
let _chatHistory    = [];
let _chatStreaming   = false;
let _chatSearchDone = false;
let _chatThreadId   = null;

// ── 복지로(GPT) 탭 상태 ──────────────────────────────────────────────
let _govHistory   = [];
let _govStreaming  = false;

// ── 현재 활성 탭 ─────────────────────────────────────────────────────
let _chatTab = 'ai'; // 'ai' | 'gov'

// ── 탭 전환 ──────────────────────────────────────────────────────────
function switchChatTab(tab) {
  _chatTab = tab;
  document.querySelectorAll('.chat-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderChatMessages();
}

// ── 전체 채팅 페이지 렌더 ────────────────────────────────────────────
function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;

  // 탭 헤더 + 메시지 영역 + 입력창
  page.innerHTML = `
    <div class="chat-tab-bar">
      <button class="chat-tab-btn${_chatTab === 'ai' ? ' active' : ''}" data-tab="ai"
        onclick="switchChatTab('ai')">🤖 AI 상담</button>
      <button class="chat-tab-btn${_chatTab === 'gov' ? ' active' : ''}" data-tab="gov"
        onclick="switchChatTab('gov')">🏛️ 복지로 검색</button>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div style="height:calc(170px + env(safe-area-inset-bottom,0px))"></div>
    <div class="chat-input-bar">
      <textarea id="chat-input" class="chat-input" rows="1"
        placeholder="${_chatTab === 'gov' ? '예: 나한테 맞는 복지 혜택 알려줘' : '예: 출산 후 받을 수 있는 혜택 알려줘'}"
        onkeydown="chatOnKeydown(event)"></textarea>
      <button class="chat-send-btn" onclick="chatSend()">↑</button>
    </div>
  `;

  // 입력창 높이 자동 조절
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }

  renderChatMessages();
}

// ── 메시지 영역만 렌더 ───────────────────────────────────────────────
function renderChatMessages() {
  const el = document.getElementById('chat-messages');
  if (!el) return;

  if (_chatTab === 'ai') {
    _renderAiMessages(el);
  } else {
    _renderGovMessages(el);
  }
}

// ── AI 상담 탭 메시지 ────────────────────────────────────────────────
function _renderAiMessages(el) {
  if (_chatHistory.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:32px 16px">
        <div style="font-size:3rem;margin-bottom:12px">🤖</div>
        <div style="font-weight:700;margin-bottom:8px">AI 복지 상담사</div>
        <div style="font-size:.83rem;color:var(--text-muted);line-height:1.7">
          Railway AI가 맞춤 혜택 분석 및 대화를 도와드려요
        </div>
      </div>
      <div style="padding:0 4px;display:flex;flex-direction:column;gap:8px">
        ${['출산 후 받을 수 있는 혜택 알려줘', '월세 지원 신청 방법이 궁금해', '기초연금 받을 수 있나요?', '취업 준비 중 지원받을 수 있는 것은?'].map(q => `
          <button style="text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-family:inherit;font-size:.83rem;color:var(--text);cursor:pointer" onclick="chatQuickQuery('${esc(q)}')">
            💬 ${esc(q)}
          </button>`).join('')}
      </div>`;
    return;
  }
  el.innerHTML = _chatHistory.map(h => `
    <div class="chat-bubble ${h.role === 'user' ? 'user' : 'ai'}">
      ${h.role === 'ai' ? _chatFormatAI(h.content) : esc(h.content)}
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── 복지로 탭 메시지 ─────────────────────────────────────────────────
function _renderGovMessages(el) {
  if (_govHistory.length === 0) {
    const p = MY_PROFILE;
    const age = p?.birth_year ? new Date().getFullYear() - p.birth_year : null;
    el.innerHTML = `
      <div style="text-align:center;padding:32px 16px">
        <div style="font-size:3rem;margin-bottom:12px">🏛️</div>
        <div style="font-weight:700;margin-bottom:8px">복지로 공공데이터 + GPT 분석</div>
        <div style="font-size:.83rem;color:var(--text-muted);line-height:1.7;margin-bottom:16px">
          행정안전부 gov24 공공 복지서비스 데이터를<br>
          GPT가 분석해 맞춤 혜택을 안내해드려요
        </div>
        ${age ? `<div style="display:inline-block;padding:6px 14px;border-radius:20px;background:rgba(0,200,150,.12);color:var(--primary);font-size:.78rem;font-weight:700;margin-bottom:16px">${age}세 · ${p.region || ''} · ${p.household_type === 'single' ? '1인가구' : p.household_type || '기타'}</div>` : ''}
      </div>
      <div style="padding:0 4px;display:flex;flex-direction:column;gap:8px">
        ${['내 프로필에 맞는 혜택 전부 알려줘', '주거 지원 받을 수 있는 거 알려줘', '장애인 복지서비스 뭐가 있어?', '한부모 가정 지원 알려줘'].map(q => `
          <button style="text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-family:inherit;font-size:.83rem;color:var(--text);cursor:pointer" onclick="govQuickQuery('${esc(q)}')">
            🏛️ ${esc(q)}
          </button>`).join('')}
      </div>`;
    return;
  }
  el.innerHTML = _govHistory.map(h => `
    <div class="chat-bubble ${h.role === 'user' ? 'user' : 'ai'}">
      ${h.role === 'ai' ? _chatFormatAI(h.content) : esc(h.content)}
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── 공통 포맷 ─────────────────────────────────────────────────────────
function _chatFormatAI(raw) {
  // 마크다운 링크 → <a>
  let t = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:var(--primary);font-weight:600;text-decoration:underline">$1 ↗</a>');

  // **bold**
  t = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  // 혜택 번호 줄 (1️⃣ 등) → 카드 구분선
  t = t.replace(/^([1-5]️⃣)\s*(.+)$/gm,
    '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-weight:800;font-size:.95rem">$1 $2</div>');

  // 항목 줄 (📋 💰 🏢 📞 🔗)
  t = t.replace(/^(📋|💰|🏢|📞|🔗)\s*(.+)$/gm,
    '<div style="display:flex;gap:6px;margin:3px 0;font-size:.83rem"><span style="flex-shrink:0">$1</span><span>$2</span></div>');

  // 나머지 줄바꿈
  t = t.replace(/\n/g, '<br>');

  return t;
}

// ── 전송 라우터 ──────────────────────────────────────────────────────
async function chatSend() {
  if (_chatStreaming || _govStreaming) return;
  const input = document.getElementById('chat-input');
  const msg = input?.value.trim();
  if (!msg) return;
  input.value = '';
  input.style.height = 'auto';

  if (_chatTab === 'gov') {
    await _govDoSend(msg);
  } else {
    await _chatDoSend(msg);
  }
}

function chatOnKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSend();
  }
}

function chatQuickQuery(q) {
  _chatTab = 'ai';
  navigateTo('chat');
  setTimeout(() => _chatDoSend(q), 150);
}

function govQuickQuery(q) {
  _chatTab = 'gov';
  navigateTo('chat');
  setTimeout(() => _govDoSend(q), 150);
}

// ── Railway AI 전송 ───────────────────────────────────────────────────
async function _chatDoSend(msg) {
  if (_chatStreaming) return;
  _chatStreaming = true;

  _chatHistory.push({ role: 'user', content: msg });
  const el = document.getElementById('chat-messages');
  if (!el) { _chatStreaming = false; return; }

  el.innerHTML += `<div class="chat-bubble user">${esc(msg)}</div>`;
  const typingId = 'typing-' + Date.now();
  el.innerHTML += `<div class="chat-bubble ai" id="${typingId}"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  el.scrollTop = el.scrollHeight;

  try {
    if (!_chatThreadId) _chatThreadId = (ME?.id || 'anon') + '-chat-' + Date.now();
    const endpoint = _chatSearchDone ? '/api/personal/feedback' : '/api/personal/search';
    const body = _chatSearchDone
      ? { thread_id: _chatThreadId, feedback: msg }
      : { thread_id: _chatThreadId, user_profile: typeof _buildUserProfile === 'function' ? _buildUserProfile(MY_PROFILE || {}) : { age: 40 }, message: msg };

    const res = await fetch(`${RAILWAY_URL}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const aiText = data.presented_text || data.response_text || (data.results ? `검색 결과 ${data.results.length}건을 찾았어요.` : '응답을 받았어요.');

    document.getElementById(typingId)?.replaceWith(Object.assign(document.createElement('div'), { className: 'chat-bubble ai', innerHTML: _chatFormatAI(aiText) }));
    _chatHistory.push({ role: 'ai', content: aiText });
    _chatSearchDone = true;
  } catch (e) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.innerHTML = '⚠️ 연결에 실패했어요. 잠시 후 다시 시도해주세요.';
  } finally {
    _chatStreaming = false;
    el.scrollTop = el.scrollHeight;
  }
}

// ── 복지로(GPT) 전송 ─────────────────────────────────────────────────
async function _govDoSend(msg) {
  if (_govStreaming) return;
  _govStreaming = true;

  _govHistory.push({ role: 'user', content: msg });
  const el = document.getElementById('chat-messages');
  if (!el) { _govStreaming = false; return; }

  el.innerHTML += `<div class="chat-bubble user">${esc(msg)}</div>`;
  const typingId = 'typing-gov-' + Date.now();
  el.innerHTML += `<div class="chat-bubble ai" id="${typingId}"><div class="typing-dots"><span></span><span></span><span></span></div><div style="font-size:.7rem;color:var(--text-dim);margin-top:4px">🏛️ gov24 검색 중...</div></div>`;
  el.scrollTop = el.scrollHeight;

  try {
    const res = await fetch('/api/welfare-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        user_profile: MY_PROFILE || {},
        history: _govHistory.slice(-8),
      }),
    });

    const data = await res.json();
    const aiText = data.text || '응답을 받지 못했어요.';
    const countBadge = data.source_count ? `<div style="font-size:.68rem;color:var(--text-dim);margin-top:6px">📊 gov24 데이터 ${data.source_count}건 분석</div>` : '';

    const newBubble = document.createElement('div');
    newBubble.className = 'chat-bubble ai';
    newBubble.innerHTML = _chatFormatAI(aiText) + countBadge;
    document.getElementById(typingId)?.replaceWith(newBubble);

    _govHistory.push({ role: 'ai', content: aiText });
  } catch (e) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.innerHTML = '⚠️ 복지로 검색에 실패했어요. 잠시 후 다시 시도해주세요.';
  } finally {
    _govStreaming = false;
    el.scrollTop = el.scrollHeight;
  }
}
