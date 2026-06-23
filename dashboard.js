'use strict';
// ══════════════════════════════════════════════════════════════════════
//  dashboard.js — 메인 대시보드 (홈)
// ══════════════════════════════════════════════════════════════════════

let _dashStrategyCache = null;

// ── 사용자 액션 저장소 (신청 도움 요청 / 캘린더 등록) ──────────────────
function _loadSchedule() { try { return JSON.parse(localStorage.getItem('welfare_schedule') || '[]'); } catch { return []; } }
function _loadHelpReqs() { try { return JSON.parse(localStorage.getItem('benefit_help_requests') || '[]'); } catch { return []; } }
function _dashHelpSet()  { return new Set(_loadHelpReqs().map(r => r.benefit_name)); }
function _dashCalSet()   { return new Set(_loadSchedule().map(s => s.name)); }
function _jsStr(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' '); }
function _dateToInput(d) { const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function _endOfMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0); }

function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  if (!el) return;

  const p = MY_PROFILE;
  const age = p?.birth_year ? new Date().getFullYear() - p.birth_year : null;
  const name = age ? `${age}세 ${p.gender === 'female' ? '여성' : '남성'}` : '사용자';
  const region = p?.district || p?.region || '지역 미입력';
  const benefits = _dashStrategyCache?.benefits || [];
  const statusMap = _wsLoadStatus();
  const cnt = { receiving: 0, interested: 0, not_interested: 0 };
  benefits.forEach(b => { const s = statusMap[b.service_id]; if (s) cnt[s]++; });

  el.innerHTML = `
    <!-- 히어로 -->
    <div class="dashboard-hero">
      <div class="hero-greeting">안녕하세요 👋</div>
      <div class="hero-title">${esc(name)} · ${esc(region)}<br>정보로 찾은 복지 혜택이에요</div>
    </div>

    <div class="page-pad" style="padding-top:16px">

      ${!p?.onboarding_done ? `
        <!-- 온보딩 안내 -->
        <div class="card" style="background:rgba(0,200,150,.08);border-color:var(--border-strong);cursor:pointer" onclick="navigateTo('wizard')">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:2rem">📝</div>
            <div style="flex:1">
              <div style="font-weight:700;margin-bottom:4px">정보를 먼저 입력해주세요</div>
              <div style="font-size:.8rem;color:var(--text-muted)">2분이면 완료돼요 · 맞춤 혜택을 찾아드립니다</div>
            </div>
            <div style="color:var(--primary);font-size:1.2rem">›</div>
          </div>
        </div>` : ''}

      <!-- 복지로 맞춤 혜택 -->
      <div class="section-title">🏛️ 내 정보 기반 복지 혜택 (복지로)</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;line-height:1.6">
        각 혜택을 보고 <b style="color:var(--primary)">받는 중</b> · <b style="color:var(--accent)">관심</b> · 관심없음을 표시해 주세요.<br>
        ⭐ 관심 표시한 혜택은 <b>전략보드</b>에 모여요.
      </div>
      ${(cnt.receiving || cnt.interested) ? `
        <div style="display:flex;gap:8px;margin-bottom:10px;font-size:.74rem">
          <span class="badge badge-green">✅ 받는 중 ${cnt.receiving}</span>
          <span class="badge badge-purple">⭐ 관심 ${cnt.interested}</span>
          ${cnt.interested ? `<button style="margin-left:auto;font-size:.72rem;background:none;border:none;color:var(--accent);font-weight:700;cursor:pointer" onclick="navigateTo('strategy')">전략보드 →</button>` : ''}
        </div>` : ''}

      ${benefits.length > 0 ? benefits.map(b => {
        const sid = b.service_id || b.name;
        const st = statusMap[sid] || '';
        return `
        <div class="card welfare-card ${st==='not_interested'?'dim':''}" style="padding:14px">
          <div style="display:flex;gap:10px">
            <div class="benefit-icon" style="background:${_dashCatColor(b.category)}20;flex-shrink:0">${_dashCatIcon(b.category)}</div>
            <div style="flex:1;min-width:0">
              <div class="benefit-name">${esc(b.name)}</div>
              <div class="benefit-amount">${esc(b.amount)}</div>
              <div class="benefit-how">${esc(b.description)}</div>
              <div style="font-size:.7rem;color:var(--text-dim);margin-top:4px">${esc(b.agency || '')}${b.dept ? ' · ' + esc(b.dept) : ''}</div>
            </div>
          </div>
          <div class="ws-status-row">
            <button class="ws-btn recv ${st==='receiving'?'on':''}" onclick="setBenefitStatus('${_jsStr(sid)}','receiving')">✅ 받는 중</button>
            <button class="ws-btn intr ${st==='interested'?'on':''}" onclick="setBenefitStatus('${_jsStr(sid)}','interested')">⭐ 관심</button>
            <button class="ws-btn noint ${st==='not_interested'?'on':''}" onclick="setBenefitStatus('${_jsStr(sid)}','not_interested')">✖ 관심없음</button>
          </div>
          <div style="text-align:right;margin-top:6px">
            <button class="ws-detail" onclick="window.open('${esc(b.apply_url || 'https://www.bokjiro.go.kr')}','_blank')">자세히 보기 →</button>
          </div>
        </div>`;
      }).join('') : `
        <div class="card" style="text-align:center;padding:32px 16px">
          ${_dashStrategyCache?.loading ? `
            <div class="spinner" style="margin:0 auto 12px"></div>
            <div style="font-weight:700;margin-bottom:4px">복지로에서 맞춤 혜택을 찾고 있어요</div>
            <div style="font-size:.8rem;color:var(--text-muted)">잠시만 기다려주세요</div>
          ` : _dashStrategyCache?.error ? `
            <div style="font-size:2rem;margin-bottom:8px">⚠️</div>
            <div style="font-weight:700;margin-bottom:8px">혜택을 불러오지 못했어요</div>
            <button class="btn btn-primary" onclick="loadWelfareList()">다시 시도</button>
          ` : `
            <div style="font-size:2.5rem;margin-bottom:12px">🔍</div>
            <div style="font-weight:700;margin-bottom:8px">맞춤 혜택을 찾아드릴게요</div>
            <div style="font-size:.83rem;color:var(--text-muted);margin-bottom:16px">정보 입력 후 복지로 혜택을 조회합니다</div>
            <button class="btn btn-primary" onclick="${p?.onboarding_done ? 'loadWelfareList()' : 'navigateTo(\'wizard\')'}">
              ${p?.onboarding_done ? '🔄 혜택 불러오기' : '정보 입력하기'}
            </button>
          `}
        </div>`}

      <!-- AI 채팅 빠른 접근 -->
      <div class="section-title">💬 AI에게 물어보세요</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${['출산 후 받을 수 있는 혜택 알려줘', '월세 지원 혜택 있어?', '취업 준비 중인데 받을 수 있는 혜택은?'].map(q => `
          <button class="card" style="text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px;padding:14px" onclick="chatQuickQuery('${esc(q)}')">
            <span style="font-size:1.1rem">💬</span>
            <span style="font-size:.85rem;font-weight:600">${esc(q)}</span>
            <span style="margin-left:auto;color:var(--text-dim)">›</span>
          </button>`).join('')}
      </div>

      <div style="height:16px"></div>
    </div>
  `;

  // 혜택 데이터 없으면 복지로 API로 자동 로드
  if (!_dashStrategyCache && p?.onboarding_done) loadWelfareList();
}

