'use strict';
// ══════════════════════════════════════════════════════════════════════
//  chat.js — AI 상담 (Railway 복지 어드바이저 /advise/start·/advise/resume)
// ══════════════════════════════════════════════════════════════════════

let _chatHistory   = [];
let _chatStreaming = false;
let _chatTab       = 'ai';
let _advThreadId   = null;   // /advise/start 에서 발급된 thread_id (멀티턴 유지)

// ── 전체 채팅 페이지 렌더 ────────────────────────────────────────────
function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;

  _chatTab = 'ai'; // AI 상담 단일 화면

  // 헤더 + 메시지 영역 + 입력창
  page.innerHTML = `
    <div class="chat-tab-bar">
      <div class="chat-single-title">🤖 AI 복지 상담</div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div style="height:calc(170px + env(safe-area-inset-bottom,0px))"></div>
    <div class="chat-input-bar">
      <textarea id="chat-input" class="chat-input" rows="1"
        placeholder="예: 출산 후 받을 수 있는 혜택 알려줘"
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
  _renderAiMessages(el);
}

// ── AI 상담 탭 메시지 ────────────────────────────────────────────────
function _renderAiMessages(el) {
  if (_chatHistory.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:32px 16px">
        <div style="font-size:3rem;margin-bottom:12px">🤖</div>
        <div style="font-weight:700;margin-bottom:8px">AI 복지 상담사</div>
        <div style="font-size:.83rem;color:var(--text-muted);line-height:1.7">
          내 정보를 바탕으로 맞춤 복지제도를 찾아드리고,<br>신청이 어려우면 담당자 연결까지 도와드려요
        </div>
      </div>
      <div style="padding:0 4px;display:flex;flex-direction:column;gap:8px">
        ${['내가 받을 수 있는 복지 혜택 찾아줘', '월세·주거 지원이 필요해요', '일자리를 찾고 있어요', '몸이 아파서 의료비 지원이 필요해요'].map(q => `
          <button style="text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-family:inherit;font-size:.83rem;color:var(--text);cursor:pointer" onclick="chatQuickQuery('${esc(q)}')">
            💬 ${esc(q)}
          </button>`).join('')}
      </div>`;
    return;
  }
  el.innerHTML = _chatHistory.map(h => {
    if (h.role === 'user') return `<div class="chat-bubble user">${esc(h.content)}</div>`;
    return `<div class="chat-bubble ai">${h.html || _chatFormatAI(h.content || '')}</div>`;
  }).join('');
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
  if (_chatStreaming) return;
  const input = document.getElementById('chat-input');
  const msg = input?.value.trim();
  if (!msg) return;
  input.value = '';
  input.style.height = 'auto';
  await _chatDoSend(msg);
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

// 프로필을 자연어 요약 → consult_text 에 실어 서버 분석(분야/특성 추출)을 돕는다
function _profileSummaryKo(p) {
  const parts = [];
  const age = p.birth_year ? (new Date().getFullYear() - p.birth_year) : null;
  if (age) parts.push(`${age}세`);
  if (p.gender) parts.push(p.gender === 'female' ? '여성' : '남성');
  const region = [p.region, p.district].filter(Boolean).join(' ');
  if (region) parts.push(`${region} 거주`);
  const hh = { single:'1인 가구', couple:'부부 가구', family:'자녀 있는 가족', single_parent:'한부모 가정', other:'기타 가구' }[p.household_type];
  if (hh) parts.push(hh);
  const hz = { own:'자가', jeonse:'전세', monthly_rent:'월세', public:'공공임대' }[p.housing_type];
  if (hz) parts.push(hz);
  if (p.income_level != null) parts.push(`기준 중위소득 ${p.income_level}% 이하`);
  if (p.has_disability) parts.push('장애 있음');
  if (p.has_pregnancy) parts.push('임신·출산 해당');
  if (p.has_infant) parts.push('영유아 자녀 있음');
  if (p.is_single_parent || p.household_type === 'single_parent') parts.push('한부모 가정');
  if (p.is_low_income) parts.push('기초생활수급·차상위');
  return parts.length ? `[내 정보] ${parts.join(', ')}` : '';
}

