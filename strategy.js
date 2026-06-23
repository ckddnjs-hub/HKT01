'use strict';
// ══════════════════════════════════════════════════════════════════════
//  strategy.js — AI 전략보드
//  ⭐ 관심 혜택을 GPT로 6영역(주거·생활·의료·교육·취업·돌봄) 분류
//  레이더차트(영역별 개수) + 항목 펼치기(간략설명 · 쉬운말 변환 · 도움요청 · 일정등록)
// ══════════════════════════════════════════════════════════════════════

let _stratExpanded   = new Set();   // 펼쳐진 항목 id
let _stratSimplified = {};          // id → 쉬운 말 결과
let _stratClassifying = false;
let _stratPendingSchedule = null;   // 일정 등록 모달 대상 id
let _stratHelpPending = null;       // 도움 입력 모달 대상 id

const STRAT_AREAS = ['주거', '생활', '의료', '교육', '취업', '돌봄'];
const AREA_COLOR  = { 주거:'#3B82F6', 생활:'#00C896', 의료:'#EF4444', 교육:'#F59E0B', 취업:'#6366F1', 돌봄:'#EC4899' };

// 영역별 SVG 아이콘 (stroke=currentColor → 부모 color로 색 지정)
const AREA_SVG = {
  주거: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  생활: '<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  의료: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  교육: '<path d="M22 9 12 5 2 9l10 4 10-4Z"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5"/>',
  취업: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  돌봄: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/>',
};
function _areaSvg(area, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px">${AREA_SVG[area] || ''}</svg>`;
}

// ── 저장소 ────────────────────────────────────────────────────────────
function _stratInterests()        { try { return JSON.parse(localStorage.getItem('welfare_interests') || '[]'); } catch { return []; } }
function _stratLoadCategories()    { try { return JSON.parse(localStorage.getItem('welfare_categories') || '{}'); } catch { return {}; } }
function _stratSaveCategories(o)   { try { localStorage.setItem('welfare_categories', JSON.stringify(o)); } catch {} }
function _navGetConsult()          { try { return JSON.parse(localStorage.getItem('welfare_consult') || '[]'); } catch { return []; } }
function _navSetConsult(a)         { try { localStorage.setItem('welfare_consult', JSON.stringify(a)); } catch {} }
function _navGetSchedule()         { try { return JSON.parse(localStorage.getItem('welfare_schedule') || '[]'); } catch { return []; } }
function _navSetSchedule(a)        { try { localStorage.setItem('welfare_schedule', JSON.stringify(a)); } catch {} }

// ── 전체 렌더 ─────────────────────────────────────────────────────────
function renderStrategy() {
  const el = document.getElementById('page-strategy');
  if (!el) return;

  const interests = _stratInterests();
  const cats = _stratLoadCategories();
  const counts = {}; STRAT_AREAS.forEach(a => counts[a] = 0);
  interests.forEach(i => { const c = cats[i.service_id || i.name]; if (counts[c] != null) counts[c]++; });
  const consultSet = new Set(((typeof _loadHelpReqs === 'function') ? _loadHelpReqs() : []).map(r => r.benefit_name));
  const schedSet   = new Set(_navGetSchedule().map(x => x.name));

  el.innerHTML = `
    <div style="padding:16px 16px 0">
      <div style="font-size:1.1rem;font-weight:900;margin-bottom:4px">📊 AI 전략보드</div>
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px">
        ${interests.length ? '⭐ 관심 표시한 혜택을 영역별로 정리했어요' : '홈에서 관심 혜택을 표시하면 여기에 모여요'}
      </div>
    </div>

    <div class="strategy-section">
      ${interests.length ? `
        <!-- 레이더: 영역별 관심 혜택 개수 -->
        <div class="chart-wrap">
          <div class="chart-title">🎯 관심 혜택 영역별 분포</div>
          ${_areaRadarSVG(counts)}
          <div class="area-legend">
            ${STRAT_AREAS.map(a => `<span class="area-legend-item"><span style="color:${AREA_COLOR[a]}">${_areaSvg(a, 16)}</span> ${a} <b>${counts[a]}</b></span>`).join('')}
          </div>
        </div>

        <div class="chart-title" style="margin:14px 0 4px">⭐ 내 관심 혜택 (${interests.length})</div>
        ${_renderInterestGrouped(interests, cats, consultSet, schedSet)}
      ` : `
        <div class="card" style="text-align:center;padding:40px 16px">
          <div style="font-size:2.5rem;margin-bottom:12px">⭐</div>
          <div style="font-weight:700;margin-bottom:8px">아직 관심 혜택이 없어요</div>
          <div style="font-size:.83rem;color:var(--text-muted);margin-bottom:16px">홈에서 혜택에 <b style="color:var(--accent)">⭐ 관심</b>을 표시해 주세요</div>
          <button class="btn btn-primary" onclick="navigateTo('dashboard')">홈으로 가기 →</button>
        </div>`}

      <div style="height:16px"></div>
    </div>
  `;

  // 아직 분류 안 된 항목이 있으면 GPT 분류 실행
  if (interests.some(i => !cats[i.service_id || i.name])) classifyInterests();
}