// ── 혜택 상태 저장소 (받는중 / 관심 / 관심없음) ──────────────────────
function _wsLoadStatus()    { try { return JSON.parse(localStorage.getItem('welfare_status') || '{}'); } catch { return {}; } }
function _wsSaveStatus(o)   { try { localStorage.setItem('welfare_status', JSON.stringify(o)); } catch {} }
function _wsLoadInterests() { try { return JSON.parse(localStorage.getItem('welfare_interests') || '[]'); } catch { return []; } }
function _wsSaveInterests(a){ try { localStorage.setItem('welfare_interests', JSON.stringify(a)); } catch {} }

// 혜택 상태 설정 (같은 버튼 다시 누르면 해제)
function setBenefitStatus(serviceId, status) {
  const map = _wsLoadStatus();
  const next = (map[serviceId] === status) ? null : status;
  if (next) map[serviceId] = next; else delete map[serviceId];
  _wsSaveStatus(map);

  // 관심 목록(전략보드용) 동기화
  const b = (_dashStrategyCache?.benefits || []).find(x => (x.service_id || x.name) === serviceId);
  let interests = _wsLoadInterests().filter(i => (i.service_id || i.name) !== serviceId);
  if (next === 'interested' && b) interests.push(b);
  _wsSaveInterests(interests);

  if (next === 'interested')          toast('⭐ 전략보드에 추가했어요', 'success');
  else if (next === 'receiving')      toast('이미 받고 있는 혜택으로 표시했어요');
  else if (next === 'not_interested') toast('관심 없음으로 표시했어요');
  else                                toast('표시를 해제했어요');

  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'strategy')  renderStrategy();
}