// ── MY_PROFILE → 어드바이저 Form 변환 ────────────────────────────────
function _advisorForm(consultText) {
  const p = MY_PROFILE || {};
  const summary = _profileSummaryKo(p);
  const ct = (consultText && summary) ? `${consultText}\n\n${summary}` : (consultText || summary);
  let income_band = null;
  const lv = p.income_level;
  if (lv != null) income_band = lv <= 50 ? '50' : lv <= 75 ? '75' : lv <= 100 ? '100' : lv <= 200 ? '200' : 'over200';
  let household_type = 'general';
  if (p.household_type === 'single') household_type = 'single';
  else if (p.household_type === 'family' || p.household_type === 'multichild') household_type = 'multichild';
  const housingMap = { own: 'own', jeonse: 'jeonse', monthly_rent: 'wolse', public: 'etc', other: 'etc' };
  const checklist = [];
  if (p.has_disability) checklist.push('disabled');
  if (p.has_pregnancy) checklist.push('perinatal');
  if (p.has_infant) checklist.push('infant');
  if (p.is_single_parent || p.household_type === 'single_parent') checklist.push('single_parent');
  if (p.is_low_income) checklist.push('basic_recipient');
  return {
    gender: p.gender === 'female' ? 'F' : p.gender === 'male' ? 'M' : null,
    birth_year: p.birth_year || null,
    income_band,
    region_sido: p.region || null,
    region_sigungu: p.district || null,
    household_type,
    housing_type: housingMap[p.housing_type] || 'etc',
    checklist,
    consult_text: ct,
    top: 6,
  };
}

// ── 첫 메시지 = /advise/start, 이후 = /advise/resume(refine) ──────────
async function _chatDoSend(msg) {
  if (_chatStreaming) return;
  _chatStreaming = true;

  _chatHistory.push({ role: 'user', content: msg });
  const el = document.getElementById('chat-messages');
  if (!el) { _chatStreaming = false; return; }

  el.innerHTML += `<div class="chat-bubble user">${esc(msg)}</div>`;
  const typingId = 'typing-' + Date.now();
  el.innerHTML += `<div class="chat-bubble ai" id="${typingId}"><div class="typing-dots"><span></span><span></span><span></span></div><div style="font-size:.7rem;color:var(--text-dim);margin-top:4px">맞춤 복지를 찾는 중...</div></div>`;
  el.scrollTop = el.scrollHeight;

  try {
    let res;
    if (!_advThreadId) {
      res = await fetch(`${ADVISOR_URL}/advise/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_advisorForm(msg)),
      });
    } else {
      res = await fetch(`${ADVISOR_URL}/advise/resume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: _advThreadId, action: 'refine', text: msg }),
      });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    document.getElementById(typingId)?.remove();
    _advHandleResponse(data);
  } catch (e) {
    console.error('advise error', e);
    const t = document.getElementById(typingId);
    if (t) t.innerHTML = '⚠️ 상담 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.';
  } finally {
    _chatStreaming = false;
    el.scrollTop = el.scrollHeight;
  }
}

// ── 버튼 액션(help/done/send) → /advise/resume ───────────────────────
async function _advAction(action) {
  if (_chatStreaming || !_advThreadId) return;
  _chatStreaming = true;
  const el = document.getElementById('chat-messages');
  const typingId = 'typing-' + Date.now();
  if (el) {
    el.innerHTML += `<div class="chat-bubble ai" id="${typingId}"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    el.scrollTop = el.scrollHeight;
  }
  try {
    const res = await fetch(`${ADVISOR_URL}/advise/resume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: _advThreadId, action, text: '' }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    document.getElementById(typingId)?.remove();
    _advHandleResponse(data);
  } catch (e) {
    const t = document.getElementById(typingId);
    if (t) t.innerHTML = '⚠️ 처리에 실패했어요.';
  } finally {
    _chatStreaming = false;
    if (el) el.scrollTop = el.scrollHeight;
  }
}

