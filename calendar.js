'use strict';
// ══════════════════════════════════════════════════════════════════════
//  calendar.js — AI 혜택 마감 캘린더 + PWA 푸시 알림
// ══════════════════════════════════════════════════════════════════════

let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-indexed
let _calSelectedDate = null;           // 선택한 날짜(YYYY-MM-DD) → 목록 필터

function renderCalendar() {
  const el = document.getElementById('page-calendar');
  if (!el) return;

  const events = _calBuildEvents();
  const pushOn = localStorage.getItem('push_enabled') === '1';
  el.innerHTML = `
    <div style="padding:16px 16px 0">
      <div style="font-size:1.1rem;font-weight:900;margin-bottom:4px">📅 AI 혜택 캘린더</div>
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:0">신청 마감일 · 지급일 알림</div>
    </div>

    <!-- 월 이동 -->
    <div class="calendar-header">
      <button style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;cursor:pointer;padding:4px 8px" onclick="_calPrevMonth()">‹</button>
      <div style="font-weight:900;font-size:1rem">${_calYear}년 ${_calMonth + 1}월</div>
      <button style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;cursor:pointer;padding:4px 8px" onclick="_calNextMonth()">›</button>
    </div>

    <!-- 달력 그리드 -->
    <div class="calendar-grid">
      ${['일','월','화','수','목','금','토'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
      ${_renderCalGrid(events)}
    </div>

    <!-- 내가 등록한 복지 혜택 목록 -->
    <div style="padding:16px 16px 0;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:.75rem;font-weight:700;color:var(--text-muted)">📌 내가 등록한 복지 혜택</div>
      <button style="font-size:.7rem;background:none;border:none;color:var(--primary);font-weight:700;cursor:pointer" onclick="navigateTo('dashboard')">+ 추가</button>
    </div>
    <div class="event-list" id="event-list">
      ${_renderMyList()}
    </div>

    <!-- 푸시 알림 테스트 -->
    <div style="padding:16px">
      <div class="card" style="background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.3)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:${pushOn ? '10px' : '0'}">
          <div style="font-size:1.5rem">🔔</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:3px">푸시 알림</div>
            <div style="font-size:.78rem;color:var(--text-muted)">알림을 켜고 테스트해보세요</div>
          </div>
          <div class="seg">
            <button class="btn btn-sm ${pushOn ? 'btn-primary' : 'btn-outline'}" onclick="setPush(true)">ON</button>
            <button class="btn btn-sm ${!pushOn ? 'btn-primary' : 'btn-outline'}" onclick="setPush(false)">OFF</button>
          </div>
        </div>
        ${pushOn ? `<button class="btn btn-outline btn-full" onclick="sendTestPush()">🧪 테스트 알림 보내기</button>` : ''}
      </div>
    </div>

    <div style="height:16px"></div>
  `;
}

function _calPrevMonth() {
  _calMonth--;
  if (_calMonth < 0) { _calMonth = 11; _calYear--; }
  _calSelectedDate = null;
  renderCalendar();
}
function _calNextMonth() {
  _calMonth++;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  _calSelectedDate = null;
  renderCalendar();
}

function _calBuildEvents() {
  const benefits = _dashStrategyCache?.benefits || [];
  const events = [];
  const today = new Date();

  // 혜택 마감일 기반 이벤트
  benefits.forEach(b => {
    if (b.deadline) {
      const d = new Date(b.deadline);
      if (!isNaN(d)) {
        const daysLeft = Math.ceil((d - today) / 86400000);
        events.push({
          date: d, label: b.name,
          type: daysLeft <= 7 ? 'urgent' : 'deadline',
          desc: `마감 D-${daysLeft > 0 ? daysLeft : 0} · ${b.amount}`,
          color: daysLeft <= 7 ? '#FF5252' : '#FF9800',
        });
      }
    }
  });

  // 사용자가 전략보드에서 등록한 일정
  try {
    const scheduled = JSON.parse(localStorage.getItem('welfare_schedule') || '[]');
    scheduled.forEach(s => {
      if (!s.date) return;
      const d = new Date(s.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        events.push({
          date: d, label: s.name,
          type: 'welfare_plan',
          desc: `직접 등록 · ${s.amount || s.desc || ''}`.replace(/·\s*$/, '').trim(),
          color: '#2eaadc',
        });
      }
    });
  } catch {}

  // 기본 법정 마감일 (항상 표시)
  const year = _calYear;
  [
    { month: 0, day: 31, label: '기초연금 신청 마감', desc: '65세 이상 · 주민센터', color: '#6366F1' },
    { month: 2, day: 31, label: '에너지바우처 신청', desc: '취약계층 · 읍면동 주민센터', color: '#3B82F6' },
    { month: 5, day: 30, label: '주거급여 신청 마감', desc: '중위소득 48% 이하', color: '#00C896' },
    { month: 8, day: 30, label: '국민취업지원제도', desc: '15~69세 구직자', color: '#F59E0B' },
    { month: 11, day: 31, label: '자활근로 신청', desc: '기초수급자 대상', color: '#EC4899' },
  ].forEach(e => events.push({ date: new Date(year, e.month, e.day), label: e.label, type: 'fixed', desc: e.desc, color: e.color }));

  return events.sort((a, b) => a.date - b.date);
}