// ── 복지로(gov24) API에서 프로필 기반 혜택 목록 로드 ──────────────────
async function loadWelfareList() {
  if (!MY_PROFILE?.onboarding_done) return;
  _dashStrategyCache = { loading: true };
  if (currentPage === 'dashboard') renderDashboard();

  try {
    const res = await fetch('/api/welfare-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_profile: { ...MY_PROFILE } }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const benefits = (data.services || []).map((s, i) => ({
      service_id:   s.id || s.name,
      name:         s.name,
      category:     _fieldToCategory(s.field, s.name),
      description:  _fmtContent(s.content, 280),
      content_full: [s.content, s.target ? `\n\n[지원대상] ${s.target}` : '', s.method ? `\n[신청방법] ${s.method}` : '']
                      .filter(Boolean).join('').replace(/\r\n|\r/g, '\n').slice(0, 600),
      amount:       _extractAmount(s.content),
      urgency:      Math.max(1, Math.min(9, 9 - Math.floor(i / 5))),
      impact:       7,
      deadline:     null,
      how_to_apply: s.method || '',
      apply_url:    s.url || 'https://www.bokjiro.go.kr',
      source:       '행정안전부',
      agency:       s.agency || '',
      dept:         s.dept || '',
      phone:        s.phone || '',
      target:       s.target || '',
      match_reason: '',
    }));

    _dashStrategyCache = {
      benefits,
      raw_count:       data.count || benefits.length,
      radar_scores:    _buildRadarScores(benefits),
      navigation_path: _buildNavPath(benefits),
      urgent_actions:  [],
    };

    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'strategy')  renderStrategy();
  } catch (e) {
    console.error('welfare-list error', e);
    _dashStrategyCache = { error: e.message };
    if (currentPage === 'dashboard') renderDashboard();
  }
}

function _dashTotalMonthly(benefits) {
  if (!benefits.length) return '-';
  // navigation_path 합산
  const cache = _dashStrategyCache?.navigation_path || [];
  const total = cache.filter(n => n.type === 'benefit').reduce((s, n) => s + (n.monthly_amount || 0), 0);
  return total ? `월 ${total}만원+` : `${benefits.length}종`;
}

function _dashCatIcon(cat) {
  return { '주거지원':'🏠', '생활지원':'🍚', '돌봄지원':'👶', '교육지원':'📚', '자산형성':'💰', '의료지원':'🏥' }[cat] || '📋';
}
function _dashCatColor(cat) {
  return { '주거지원':'#3B82F6', '생활지원':'#00C896', '돌봄지원':'#EC4899', '교육지원':'#F59E0B', '자산형성':'#6366F1', '의료지원':'#EF4444' }[cat] || '#6B7685';
}

// ── 소득구간 판별 ─────────────────────────────────────────────────────
const INCOME_BANDS = [
  ['income_band_50',      1_196_000],
  ['income_band_75',      1_794_000],
  ['income_band_100',     2_392_000],
  ['income_band_200',     4_784_000],
  ['income_band_over200', Infinity],
];

// ── 카테고리 분류 ─────────────────────────────────────────────────────
function _fieldToCategory(field = '', name = '') {
  const t = (field + name).toLowerCase();
  if (/주거|임대|전세|월세/.test(t))              return '주거지원';
  if (/의료|건강|보건|병원|치료|약/.test(t))       return '의료지원';
  if (/돌봄|요양|장기|보호|아동|영유아/.test(t))   return '돌봄지원';
  if (/교육|학습|학비|장학|학교/.test(t))          return '교육지원';
  if (/취업|고용|일자리|창업|자립|자산/.test(t))   return '자산형성';
  return '생활지원';
}

