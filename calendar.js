'use strict';
// ══════════════════════════════════════════════════════════════════════
//  calendar.js — AI 혜택 마감 캘린더 + PWA 푸시 알림
// ══════════════════════════════════════════════════════════════════════

let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-indexed

function renderCalendar() {
  const el = document.getElementById('page-calendar');
  if (!el) return;

  const events = _calBuildEvents();
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

    <!-- 이번 달 이벤트 목록 -->
    <div style="padding:16px 16px 0">
      <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px">이번 달 마감 혜택</div>
    </div>
    <div class="event-list" id="event-list">
      ${_renderEventList(events)}
    </div>

    <!-- 푸시 알림 설정 -->
    <div style="padding:16px">
      <div class="card" style="background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.3)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:1.5rem">🔔</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:3px">마감 알림 받기</div>
            <div style="font-size:.78rem;color:var(--text-muted)">마감 3일 전에 푸시 알림을 보내드려요</div>
          </div>
          <button class="btn btn-outline" style="padding:8px 14px;font-size:.8rem" onclick="requestPushPermission()">
            설정
          </button>
        </div>
      </div>
    </div>

    <div style="height:16px"></div>
  `;
}

function _calPrevMonth() {
  _calMonth--;
  if (_calMonth < 0) { _calMonth = 11; _calYear--; }
  renderCalendar();
}
function _calNextMonth() {
  _calMonth++;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
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

  let html = '';
  // 첫 주 빈칸
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  // 날짜
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === _calYear && today.getMonth() === _calMonth && today.getDate() === d;
    const hasEvent = eventDays.has(d);
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}">${d}</div>`;
  }
  return html;
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
