'use strict';
// ══════════════════════════════════════════════════════════════════════
//  chat.js — AI 상담 (Railway 복지 어드바이저 /advise/start·/advise/resume)
// ══════════════════════════════════════════════════════════════════════

let _chatHistory   = [];
let _chatStreaming = false;
let _chatTab       = 'ai';
let _advThreadId   = null;   // /advise/start 에서 발급된 thread_id (멀티턴 유지)
let _advCards      = [];     // 최근 추천 카드 (카드별 관심/도움 액션용)
let _advHelpPending = null;   // 도움 입력 모달 대상 카드 idx
let _advHelpBtn     = null;   // 도움 버튼 DOM 참조 (모달 확인 후 상태 갱신)

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

  // 추천 카드는 검색 결과(feedback) 응답에서만 표시 (도움/종료에선 재노출 안 함)
  if (intr && intr.type === 'feedback' && data.cards && data.cards.length) html += _advRenderCards(data.cards);
  if (intr && intr.type === 'handoff_approve' && intr.packet) html += _advRenderPacket(intr.packet);

  const message = (intr && intr.message) || data.message || '';
  if (message) html += `<div style="margin-top:8px">${_chatFormatAI(message)}</div>`;

  if (intr && intr.type === 'feedback') {
    html += `<div class="adv-hint">각 혜택에서 <b>⭐관심</b> · <b>📞도움받기</b>를 선택하거나, 더 찾고 싶은 내용을 메시지로 적어주세요</div>
      <div class="adv-btn-row"><button class="adv-btn done" onclick="_advAction('done')">✅ 상담 마치기</button></div>`;
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

// ── 추천 카드 렌더 (카드별 관심/도움 버튼 포함) ──────────────────────
function _advRenderCards(cards) {
  _advCards = cards;
  const confCls = { '확실': 'badge-green', '조건부': 'badge-yellow', '참고': 'badge-purple' };
  const interests = (typeof _wsLoadInterests === 'function') ? _wsLoadInterests() : [];
  const helps = (typeof _loadHelpReqs === 'function') ? _loadHelpReqs() : [];
  const isIntr = (n) => interests.some(i => (i.service_id || i.name) === n);
  const isHelp = (n) => helps.some(r => r.benefit_name === n);
  return `<div class="adv-cards">` + cards.map((c, idx) => `
    <div class="adv-card">
      <div class="adv-card-top">
        <span class="adv-card-name">${c.local ? '🏠 ' : ''}${esc(c.service_name)}</span>
        ${c.confidence ? `<span class="badge ${confCls[c.confidence] || 'badge-purple'}" style="font-size:.6rem;flex-shrink:0">${esc(c.confidence)}</span>` : ''}
      </div>
      ${c.support ? `<div class="adv-card-sup">${esc(c.support)}</div>` : ''}
      <div class="adv-card-meta">📍 ${esc(c.receiving_agency || '주민센터')}${c.contact ? ` · ☎ ${esc(c.contact)}` : ''}</div>
      <div class="adv-card-meta">📝 ${esc(c.apply_method || '주민센터 문의')} · 마감 ${esc(c.deadline || '상시')}</div>
      ${c.detail_url ? `<a href="${esc(c.detail_url)}" target="_blank" rel="noopener" class="adv-card-link">자세히 보기 ↗</a>` : ''}
      <div class="adv-card-acts">
        <button class="adv-card-btn intr ${isIntr(c.service_name)?'on':''}" onclick="_advInterest(${idx}, this)">${isIntr(c.service_name) ? '⭐ 관심됨' : '⭐ 관심'}</button>
        <button class="adv-card-btn help ${isHelp(c.service_name)?'on':''}" onclick="_advHelp(${idx}, this)">${isHelp(c.service_name) ? '✅ 도움요청됨' : '📞 도움받기'}</button>
      </div>
    </div>`).join('') + `</div>`;
}

// 카드 → 관심 토글(전략보드 추가/해제)
function _advInterest(idx, btn) {
  const c = _advCards[idx];
  if (!c) return;
  const id = c.service_name;
  let interests = _wsLoadInterests();
  const st = _wsLoadStatus();

  // 이미 관심 → 해제
  if (interests.some(i => (i.service_id || i.name) === id)) {
    interests = interests.filter(i => (i.service_id || i.name) !== id);
    _wsSaveInterests(interests);
    if (st[id] === 'interested') { delete st[id]; _wsSaveStatus(st); }
    if (btn) { btn.classList.remove('on'); btn.textContent = '⭐ 관심'; }
    toast('관심을 해제했어요');
    return;
  }

  interests.push({
    service_id: id,
    name: c.service_name,
    category: (typeof _fieldToCategory === 'function') ? _fieldToCategory(c.field, c.service_name) : '생활지원',
    amount: (typeof _extractAmount === 'function') ? _extractAmount(c.support) : '지원 있음',
    description: c.support || '',
    content_full: [c.support, c.apply_method ? `\n[신청방법] ${c.apply_method}` : '', c.receiving_agency ? `\n[접수처] ${c.receiving_agency}` : '', c.contact ? `\n[문의] ${c.contact}` : ''].filter(Boolean).join(''),
    agency: c.receiving_agency || '',
    apply_url: c.detail_url || '',
    how_to_apply: c.apply_method || '',
  });
  _wsSaveInterests(interests);
  st[id] = 'interested'; _wsSaveStatus(st);
  if (btn) { btn.classList.add('on'); btn.textContent = '⭐ 관심됨'; }
  toast('⭐ 전략보드에 추가했어요', 'success');
}

// 카드 → 도움받기 (이미 요청됨이면 취소, 아니면 도움 내용 입력 모달)
function _advHelp(idx, btn) {
  const c = _advCards[idx];
  if (!c) return;
  const name = c.service_name;
  let reqs = _loadHelpReqs();

  // 이미 요청 → 취소
  if (reqs.some(r => r.benefit_name === name)) {
    reqs = reqs.filter(r => r.benefit_name !== name);
    localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
    if (ME) { try { sb.from('benefit_help_requests').delete().eq('user_id', ME.id).eq('benefit_name', name); } catch (_) {} }
    if (btn) { btn.classList.remove('on'); btn.textContent = '📞 도움받기'; }
    toast('도움 요청을 취소했어요');
    return;
  }

  // 도움 내용 입력 모달
  _advHelpPending = idx;
  _advHelpBtn = btn;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'adv-help-modal';
  overlay.onclick = (e) => { if (e.target === overlay) _advCloseHelpModal(); };
  overlay.innerHTML = `<div class="modal-box">
    <div class="modal-title">📞 신청 도움받기</div>
    <div class="modal-sub">${esc(c.service_name)}</div>
    <label class="modal-label">어떤 도움이 필요하세요? (선택)</label>
    <textarea id="adv-help-text" class="pf-input" rows="3" style="width:100%;resize:none" placeholder="예: 신청 방법을 모르겠어요 / 서류 준비가 어려워요 / 방문이 힘들어요"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline" style="flex:1" onclick="_advCloseHelpModal()">취소</button>
      <button class="btn btn-primary" style="flex:1" onclick="_advHelpConfirm()">요청 보내기</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('adv-help-text')?.focus(), 80);
}
function _advCloseHelpModal() {
  document.getElementById('adv-help-modal')?.remove();
  _advHelpPending = null; _advHelpBtn = null;
}
async function _advHelpConfirm() {
  const c = _advCards[_advHelpPending];
  if (!c) { _advCloseHelpModal(); return; }
  const note = document.getElementById('adv-help-text')?.value.trim() || '';
  const name = c.service_name, agency = c.receiving_agency || '';
  const p = MY_PROFILE || {};
  const region = [p.region, p.district].filter(Boolean).join(' ');

  const reqs = _loadHelpReqs();
  reqs.push({ benefit_name: name, agency_name: agency, region, note, requested_at: new Date().toISOString() });
  localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
  if (_advHelpBtn) { _advHelpBtn.classList.add('on'); _advHelpBtn.textContent = '✅ 도움요청됨'; }
  if (ME) {
    try {
      await sb.from('benefit_help_requests').insert({
        user_id: ME.id, benefit_name: name, agency_name: agency, region,
        status: 'pending', profile_snapshot: { ...p, help_note: note },
      });
    } catch (e) { console.warn('help insert 실패(테이블 미생성 가능):', e.message); }
  }
  _advCloseHelpModal();
  toast('담당 기관에 도움을 요청했어요 📞 곧 안내해드릴게요', 'success');
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