// ── 영역별 그룹 렌더 ──────────────────────────────────────────────────
function _renderInterestGrouped(interests, cats, consultSet, schedSet) {
  const byArea = {};
  interests.forEach(i => {
    const c = cats[i.service_id || i.name] || '__pending';
    (byArea[c] = byArea[c] || []).push(i);
  });

  let html = '';
  STRAT_AREAS.forEach(area => {
    const list = byArea[area];
    if (!list || !list.length) return;
    html += `<div class="intr-area-head" style="color:${AREA_COLOR[area]}">${_areaSvg(area, 18)} ${area} <span style="color:var(--text-dim);font-weight:600">${list.length}</span></div>`;
    html += list.map(i => _stratItemHTML(i, area, consultSet, schedSet)).join('');
  });
  if (byArea['__pending'] && byArea['__pending'].length) {
    html += `<div class="intr-area-head" style="color:var(--text-muted)">🔄 분류 중…</div>`;
    html += byArea['__pending'].map(i => _stratItemHTML(i, null, consultSet, schedSet)).join('');
  }
  return html;
}

// ── 개별 항목(펼치기) ─────────────────────────────────────────────────
function _stratItemHTML(i, area, consultSet, schedSet) {
  const id = i.service_id || i.name;
  const open = _stratExpanded.has(id);
  const easy = _stratSimplified[id];
  const hasConsult = consultSet && consultSet.has(i.name);
  const hasSched   = schedSet && schedSet.has(i.name);

  return `
    <div class="card intr-card" style="padding:0;margin-bottom:8px">
      <div class="intr-head" onclick="_stratToggle('${_jsStr(id)}')">
        <span class="intr-ico" style="flex-shrink:0;color:${area ? AREA_COLOR[area] : 'var(--text-muted)'}">${area ? _areaSvg(area, 22) : `<span style="font-size:1.25rem">${_dashCatIcon(i.category)}</span>`}</span>
        <div style="flex:1;min-width:0">
          <div class="intr-name">${esc(i.name)}</div>
          <div class="intr-amount">${esc(i.amount || '')}</div>
        </div>
        ${hasConsult ? '<span class="intr-flag consult" title="도움 요청됨">📞</span>' : ''}
        ${hasSched ? '<span class="intr-flag sched" title="일정 등록됨">📅</span>' : ''}
        <span class="intr-chevron">${open ? '▴' : '▾'}</span>
      </div>
      ${open ? `
        <div class="intr-body">
          <div class="intr-desc" style="white-space:pre-line">${esc(i.content_full || i.description || '이 혜택에 대한 설명 정보가 아직 없어요.')}</div>
          ${easy ? `<div class="intr-easy">🟢 <b>쉬운 설명</b><br>${esc(easy)}</div>` : ''}
          <div class="intr-act-row">
            <button class="intr-act easy" onclick="_stratSimplify('${_jsStr(id)}')">🪄 쉬운말</button>
            <button class="intr-act consult" onclick="_stratConsult('${_jsStr(id)}')">📞 도움필요</button>
            <button class="intr-act cal" onclick="_stratSchedule('${_jsStr(id)}')">📅 일정등록</button>
          </div>
          <button class="intr-remove" onclick="_stratRemoveInterest('${_jsStr(id)}')">관심 해제</button>
        </div>` : ''}
    </div>`;
}

