'use strict';
// ══════════════════════════════════════════════════════════════════════
//  strategy.js — AI 전략보드 (산점도 · 레이더 · 복지 네비게이션)
// ══════════════════════════════════════════════════════════════════════

let _scatterChart = null;
let _radarChart = null;

function renderStrategy() {
  const el = document.getElementById('page-strategy');
  if (!el) return;

  const data = _dashStrategyCache;

  el.innerHTML = `
    <div style="padding:16px 16px 0">
      <div style="font-size:1.1rem;font-weight:900;margin-bottom:4px">📊 AI 전략보드</div>
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px">
        ${data ? 'AI가 분석한 맞춤 혜택 전략이에요!' : '정보를 입력하면 전략이 생성됩니다'}
      </div>
    </div>

    <div class="strategy-section">

      ${_renderInterestList()}

      ${data?.presented_text ? `
        <!-- AI 요약 -->
        <div class="card" style="background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.3)">
          <div class="chart-title">🤖 AI 맞춤 혜택 요약</div>
          <div style="font-size:.85rem;color:var(--text);line-height:1.8">
            ${esc(data.presented_text)
              .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
              .replace(/\n/g, '<br>')
              .replace(/^#{1,3} (.*)/gm, '<div style="font-weight:900;margin:8px 0 4px">$1</div>')
              .replace(/^\* /gm, '• ')}
          </div>
          ${data.urgent_actions?.length ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <div style="font-size:.75rem;font-weight:700;color:var(--warn);margin-bottom:6px">⚡ 지금 해야 할 일 →</div>
              ${data.urgent_actions.map((a, i) => `
                <div style="display:flex;gap:8px;margin-bottom:6px;font-size:.83rem">
                  <span style="color:var(--primary);font-weight:700;flex-shrink:0">${i+1}.</span>
                  <span>${esc(a)}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>` : data?.loading ? `
        <div class="card" style="text-align:center;padding:24px">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:.85rem;color:var(--text-muted)">복지 DB 조회 중...</div>
        </div>` : ''}

      <!-- 긴급도·영향력 산점도 -->
      <div class="chart-wrap">
        <div class="chart-title">📈 긴급도·영향력 산점도</div>
        <div style="position:relative;height:260px">
          <canvas id="scatter-chart"></canvas>
        </div>
        <div class="scatter-legend">
          <div class="scatter-legend-item"><div class="scatter-legend-dot" style="background:#FF5252"></div>임박 마감</div>
          <div class="scatter-legend-item"><div class="scatter-legend-dot" style="background:#FF9800"></div>이번달 마감</div>
          <div class="scatter-legend-item"><div class="scatter-legend-dot" style="background:#00C896"></div>여유있음</div>
        </div>
      </div>

      <!-- 복지 네비게이션 칸반 -->
      <div class="chart-wrap">
        <div class="chart-title">🧭 복지 네비게이션</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px">
          📞 상담 요청하거나 📅 날짜를 지정해 캘린더에 등록하세요
        </div>
        ${_renderNavKanban(data?.benefits || [])}
      </div>

      <!-- 레이더 차트 -->
      <div class="chart-wrap">
        <div class="chart-title">🎯 복지 보장범위 레이더차트</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px">색칠된 영역이 넓을수록 보장 완비</div>
        <div class="radar-wrap">
          <canvas id="radar-chart"></canvas>
        </div>
      </div>

      <!-- 전체 혜택 목록 -->
      ${data?.benefits?.length ? `
        <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px">전체 혜택 목록 (${data.benefits.length}개)</div>
        ${data.benefits.map(b => `
          <div class="card" style="padding:14px">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="font-size:1.3rem;flex-shrink:0">${_dashCatIcon(b.category)}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                  <span style="font-weight:700;font-size:.9rem">${esc(b.name)}</span>
                  <span class="badge ${b.category === '주거지원' ? 'badge-purple' : 'badge-green'}" style="font-size:.65rem">${esc(b.category)}</span>
                </div>
                <div style="font-size:.83rem;color:var(--primary);font-weight:700;margin-bottom:3px">${esc(b.amount)}</div>
                <div style="font-size:.78rem;color:var(--text-muted)">${esc(b.description)}</div>
                <div style="font-size:.75rem;color:var(--text-dim);margin-top:4px">📌 ${esc(b.how_to_apply)}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
                <div style="font-size:.65rem;font-weight:700;color:${b.urgency>=8?'var(--danger)':b.urgency>=5?'var(--warn)':'var(--primary)'}">긴급 ${b.urgency}</div>
                <div style="font-size:.65rem;font-weight:700;color:var(--accent)">영향 ${b.impact}</div>
                <button style="font-size:.72rem;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer" onclick="window.open('${esc(b.apply_url||'https://www.bokjiro.go.kr')}','_blank')">신청</button>
              </div>
            </div>
          </div>`).join('')}` : `
        <div style="text-align:center;padding:32px 16px">
          <div style="font-size:2.5rem;margin-bottom:12px">📊</div>
          <div style="font-weight:700;margin-bottom:8px">전략 분석 데이터 없어요</div>
          <button class="btn btn-primary" onclick="loadStrategy()">🤖 AI 분석 시작</button>
        </div>`}

      <div style="height:16px"></div>
    </div>
  `;

  // 차트 그리기
  setTimeout(() => {
    _drawScatterChart(data?.benefits || []);
    _drawRadarChart(data?.radar_scores || {});
  }, 100);
}

// ── 내 관심 혜택 (대시보드에서 ⭐관심으로 넘어온 항목) ────────────────
function _renderInterestList() {
  let items = [];
  try { items = JSON.parse(localStorage.getItem('welfare_interests') || '[]'); } catch {}
  if (!items.length) {
    return `
      <div class="card" style="text-align:center;padding:20px 16px;border-style:dashed">
        <div style="font-size:1.6rem;margin-bottom:6px">⭐</div>
        <div style="font-weight:700;font-size:.88rem;margin-bottom:4px">아직 관심 혜택이 없어요</div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">홈에서 혜택에 <b style="color:var(--accent)">⭐ 관심</b>을 표시하면 여기에 모여요</div>
        <button class="btn btn-outline" onclick="navigateTo('dashboard')">홈에서 혜택 보기 →</button>
      </div>`;
  }
  return `
    <div class="card" style="border-color:var(--accent);background:rgba(169,156,255,.08)">
      <div class="chart-title" style="color:var(--accent)">⭐ 내 관심 혜택 (${items.length})</div>
      ${items.map(b => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--border)">
          <div style="font-size:1.3rem;flex-shrink:0">${_dashCatIcon(b.category)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.88rem">${esc(b.name)}</div>
            <div style="font-size:.8rem;color:var(--primary);font-weight:700">${esc(b.amount || '')}</div>
            <div style="font-size:.74rem;color:var(--text-muted)">${esc(b.agency || '')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
            <button class="nav-zone-del" title="관심 해제" onclick="_stratRemoveInterest('${_jsStr(b.service_id || b.name)}')">✕</button>
            <button style="font-size:.72rem;padding:4px 9px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer" onclick="window.open('${esc(b.apply_url || 'https://www.bokjiro.go.kr')}','_blank')">신청</button>
          </div>
        </div>`).join('')}
    </div>`;
}
function _stratRemoveInterest(id) {
  let interests = [];
  try { interests = JSON.parse(localStorage.getItem('welfare_interests') || '[]'); } catch {}
  interests = interests.filter(i => (i.service_id || i.name) !== id);
  localStorage.setItem('welfare_interests', JSON.stringify(interests));
  let status = {};
  try { status = JSON.parse(localStorage.getItem('welfare_status') || '{}'); } catch {}
  if (status[id] === 'interested') { delete status[id]; localStorage.setItem('welfare_status', JSON.stringify(status)); }
  toast('관심 해제했어요');
  renderStrategy();
}

// ── 복지 네비게이션 칸반 ─────────────────────────────────────────────
function _navGetConsult() {
  try { return JSON.parse(localStorage.getItem('welfare_consult') || '[]'); } catch { return []; }
}
function _navSetConsult(items) {
  try { localStorage.setItem('welfare_consult', JSON.stringify(items)); } catch {}
}
function _navGetSchedule() {
  try { return JSON.parse(localStorage.getItem('welfare_schedule') || '[]'); } catch { return []; }
}
function _navSetSchedule(items) {
  try { localStorage.setItem('welfare_schedule', JSON.stringify(items)); } catch {}
}

function _navToConsult(idx) {
  const b = _dashStrategyCache?.benefits?.[idx];
  if (!b) return;
  const items = _navGetConsult();
  if (items.find(i => i.name === b.name)) { toast('이미 상담 요청됐어요', 'info'); return; }
  items.push({ id: Date.now(), name: b.name, amount: b.amount, desc: b.description, agency: b.agency || '', apply_url: b.apply_url || '' });
  _navSetConsult(items);
  toast('상담 요청이 등록됐어요 📞', 'success');
  renderStrategy();
}

function _navToSchedule(idx, date) {
  if (!date) return;
  const b = _dashStrategyCache?.benefits?.[idx];
  if (!b) return;
  const items = _navGetSchedule();
  if (items.find(i => i.name === b.name)) { toast('이미 일정이 등록됐어요', 'info'); return; }
  items.push({ id: Date.now(), name: b.name, amount: b.amount, desc: b.description || '', date });
  _navSetSchedule(items);
  toast('캘린더에 일정이 추가됐어요 📅', 'success');
  renderStrategy();
}

function _navRemoveConsult(id) {
  _navSetConsult(_navGetConsult().filter(i => i.id !== id));
  renderStrategy();
}
function _navRemoveSchedule(id) {
  _navSetSchedule(_navGetSchedule().filter(i => i.id !== id));
  renderStrategy();
}

function _renderNavKanban(benefits) {
  if (!benefits.length) {
    return `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:.83rem">혜택 분석 후 표시됩니다</div>`;
  }
  const consultItems  = _navGetConsult();
  const scheduleItems = _navGetSchedule();
  const consultNames  = new Set(consultItems.map(i => i.name));
  const schedNames    = new Set(scheduleItems.map(i => i.name));
  const today = new Date().toISOString().split('T')[0];

  // 아직 존(zone)에 없는 혜택만 목록에 표시 (최대 8개)
  const available = benefits
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => !consultNames.has(b.name) && !schedNames.has(b.name))
    .slice(0, 8);

  return `
    <!-- 신청 가능 혜택 목록 -->
    <div style="margin-bottom:4px">
      ${available.length ? available.map(({ b, idx }) => `
        <div class="nav-avail-item">
          <div class="nav-avail-info">
            <div class="nav-avail-name">${esc(b.name)}</div>
            <div class="nav-avail-amount">${esc(b.amount)}</div>
          </div>
          <div class="nav-avail-actions">
            <button class="nav-action-btn" title="상담 요청" onclick="_navToConsult(${idx})">📞</button>
            <label class="nav-date-btn" title="캘린더 일정 등록">
              📅<input type="date" min="${today}" onchange="_navToSchedule(${idx}, this.value)">
            </label>
          </div>
        </div>`).join('') : `
        <div style="text-align:center;padding:12px 0;font-size:.8rem;color:var(--text-muted)">
          ${benefits.length ? '모든 혜택이 존에 배치됐어요 ✓' : '혜택 분석 후 표시됩니다'}
        </div>`}
    </div>

    <!-- 두 존(상담 요청 / 일정 등록) -->
    <div class="nav-zone-row">
      <!-- 상담 요청 존 -->
      <div class="nav-zone consult">
        <div class="nav-zone-header" style="color:#9b8afb">📞 상담 요청</div>
        ${consultItems.length ? consultItems.map(item => `
          <div class="nav-zone-card">
            <div style="flex:1;min-width:0">
              <div class="nav-zone-card-name">${esc(item.name)}</div>
              <div class="nav-zone-card-sub">${esc(item.amount)}</div>
            </div>
            <button class="nav-zone-del" onclick="_navRemoveConsult(${item.id})">✕</button>
          </div>`).join('') : `
          <div class="nav-zone-empty">📞 버튼으로<br>이동하면<br>담당자가 연락해요</div>`}
      </div>

      <!-- 일정 등록 존 -->
      <div class="nav-zone cal-zone">
        <div class="nav-zone-header" style="color:var(--primary)">📅 일정 등록</div>
        ${scheduleItems.length ? scheduleItems.map(item => `
          <div class="nav-zone-card">
            <div style="flex:1;min-width:0">
              <div class="nav-zone-card-name">${esc(item.name)}</div>
              <div class="nav-zone-card-sub">${esc(item.date)}</div>
            </div>
            <button class="nav-zone-del" onclick="_navRemoveSchedule(${item.id})">✕</button>
          </div>`).join('') : `
          <div class="nav-zone-empty">📅 날짜 선택으로<br>이동하면<br>캘린더에 등록돼요</div>`}
      </div>
    </div>
    <div style="font-size:.68rem;color:var(--text-dim);margin-top:10px;text-align:center;line-height:1.6">
      상담 요청 시 지자체 공무원·상담사가 내용을 확인하고 연락드립니다
    </div>
  `;
}

// ── 산점도 (긴급도·영향력) ──────────────────────────────────────────
function _drawScatterChart(benefits) {
  const canvas = document.getElementById('scatter-chart');
  if (!canvas) return;
  if (_scatterChart) { _scatterChart.destroy(); _scatterChart = null; }

  const points = benefits.map(b => ({
    x: b.urgency,
    y: b.impact,
    label: b.name,
    color: b.urgency >= 8 ? '#FF5252' : b.urgency >= 5 ? '#FF9800' : '#00C896',
  }));

  _scatterChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: '혜택',
        data: points.map(p => ({ x: p.x, y: p.y })),
        pointBackgroundColor: points.map(p => p.color),
        pointRadius: 10,
        pointHoverRadius: 13,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => points[ctx.dataIndex]?.label || '',
          },
        },
      },
      scales: {
        x: {
          min: 0, max: 10,
          title: { display: true, text: '긴급도', color: '#A0AEBB', font: { size: 11 } },
          ticks: { color: '#6B7685', stepSize: 2 },
          grid: { color: 'rgba(255,255,255,.05)' },
        },
        y: {
          min: 0, max: 10,
          title: { display: true, text: '영향력', color: '#A0AEBB', font: { size: 11 } },
          ticks: { color: '#6B7685', stepSize: 2 },
          grid: { color: 'rgba(255,255,255,.05)' },
        },
      },
    },
  });

  // 라벨 툴팁 헬퍼
  if (points.length) {
    canvas.onclick = (e) => {
      const pts = _scatterChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
      if (pts.length) toast(points[pts[0].index]?.label || '', 'info', 2000);
    };
  }
}

// ── 레이더 차트 ────────────────────────────────────────────────────
function _drawRadarChart(scores) {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;
  if (_radarChart) { _radarChart.destroy(); _radarChart = null; }

  const labels = ['주거지원', '생활지원', '의료지원', '교육지원', '취업지원', '돌봄지원'];
  const values = labels.map(l => scores[l] || 0);

  _radarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '보장범위',
        data: values,
        backgroundColor: 'rgba(0,200,150,.2)',
        borderColor: '#00C896',
        borderWidth: 2,
        pointBackgroundColor: '#00C896',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(255,255,255,.08)' },
          angleLines: { color: 'rgba(255,255,255,.08)' },
          pointLabels: { color: '#A0AEBB', font: { size: 11, weight: '700' } },
        },
      },
    },
  });
}