// ── Supabase 직접 쿼리 → 홈 혜택 추천 ───────────────────────────────
async function loadFromSupabase() {
  if (!MY_PROFILE?.onboarding_done) return;

  _dashStrategyCache = { loading: true };
  if (currentPage === 'dashboard') renderDashboard();

  const p    = MY_PROFILE;
  const age  = p.birth_year ? new Date().getFullYear() - p.birth_year : 40;
  const regionFull   = [p.region, p.district].filter(Boolean).join(' ');
  const sido         = regionFull.split(' ')[0] || '';
  const sigungu      = regionFull.split(' ')[1] || '';
  const monthlyIncome = p.income_amount ? p.income_amount * 10000 : null;
  const isDisabled    = !!p.has_disability;
  const isSingle      = p.household_type === 'single';
  const isSingleParent = p.household_type === 'single_parent' || !!p.is_single_parent;
  const isMale        = p.gender === 'male';

  try {
    // ① 서비스 목록: 행정안전부(전국) + 해당 지자체
    let q = sb
      .from('welfare_services')
      .select('service_id,service_name,agency_name,support_content,apply_method,detail_url,user_type,service_field,source,region_sido,region_sigungu,target_description')
      .limit(300);

    if (sido) {
      q = q.or(`region_sido.is.null,region_sido.eq.${sido}`);
    }

    const { data: services, error: svcErr } = await q;
    if (svcErr) throw svcErr;

    // ② 해당 service_id의 자격 조건 일괄 조회
    const ids = (services || []).map(s => s.service_id).filter(Boolean);
    const { data: conditions } = await sb
      .from('welfare_support_conditions')
      .select('*')
      .in('service_id', ids);

    const condMap = {};
    (conditions || []).forEach(c => { condMap[c.service_id] = c; });

    // ③ 자격 매칭 (행정안전부 = 조건 규칙, 지자체 = 조건 없으면 통과)
    const eligible = [];
    for (const svc of (services || [])) {
      // 다른 시군구 서비스 제외 (예: 영월군 서비스를 대전 사용자에게 노출 방지)
      if (svc.region_sigungu && sigungu && svc.region_sigungu !== sigungu) continue;

      const cond = condMap[svc.service_id];

      // 조건 데이터 없는 서비스 → 지자체 서비스거나 조건 미입력 → 일단 포함
      if (!cond) {
        eligible.push({ ...svc, match_reason: '지역 혜택 (직접 확인 필요)' });
        continue;
      }

      // 연령
      if (cond.age_start && age < cond.age_start) continue;
      if (cond.age_end   && age > cond.age_end)   continue;

      // 성별
      if (isMale  && cond.male_eligible   === false) continue;
      if (!isMale && cond.female_eligible === false) continue;

      // 소득 구간 (어떤 구간이든 설정된 경우에만 체크)
      const hasIncomeCond = INCOME_BANDS.some(([col]) => cond[col]);
      if (hasIncomeCond && monthlyIncome !== null) {
        const ok = INCOME_BANDS.some(([col, limit]) => cond[col] && monthlyIncome <= limit);
        if (!ok) continue;
      }

      // 특수 조건 (해당 특성이 필요한데 사용자가 해당 안 되면 제외)
      if (cond.disabled       && !isDisabled)   continue;
      if (cond.single_parent  && !isSingleParent) continue;
      if (cond.single_household && !isSingle)   continue;

      const reasons = [];
      if (cond.age_start || cond.age_end) reasons.push(`${cond.age_start||''}~${cond.age_end||''}세`);
      if (isDisabled && cond.disabled)    reasons.push('장애인');
      if (isSingleParent && cond.single_parent) reasons.push('한부모');
      if (isSingle && cond.single_household)    reasons.push('1인가구');

      eligible.push({ ...svc, match_reason: reasons.join(' · ') || '자격 매칭' });
    }

    // ④ 지역 정렬: 시군구 정확 매칭 → 시도 매칭 → 전국 순
    eligible.sort((a, b) => {
      const rankA = a.region_sigungu === sigungu ? 0 : (a.region_sido === sido ? 1 : 2);
      const rankB = b.region_sigungu === sigungu ? 0 : (b.region_sido === sido ? 1 : 2);
      return rankA - rankB;
    });

    // ⑤ 캐시 저장
    const benefits = eligible.map((s, i) => ({
      name:         s.service_name || '알 수 없음',
      category:     _fieldToCategory(s.service_field, s.service_name),
      description:  (s.support_content || '').replace(/\r\n|\r|\n/g, ' ').slice(0, 80),
      amount:       _extractAmount(s.support_content),
      urgency:      Math.max(1, Math.min(9, 9 - Math.floor(i / 5))),
      impact:       7,
      deadline:     null,
      how_to_apply: s.apply_method || '',
      apply_url:    s.detail_url || 'https://www.bokjiro.go.kr',
      source:       s.source || '',
      agency:       s.agency_name || '',
      match_reason: s.match_reason || '',
    }));

    _dashStrategyCache = {
      benefits,
      presented_text: '',
      raw_count:      services.length,
      eligible_count: eligible.length,
      radar_scores:   _buildRadarScores(benefits),
      navigation_path: _buildNavPath(benefits),
      urgent_actions: [],
    };

    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'strategy')  renderStrategy();

  } catch (e) {
    console.error('Supabase query error', e);
    _dashStrategyCache = { error: e.message };
    if (currentPage === 'dashboard') renderDashboard();
  }
}