// ── 응답 처리 (카드/핸드오프/버튼 렌더 + thread 상태) ─────────────────
function _advHandleResponse(data) {
  _advThreadId = data.thread_id || _advThreadId;
  const intr = data.interrupt;
  let html = '';

  if (data.cards && data.cards.length) html += _advRenderCards(data.cards);
  if (intr && intr.type === 'handoff_approve' && intr.packet) html += _advRenderPacket(intr.packet);

  const message = (intr && intr.message) || data.message || '';
  if (message) html += `<div style="margin-top:8px">${_chatFormatAI(message)}</div>`;

  if (intr && intr.type === 'feedback') {
    html += `<div class="adv-btn-row">
        <button class="adv-btn help" onclick="_advAction('help')">🙋 신청 도움받기</button>
        <button class="adv-btn done" onclick="_advAction('done')">✅ 완료</button>
      </div>
      <div class="adv-hint">더 찾고 싶은 게 있으면 메시지로 적어주세요</div>`;
  } else if (intr && intr.type === 'handoff_approve') {
    html += `<div class="adv-btn-row">
        <button class="adv-btn send" onclick="_advAction('send')">📨 담당자에게 전달</button>
        <button class="adv-btn done" onclick="_advAction('done')">취소</button>
      </div>`;
  } else {
    // 종료 — 다음 메시지는 새 상담으로 시작
    _advThreadId = null;
  }

  _chatHistory.push({ role: 'ai', html });
  const el = document.getElementById('chat-messages');
  if (el) { el.innerHTML += `<div class="chat-bubble ai">${html}</div>`; el.scrollTop = el.scrollHeight; }
}

// ── 추천 카드 렌더 ───────────────────────────────────────────────────
function _advRenderCards(cards) {
  const confCls = { '확실': 'badge-green', '조건부': 'badge-yellow', '참고': 'badge-purple' };
  return `<div class="adv-cards">` + cards.map(c => `
    <div class="adv-card">
      <div class="adv-card-top">
        <span class="adv-card-name">${c.local ? '🏠 ' : ''}${esc(c.service_name)}</span>
        ${c.confidence ? `<span class="badge ${confCls[c.confidence] || 'badge-purple'}" style="font-size:.6rem;flex-shrink:0">${esc(c.confidence)}</span>` : ''}
      </div>
      ${c.support ? `<div class="adv-card-sup">${esc(c.support)}</div>` : ''}
      <div class="adv-card-meta">📍 ${esc(c.receiving_agency || '주민센터')}${c.contact ? ` · ☎ ${esc(c.contact)}` : ''}</div>
      <div class="adv-card-meta">📝 ${esc(c.apply_method || '주민센터 문의')} · 마감 ${esc(c.deadline || '상시')}</div>
      ${c.detail_url ? `<a href="${esc(c.detail_url)}" target="_blank" rel="noopener" class="adv-card-link">자세히 보기 ↗</a>` : ''}
    </div>`).join('') + `</div>`;
}

// ── 복지사 전달 패킷 렌더 ────────────────────────────────────────────
function _advRenderPacket(packet) {
  const s = packet['민원인_요약'] || {};
  const recs = packet['추천제도'] || [];
  const reg = s['지역'] ? `${s['지역'].sido || ''} ${s['지역'].sigungu || ''}`.trim() : '-';
  return `<div class="adv-packet">
    <div class="adv-packet-title">📋 복지사 전달 내용 확인</div>
    <div class="adv-packet-row">· 지역: ${esc(reg || '-')}</div>
    <div class="adv-packet-row">· 연령: ${esc(String(s['연령'] ?? '-'))} · 소득구간: ${esc(String(s['소득구간'] ?? '-'))}</div>
    ${s['필요'] ? `<div class="adv-packet-row">· 필요: ${esc(s['필요'])}</div>` : ''}
    <div class="adv-packet-row">· 추천제도: ${recs.map(r => esc(r['제도명'])).join(', ') || '-'}</div>
    ${packet['막힌_지점'] ? `<div class="adv-packet-row" style="color:var(--warn)">· 막힌 점: ${esc(packet['막힌_지점'])}</div>` : ''}
  </div>`;
}