function _stratToggle(id) {
  if (_stratExpanded.has(id)) _stratExpanded.delete(id); else _stratExpanded.add(id);
  renderStrategy();
}

// ── 쉬운 말 변환 (GPT) ────────────────────────────────────────────────
async function _stratSimplify(id) {
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) return;
  _stratSimplified[id] = '(쉬운 말로 바꾸는 중…)';
  renderStrategy();
  try {
    const res = await fetch('/api/gpt-assist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simplify', name: it.name, text: it.description || it.name }),
    });
    const data = await res.json();
    _stratSimplified[id] = data.text || data.error || '쉬운 설명을 만들지 못했어요.';
  } catch (e) {
    _stratSimplified[id] = '⚠️ 변환에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
  renderStrategy();
}

// ── 도움 필요 — 이미 요청됨이면 취소, 아니면 도움 내용 입력 모달 ──────
function _stratConsult(id) {
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) return;
  let reqs = (typeof _loadHelpReqs === 'function') ? _loadHelpReqs() : [];

  // 이미 요청 → 취소
  if (reqs.some(r => r.benefit_name === it.name)) {
    reqs = reqs.filter(r => r.benefit_name !== it.name);
    localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
    if (ME) { try { sb.from('benefit_help_requests').delete().eq('user_id', ME.id).eq('benefit_name', it.name); } catch (_) {} }
    toast('도움 요청을 취소했어요');
    renderStrategy();
    return;
  }

  // 도움 내용 입력 모달
  _stratHelpPending = id;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'strat-help-modal';
  overlay.onclick = (e) => { if (e.target === overlay) _stratCloseHelpModal(); };
  overlay.innerHTML = `<div class="modal-box">
    <div class="modal-title">📞 신청 도움받기</div>
    <div class="modal-sub">${esc(it.name)}</div>
    <label class="modal-label">어떤 도움이 필요하세요? (선택)</label>
    <textarea id="strat-help-text" class="pf-input" rows="3" style="width:100%;resize:none" placeholder="예: 신청 방법을 모르겠어요 / 서류 준비가 어려워요 / 방문이 힘들어요"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline" style="flex:1" onclick="_stratCloseHelpModal()">취소</button>
      <button class="btn btn-primary" style="flex:1" onclick="_stratHelpConfirm()">요청 보내기</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('strat-help-text')?.focus(), 80);
}
function _stratCloseHelpModal() {
  document.getElementById('strat-help-modal')?.remove();
  _stratHelpPending = null;
}
async function _stratHelpConfirm() {
  const it = _stratInterests().find(x => (x.service_id || x.name) === _stratHelpPending);
  if (!it) { _stratCloseHelpModal(); return; }
  const note = document.getElementById('strat-help-text')?.value.trim() || '';
  const p = MY_PROFILE || {};
  const region = [p.region, p.district].filter(Boolean).join(' ');

  const reqs = (typeof _loadHelpReqs === 'function') ? _loadHelpReqs() : [];
  reqs.push({ benefit_name: it.name, agency_name: it.agency || '', region, note, requested_at: new Date().toISOString() });
  localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
  if (ME) {
    try {
      await sb.from('benefit_help_requests').insert({
        user_id: ME.id, benefit_name: it.name, agency_name: it.agency || '', region,
        status: 'pending', profile_snapshot: { ...p, help_note: note },
      });
    } catch (e) { console.warn('help insert 실패(테이블 미생성 가능):', e.message); }
  }
  _stratCloseHelpModal();
  toast('담당 기관에 도움을 요청했어요 📞 곧 안내해드릴게요', 'success');
  renderStrategy();
}

// ── 일정 등록(캘린더) — 날짜·시간·알람·메모 입력 모달 ─────────────────
function _stratSchedule(id) {
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) return;
  _stratPendingSchedule = id;
  const today = new Date().toISOString().split('T')[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'strat-sc-modal';
  overlay.onclick = (e) => { if (e.target === overlay) _stratCloseModal(); };
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">📅 일정 등록</div>
      <div class="modal-sub">${esc(it.name)}</div>
      <label class="modal-label">날짜</label>
      <input type="date" id="sc-date" class="pf-input" style="width:100%" value="${today}" min="${today}">
      <label class="modal-label">시간</label>
      <input type="time" id="sc-time" class="pf-input" style="width:100%" value="09:00">
      <label class="modal-label">알람</label>
      <select id="sc-alarm" class="pf-input" style="width:100%">
        <option value="none">알람 없음</option>
        <option value="same">당일 알림</option>
        <option value="prev">전날 알림</option>
      </select>
      <label class="modal-label">메모 (선택)</label>
      <input type="text" id="sc-memo" class="pf-input" style="width:100%" placeholder="예: 주민센터 방문, 서류 지참">
      <div class="modal-actions">
        <button class="btn btn-outline" style="flex:1" onclick="_stratCloseModal()">취소</button>
        <button class="btn btn-primary" style="flex:1" onclick="_stratConfirmSchedule()">등록</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('sc-date')?.focus(), 80);
}

function _stratConfirmSchedule() {
  const id = _stratPendingSchedule;
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) { _stratCloseModal(); return; }

  const date  = document.getElementById('sc-date')?.value;
  const time  = document.getElementById('sc-time')?.value || '';
  const alarm = document.getElementById('sc-alarm')?.value || 'none';
  const memo  = document.getElementById('sc-memo')?.value.trim() || '';
  if (!date) { toast('날짜를 선택해주세요', 'error'); return; }

  const items = _navGetSchedule();
  if (items.find(x => x.name === it.name && x.date === date && x.time === time)) {
    toast('이미 등록된 일정이에요', 'info'); _stratCloseModal(); return;
  }
  items.push({
    id: Date.now(),
    name:   it.name,
    amount: it.amount || '',
    date, time, alarm, memo,
    desc:   memo || it.description || '',
  });
  _navSetSchedule(items);
  _stratCloseModal();
  const alarmTxt = alarm === 'same' ? ' (당일 알림)' : alarm === 'prev' ? ' (전날 알림)' : '';
  toast(`캘린더에 일정을 등록했어요 📅${alarmTxt}`, 'success');
  renderStrategy();
}

function _stratCloseModal() {
  document.getElementById('strat-sc-modal')?.remove();
  _stratPendingSchedule = null;
}

// ── 관심 해제 ─────────────────────────────────────────────────────────
function _stratRemoveInterest(id) {
  const interests = _stratInterests().filter(i => (i.service_id || i.name) !== id);
  localStorage.setItem('welfare_interests', JSON.stringify(interests));
  let status = {}; try { status = JSON.parse(localStorage.getItem('welfare_status') || '{}'); } catch {}
  if (status[id] === 'interested') { delete status[id]; localStorage.setItem('welfare_status', JSON.stringify(status)); }
  _stratExpanded.delete(id);
  toast('관심 해제했어요');
  renderStrategy();
}

// ── GPT 6영역 분류 ────────────────────────────────────────────────────
async function classifyInterests() {
  if (_stratClassifying) return;
  const interests = _stratInterests();
  const cats = _stratLoadCategories();
  const todo = interests.filter(i => !cats[i.service_id || i.name]);
  if (!todo.length) return;

  _stratClassifying = true;
  let result = {};
  try {
    const items = todo.map(i => ({ id: i.service_id || i.name, name: i.name, desc: i.description || '' }));
    const res = await fetch('/api/gpt-assist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'classify', items }),
    });
    if (res.ok) { const data = await res.json(); result = data.categories || {}; }
  } catch (e) { console.warn('classify fail', e); }

  // GPT 결과 병합 + 누락/오류는 키워드 기반으로 보정 (항상 6영역 중 하나 보장)
  todo.forEach(i => {
    const id = i.service_id || i.name;
    let a = result[id];
    if (!STRAT_AREAS.includes(a)) a = _stratKeywordArea(i);
    cats[id] = a;
  });
  _stratSaveCategories(cats);
  _stratClassifying = false;
  if (currentPage === 'strategy') renderStrategy();
}

function _stratKeywordArea(i) {
  const t = `${i.name} ${i.description || ''} ${i.category || ''}`;
  if (/주거|임대|전세|월세|주택|집/.test(t))                 return '주거';
  if (/의료|건강|병원|치료|약|질환|보건/.test(t))            return '의료';
  if (/교육|학습|학비|장학|학교|보육|어린이집/.test(t))      return '교육';
  if (/취업|고용|일자리|구직|창업|직업|근로/.test(t))        return '취업';
  if (/돌봄|요양|아동|영유아|노인|어르신|보호|장애/.test(t)) return '돌봄';
  return '생활';
}

// ── 커스텀 SVG 레이더(육각형) — 꼭짓점에 영역 아이콘 + 최댓값 기준 스케일 ──
function _pt(cx, cy, r, deg) {
  const a = deg * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function _areaRadarSVG(counts) {
  const W = 280, H = 252, cx = 140, cy = 118, R = 70, iconR = R + 26;
  const values = STRAT_AREAS.map(a => counts[a] || 0);
  const maxV = Math.max(1, ...values);           // 최댓값(예: 교육 2) 이 바깥 테두리에 닿도록
  const angles = STRAT_AREAS.map((_, i) => -90 + i * 60);

  // 그리드(3겹 육각형)
  let grid = '';
  [1/3, 2/3, 1].forEach(ring => {
    const pts = angles.map(d => _pt(cx, cy, R * ring, d).map(n => n.toFixed(1)).join(',')).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="rgba(150,150,160,.22)" stroke-width="1"/>`;
  });
  // 축선
  let axes = '';
  angles.forEach(d => { const [x, y] = _pt(cx, cy, R, d); axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(150,150,160,.18)" stroke-width="1"/>`; });

  // 데이터 폴리곤
  const dataPts = STRAT_AREAS.map((a, i) => _pt(cx, cy, R * ((counts[a] || 0) / maxV), angles[i]));
  const dataStr = dataPts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const dots = dataPts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#a99cff"/>`).join('');

  // 꼭짓점 아이콘 + 영역명 + 개수
  let icons = '';
  STRAT_AREAS.forEach((a, i) => {
    const [ix, iy] = _pt(cx, cy, iconR, angles[i]);
    icons += `<g transform="translate(${(ix - 7.7).toFixed(1)},${(iy - 13).toFixed(1)}) scale(0.64)" fill="none" stroke="${AREA_COLOR[a]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${AREA_SVG[a]}</g>`;
    icons += `<text x="${ix.toFixed(1)}" y="${(iy + 13).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="${AREA_COLOR[a]}">${a}${counts[a] ? ' ' + counts[a] : ''}</text>`;
  });

  return `
    <div style="display:flex;justify-content:center">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:300px">
        ${grid}${axes}
        <polygon points="${dataStr}" fill="rgba(169,156,255,.25)" stroke="#a99cff" stroke-width="2"/>
        ${dots}${icons}
      </svg>
    </div>`;
}