// ── MY_PROFILE → Railway UserProfile 변환 ────────────────────────────
function _buildUserProfile(p) {
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : 40;
  const monthlyIncome = p.income_amount ? p.income_amount * 10000 : null;
  return {
    age,
    region: [p.region, p.district].filter(Boolean).join(' ') || '',
    monthly_income: monthlyIncome,
    has_disability:       !!p.has_disability,
    is_single_household:  p.household_type === 'single',
    is_single_parent:     p.household_type === 'single_parent' || !!p.is_single_parent,
  };
}

// ── Railway 결과 → 내부 캐시 포맷 변환 ─────────────────────────────
function _mapResults(results) {
  return results.map((r, i) => ({
    name:        r.service_name  || '알 수 없음',
    category:    _fieldToCategory(r.service_field, r.service_name),
    description: (r.support_content || '').slice(0, 80),
    amount:      _extractAmount(r.support_content),
    urgency:     Math.max(1, 8 - i),   // 앞 순서일수록 긴급도 높게
    impact:      Math.min(10, 9 - Math.floor(i / 3)),
    deadline:    null,
    how_to_apply: r.apply_method || '',
    apply_url:   r.detail_url || 'https://www.bokjiro.go.kr',
    source:      r.source || '',
    match_reason: r.match_reason || '',
  }));
}

