'use strict';
// ══════════════════════════════════════════════════════════════════════
//  strategy.js — AI 전략보드
//  ⭐ 관심 혜택을 GPT로 6영역(주거·생활·의료·교육·취업·돌봄) 분류
//  레이더차트(영역별 개수) + 항목 펼치기(간략설명 · 쉬운말 변환 · 도움요청 · 일정등록)
// ══════════════════════════════════════════════════════════════════════

let _radarChart      = null;
let _stratExpanded   = new Set();   // 펼쳐진 항목 id
let _stratSimplified = {};          // id → 쉬운 말 결과
let _stratClassifying = false;

const STRAT_AREAS = ['주거', '생활', '의료', '교육', '취업', '돌봄'];
const AREA_ICON   = { 주거:'🏠', 생활:'🍚', 의료:'🏥', 교육:'📚', 취업:'💼', 돌봄:'👶' };
const AREA_COLOR  = { 주거:'#3B82F6', 생활:'#00C896', 의료:'#EF4444', 교육:'#F59E0B', 취업:'#6366F1', 돌봄:'#EC4899' };

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
          <div class="radar-wrap"><canvas id="radar-chart"></canvas></div>
          <div class="area-legend">
            ${STRAT_AREAS.map(a => `<span class="area-legend-item"><span style="color:${AREA_COLOR[a]}">${AREA_ICON[a]}</span> ${a} <b>${counts[a]}</b></span>`).join('')}
          </div>
        </div>

        <div class="chart-title" style="margin:14px 0 4px">⭐ 내 관심 혜택 (${interests.length})</div>
        ${_renderInterestGrouped(interests, cats)}
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

  if (interests.length) setTimeout(() => _drawAreaRadar(counts), 100);

  // 아직 분류 안 된 항목이 있으면 GPT 분류 실행
  if (interests.some(i => !cats[i.service_id || i.name])) classifyInterests();
}

// ── 영역별 그룹 렌더 ──────────────────────────────────────────────────
function _renderInterestGrouped(interests, cats) {
  const byArea = {};
  interests.forEach(i => {
    const c = cats[i.service_id || i.name] || '__pending';
    (byArea[c] = byArea[c] || []).push(i);
  });

  let html = '';
  STRAT_AREAS.forEach(area => {
    const list = byArea[area];
    if (!list || !list.length) return;
    html += `<div class="intr-area-head" style="color:${AREA_COLOR[area]}">${AREA_ICON[area]} ${area} <span style="color:var(--text-dim);font-weight:600">${list.length}</span></div>`;
    html += list.map(i => _stratItemHTML(i, area)).join('');
  });
  if (byArea['__pending'] && byArea['__pending'].length) {
    html += `<div class="intr-area-head" style="color:var(--text-muted)">🔄 분류 중…</div>`;
    html += byArea['__pending'].map(i => _stratItemHTML(i, null)).join('');
  }
  return html;
}

// ── 개별 항목(펼치기) ─────────────────────────────────────────────────
function _stratItemHTML(i, area) {
  const id = i.service_id || i.name;
  const open = _stratExpanded.has(id);
  const easy = _stratSimplified[id];
  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="card intr-card" style="padding:0;margin-bottom:8px">
      <div class="intr-head" onclick="_stratToggle('${_jsStr(id)}')">
        <span style="font-size:1.25rem;flex-shrink:0">${area ? AREA_ICON[area] : _dashCatIcon(i.category)}</span>
        <div style="flex:1;min-width:0">
          <div class="intr-name">${esc(i.name)}</div>
          <div class="intr-amount">${esc(i.amount || '')}</div>
        </div>
        <span class="intr-chevron">${open ? '▴' : '▾'}</span>
      </div>
      ${open ? `
        <div class="intr-body">
          <div class="intr-desc">${esc(i.description || '간략한 설명 정보가 없어요. "자세히"로 원문을 확인하세요.')}</div>
          ${easy ? `<div class="intr-easy">🟢 <b>쉬운 설명</b><br>${esc(easy)}</div>` : ''}
          <div class="intr-btn-row">
            <button class="intr-easy-btn" onclick="_stratSimplify('${_jsStr(id)}')">🪄 쉬운 말로 바꾸기</button>
            <button class="intr-easy-btn" onclick="window.open('${esc(i.apply_url || 'https://www.bokjiro.go.kr')}','_blank')">자세히 ↗</button>
          </div>
          <div class="intr-act-row">
            <button class="intr-act consult" onclick="_stratConsult('${_jsStr(id)}')">📞 도움 필요</button>
            <label class="intr-act cal">📅 일정 등록<input type="date" min="${today}" onchange="_stratSchedule('${_jsStr(id)}', this.value)"></label>
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

// ── 도움 필요(상담 요청) ──────────────────────────────────────────────
function _stratConsult(id) {
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) return;
  const items = _navGetConsult();
  if (items.find(x => x.name === it.name)) { toast('이미 도움을 요청했어요', 'info'); return; }
  items.push({ id: Date.now(), name: it.name, amount: it.amount || '', desc: it.description || '', agency: it.agency || '', apply_url: it.apply_url || '' });
  _navSetConsult(items);
  toast('도움 요청이 등록됐어요 📞 담당자가 안내해드려요', 'success');
}

// ── 일정 등록(캘린더) ─────────────────────────────────────────────────
function _stratSchedule(id, date) {
  if (!date) return;
  const it = _stratInterests().find(x => (x.service_id || x.name) === id);
  if (!it) return;
  const items = _navGetSchedule();
  if (items.find(x => x.name === it.name && x.date === date)) { toast('이미 등록된 일정이에요', 'info'); return; }
  items.push({ id: Date.now(), name: it.name, amount: it.amount || '', desc: it.description || '', date });
  _navSetSchedule(items);
  toast('캘린더에 일정을 등록했어요 📅', 'success');
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

// ── 레이더차트 (영역별 개수) ──────────────────────────────────────────
function _drawAreaRadar(counts) {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;
  if (_radarChart) { _radarChart.destroy(); _radarChart = null; }

  const labels = STRAT_AREAS;
  const values = labels.map(a => counts[a] || 0);
  const maxV = Math.max(3, ...values);

  _radarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '관심 혜택 수',
        data: values,
        backgroundColor: 'rgba(169,156,255,.2)',
        borderColor: '#a99cff',
        borderWidth: 2,
        pointBackgroundColor: '#a99cff',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: maxV,
          ticks: { display: true, stepSize: 1, precision: 0, color: '#8a8f98', backdropColor: 'transparent', z: 1 },
          grid: { color: 'rgba(255,255,255,.08)' },
          angleLines: { color: 'rgba(255,255,255,.08)' },
          pointLabels: { color: '#A0AEBB', font: { size: 12, weight: '700' } },
        },
      },
    },
  });
}