function _renderCalGrid(events) {
  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const today = new Date();

  const eventDays = new Set(
    events.filter(e => e.date.getFullYear() === _calYear && e.date.getMonth() === _calMonth)
          .map(e => e.date.getDate())
  );
  // 내가 등록한 복지 일정이 있는 날 (강조 + 클릭 필터 대상)
  const planDays = new Set(
    _loadSchedule()
      .map(s => new Date(s.date + 'T00:00:00'))
      .filter(d => !isNaN(d.getTime()) && d.getFullYear() === _calYear && d.getMonth() === _calMonth)
      .map(d => d.getDate())
  );

  let html = '';
  // 첫 주 빈칸
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  // 날짜
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === _calYear && today.getMonth() === _calMonth && today.getDate() === d;
    const hasPlan = planDays.has(d);
    const hasEvent = eventDays.has(d) && !hasPlan;
    const dateStr = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const sel = _calSelectedDate === dateStr;
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasPlan ? 'has-plan' : ''} ${hasEvent ? 'has-event' : ''} ${sel ? 'selected' : ''}" onclick="_calSelectDay('${dateStr}')">${d}</div>`;
  }
  return html;
}

// 날짜 클릭 → 목록 필터 토글
function _calSelectDay(dateStr) {
  _calSelectedDate = (_calSelectedDate === dateStr) ? null : dateStr;
  renderCalendar();
}
function _calClearSelect() {
  _calSelectedDate = null;
  renderCalendar();
}

// ── 내가 캘린더에 등록한 복지 혜택 목록 ───────────────────────────────
function _renderMyList() {
  let list = _loadSchedule().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (_calSelectedDate) list = list.filter(s => s.date === _calSelectedDate);

  const banner = _calSelectedDate
    ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px">
         <span style="font-size:.82rem;font-weight:800;color:var(--primary)">📅 ${_calSelectedDate} 일정</span>
         <button style="font-size:.74rem;background:none;border:none;color:var(--text-muted);cursor:pointer" onclick="_calClearSelect()">전체 보기 ✕</button>
       </div>` : '';

  if (!list.length) {
    return banner + `<div style="text-align:center;padding:28px 16px;color:var(--text-muted);font-size:.83rem">
      ${_calSelectedDate ? '이 날짜에 등록된 복지 일정이 없어요' : '아직 등록한 복지 혜택이 없어요'}<br>
      <button class="btn btn-outline" style="margin-top:14px" onclick="${_calSelectedDate ? '_calClearSelect()' : "navigateTo('dashboard')"}">${_calSelectedDate ? '전체 보기' : '홈에서 혜택 추가하기 →'}</button>
    </div>`;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return banner + list.map(s => {
    const d = new Date(s.date + 'T00:00:00');
    const days = Math.ceil((d - today) / 86400000);
    const dleft = isNaN(days) ? '' : (days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : `지남`);
    const timeTxt  = s.time ? `🕘 ${s.time}` : '';
    const memo     = [timeTxt, s.memo || s.desc].filter(Boolean).join(' · ') || '직접 등록';
    const alarmTxt = s.alarm === 'same' ? '🔔 당일' : s.alarm === 'prev' ? '🔔 전날' : '';
    return `
    <div class="event-item">
      <div class="event-date-badge">
        <div class="event-day">${d.getDate()}</div>
        <div class="event-month">${d.getMonth() + 1}월</div>
      </div>
      <div style="flex:1">
        <div class="event-title" style="color:#2eaadc">${esc(s.name)}</div>
        <div class="event-desc">${esc(memo)}</div>
        ${alarmTxt ? `<div style="font-size:.7rem;color:var(--accent);font-weight:700;margin-top:2px">${alarmTxt} 알림</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="badge ${days < 0 ? 'badge-purple' : days <= 7 ? 'badge-red' : 'badge-green'}" style="font-size:.65rem">${dleft}</div>
        <button onclick="_calRemoveSchedule('${encodeURIComponent(s.date)}','${encodeURIComponent(s.name)}')"
          style="background:none;border:none;color:var(--text-dim);font-size:1rem;cursor:pointer;padding:0 2px" title="삭제">🗑️</button>
      </div>
    </div>`;
  }).join('');
}
function _calRemoveSchedule(dateEnc, nameEnc) {
  const date = decodeURIComponent(dateEnc), name = decodeURIComponent(nameEnc);
  const list = _loadSchedule().filter(s => !(s.date === date && s.name === name));
  localStorage.setItem('welfare_schedule', JSON.stringify(list));
  renderCalendar();
  toast('일정을 삭제했어요');
}

function _renderEventList(events) {
  const thisMonth = events.filter(e => e.date.getFullYear() === _calYear && e.date.getMonth() === _calMonth);
  if (!thisMonth.length) return `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:.83rem">이달 마감 일정이 없어요</div>`;

  return thisMonth.map(e => `
    <div class="event-item">
      <div class="event-date-badge">
        <div class="event-day">${e.date.getDate()}</div>
        <div class="event-month">${e.date.getMonth()+1}월</div>
      </div>
      <div style="flex:1">
        <div class="event-title" style="color:${e.color}">${esc(e.label)}</div>
        <div class="event-desc">${esc(e.desc)}</div>
      </div>
      <div class="badge ${e.type==='urgent'?'badge-red':e.type==='deadline'?'badge-yellow':e.type==='welfare_plan'?'badge-green':'badge-purple'}" style="font-size:.65rem;align-self:flex-start">
        ${e.type==='urgent'?'긴급':e.type==='deadline'?'마감':e.type==='welfare_plan'?'예정':'정기'}
      </div>
    </div>`).join('');
}