// 복지 설명 텍스트 정리: 줄바꿈 보존 + ○ 항목마다 줄바꿈 + 길이 제한
function _fmtContent(raw = '', max = 280) {
  let t = String(raw || '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\s*○\s*/g, '\n○ ')   // ○ 목록 항목마다 줄바꿈
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t;
}

function _extractAmount(content = '') {
  const m = content.match(/(\d[\d,]*)\s*만\s*원/);
  if (m) return `최대 ${m[1]}만원`;
  if (/현물|서비스|이용권/.test(content)) return '현물 지원';
  return '지원금 있음';
}

// ── POST /api/personal/search 호출 ──────────────────────────────────
let _searchThreadId = null;

async function loadStrategy() {
  if (!MY_PROFILE?.onboarding_done) return;

  // 로딩 상태 표시
  _dashStrategyCache = { loading: true };
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'strategy')  renderStrategy();

  if (!_searchThreadId) {
    _searchThreadId = (ME?.id || 'anon') + '-' + Date.now();
  }

  try {
    const userProfile = _buildUserProfile(MY_PROFILE);
    const age = userProfile.age;
    const message = `안녕하세요. ${age}세 ${MY_PROFILE.gender === 'female' ? '여성' : '남성'}입니다. 제 상황에 맞는 복지 혜택을 알려주세요.`;

    const res = await fetch(`${RAILWAY_URL}/api/personal/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id:    _searchThreadId,
        user_profile: userProfile,
        message,
      }),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    const benefits = _mapResults(data.results || []);
    _dashStrategyCache = {
      benefits,
      presented_text:   data.presented_text || '',
      raw_count:        data.raw_count || 0,
      strategy_summary: data.presented_text || '',
      radar_scores:     _buildRadarScores(benefits),
      navigation_path:  _buildNavPath(benefits),
      urgent_actions:   benefits.filter(b => b.urgency >= 8).slice(0, 3).map(b => `${b.name} — ${b.how_to_apply || '주민센터 방문'}`),
    };

    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'strategy')  renderStrategy();

  } catch (e) {
    console.error('personal/search error', e);
    _dashStrategyCache = { error: e.message };
    if (currentPage === 'dashboard') renderDashboard();
  }
}

function _buildRadarScores(benefits) {
  const cats = ['주거지원','생활지원','돌봄지원','교육지원','자산형성','의료지원'];
  const scores = {};
  cats.forEach(c => {
    const count = benefits.filter(b => b.category === c).length;
    scores[c] = Math.min(100, count * 20);
  });
  return scores;
}

function _buildNavPath(benefits) {
  const path = [{ label: '현재', monthly_amount: 0, type: 'current' }];
  let cum = 0;
  benefits.slice(0, 4).forEach(b => {
    const amt = parseInt((b.amount || '').replace(/[^\d]/g, '')) || 0;
    cum += amt;
    path.push({ label: b.name, monthly_amount: amt, type: 'benefit' });
  });
  path.push({ label: '목표 달성', monthly_amount: 0, type: 'goal' });
  return path;
}

// 위저드 완료 후 자동 로드 트리거
function _strategyAutoLoad() {
  _searchThreadId = null;
  _dashStrategyCache = null;
  setTimeout(() => loadWelfareList(), 500);
}

// ══════════════════════════════════════════════════════════════════════
//  추천 혜택 추가 설정 — ① 신청 도움 요청  ② 캘린더 등록
// ══════════════════════════════════════════════════════════════════════

// ① 신청 도움 필요 → 담당 기관(지자체/복지사)에 전달 (Supabase 저장 + localStorage)
async function _dashToggleHelp(btn, name, agency) {
  const reqs = _loadHelpReqs();
  const idx = reqs.findIndex(r => r.benefit_name === name);

  // 이미 요청됨 → 취소
  if (idx >= 0) {
    reqs.splice(idx, 1);
    localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
    if (btn) { btn.classList.remove('on'); btn.textContent = '🙋 신청 도움 받기'; }
    if (ME) { try { await sb.from('benefit_help_requests').delete().eq('user_id', ME.id).eq('benefit_name', name); } catch (_) {} }
    toast('신청 도움 요청을 취소했어요');
    return;
  }

  // 신규 요청
  const p = MY_PROFILE || {};
  const region = [p.region, p.district].filter(Boolean).join(' ');
  reqs.push({ benefit_name: name, agency_name: agency, region, requested_at: new Date().toISOString() });
  localStorage.setItem('benefit_help_requests', JSON.stringify(reqs));
  if (btn) { btn.classList.add('on'); btn.textContent = '✅ 신청 도움 요청됨'; }

  // 담당 기관/복지사가 확인할 수 있도록 Supabase에 기록
  if (ME) {
    try {
      await sb.from('benefit_help_requests').insert({
        user_id: ME.id,
        benefit_name: name,
        agency_name: agency,
        region,
        profile_snapshot: p,
        status: 'pending',
      });
    } catch (e) { console.warn('help request 저장 실패(테이블 미생성 가능):', e.message); }
  }
  toast('담당 기관에 신청 도움을 요청했어요 🙋 곧 안내해드릴게요', 'success');
}

// ② 일정 안내 필요 → 캘린더에 등록 (날짜 선택 모달)
let _dashPendingCal = null;
function _dashAddToCalendar(name, amount, deadline) {
  // 이미 등록됨 → 캘린더로 이동
  if (_dashCalSet().has(name)) { navigateTo('calendar'); return; }

  _dashPendingCal = { name, amount };
  const dl = deadline ? new Date(deadline) : null;
  const def = (dl && !isNaN(dl.getTime())) ? _dateToInput(dl) : _dateToInput(_endOfMonth());

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dash-modal';
  overlay.onclick = (e) => { if (e.target === overlay) _dashCloseModal(); };
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">📅 캘린더에 추가</div>
      <div class="modal-sub">${esc(name)}</div>
      <label class="modal-label">신청 / 마감 예정일</label>
      <input type="date" id="cal-date-input" class="pf-input" style="width:100%" value="${def}">
      <label class="modal-label">메모 (선택)</label>
      <input type="text" id="cal-memo-input" class="pf-input" style="width:100%" placeholder="예: 주민센터 방문" value="${esc(amount || '')}">
      <div class="modal-actions">
        <button class="btn btn-outline" style="flex:1" onclick="_dashCloseModal()">취소</button>
        <button class="btn btn-primary" style="flex:1" onclick="_dashConfirmCalendar()">추가</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('cal-date-input')?.focus(), 80);
}
function _dashConfirmCalendar() {
  if (!_dashPendingCal) return;
  const date = document.getElementById('cal-date-input')?.value;
  const memo = document.getElementById('cal-memo-input')?.value || '';
  if (!date) { toast('날짜를 선택해주세요', 'error'); return; }
  const list = _loadSchedule();
  list.push({ id: Date.now(), date, name: _dashPendingCal.name, amount: _dashPendingCal.amount, desc: memo });
  localStorage.setItem('welfare_schedule', JSON.stringify(list));
  _dashPendingCal = null;
  _dashCloseModal();
  toast('캘린더에 등록했어요 📅', 'success');
  if (currentPage === 'dashboard') renderDashboard();
}
function _dashCloseModal() {
  document.getElementById('dash-modal')?.remove();
  _dashPendingCal = null;
}
