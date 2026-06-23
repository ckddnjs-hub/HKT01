'use strict';
// ══════════════════════════════════════════════════════════════════════
//  wizard.js — 점진적 입력 폼 (Progressive Disclosure Form)
//  답변 → 위에 요약 줄로 남음 → 아래에 다음 질문 추가 → 수정 가능
// ══════════════════════════════════════════════════════════════════════

let _wz = {
  data: {
    gender: null, birth_year: null,
    region: null, district: null, address: null, lat: null, lng: null,
    household_type: null, household_size: 1,
    income_level: 100, income_amount: 200,
    housing_type: null, employment_status: null,
    has_disability: false, disability_grade: null,
    has_pregnancy: false, has_infant: false,
    is_single_parent: false, is_low_income: false,
  },
  shown: new Set(), // 렌더된 step idx들
};

const WZ_TOTAL = 7;

const _PF = [
  { label: '성별',        render: _pfGender     },
  { label: '태어난 연도', render: _pfBirth      },
  { label: '거주 지역',   render: _pfRegion     },
  { label: '가족 구성',   render: _pfHousehold  },
  { label: '소득 수준',   render: _pfIncome     },
  { label: '거주 형태',   render: _pfHousing    },
  { label: '추가 정보',   render: _pfExtras     },
];

function renderWizard() {
  _wz.shown.clear();
  Object.assign(_wz.data, {
    gender: null, birth_year: null,
    region: null, district: null, address: null, lat: null, lng: null,
    household_type: null, household_size: 1,
    income_level: 100, income_amount: 200,
    housing_type: null, employment_status: null,
    has_disability: false, disability_grade: null,
    has_pregnancy: false, has_infant: false,
    is_single_parent: false, is_low_income: false,
  });

  const wrap = document.getElementById('wizard-wrap');
  const progress = document.getElementById('wizard-progress');
  if (!wrap) return;
  if (progress) progress.style.width = '0%';

  wrap.innerHTML = `
    <div class="pf-intro">
      <div style="font-size:2.5rem;margin-bottom:12px">🏛️</div>
      <div class="pf-intro-title">나에게 맞는 복지 혜택을 찾아드려요</div>
      <div class="pf-intro-sub">AI가 분석할 수 있도록 아래 정보를 알려주세요</div>
    </div>
    <div id="pf-steps"></div>
    <div id="pf-finish" style="display:none;padding:8px 0 4px">
      <button class="btn btn-primary btn-full btn-lg" onclick="navigateTo('dashboard')">
        결과 확인하기 →
      </button>
    </div>
  `;

  setTimeout(() => _pfShow(0), 180);
}

// ── 스텝 렌더 ─────────────────────────────────────────────────────────
function _pfShow(idx) {
  if (idx >= _PF.length) { _pfFinish(); return; }
  if (_wz.shown.has(idx)) return;
  _wz.shown.add(idx);

  const progress = document.getElementById('wizard-progress');
  if (progress) progress.style.width = `${(idx / WZ_TOTAL) * 100}%`;

  const container = document.getElementById('pf-steps');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'pf-step pf-active';
  el.id = `pf-${idx}`;
  el.innerHTML = _PF[idx].render(idx);
  container.appendChild(el);

  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  setTimeout(() => { const inp = el.querySelector('input'); if (inp) inp.focus(); }, 140);
}

// ── 답변 완료 → 요약 줄로 접기 + 다음 질문 ──────────────────────────
function _pfAnswer(idx, display) {
  const progress = document.getElementById('wizard-progress');
  if (progress) progress.style.width = `${((idx + 1) / WZ_TOTAL) * 100}%`;

  const el = document.getElementById(`pf-${idx}`);
  if (el) {
    el.className = 'pf-step pf-done';
    el.innerHTML = `
      <div class="pf-done-row">
        <div class="pf-done-info">
          <div class="pf-done-q">${_PF[idx].label}</div>
          <div class="pf-done-ans">${display}</div>
        </div>
        <button class="pf-edit-btn" onclick="_pfEdit(${idx})">수정</button>
      </div>
    `;
  }
  setTimeout(() => _pfShow(idx + 1), 300);
}

// ── 수정 버튼 → 해당 스텝만 다시 펼침 (이후 답변 유지) ───────────────
function _pfEdit(idx) {
  const el = document.getElementById(`pf-${idx}`);
  if (!el) return;
  el.className = 'pf-step pf-active';
  el.innerHTML = _PF[idx].render(idx);
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  setTimeout(() => { const inp = el.querySelector('input'); if (inp) inp.focus(); }, 110);
}

// ── Step 0: 성별 ──────────────────────────────────────────────────────
function _pfGender(idx) {
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">성별이 어떻게 되세요?</div>
      <div class="pf-step-sub">일부 혜택은 성별에 따라 달라질 수 있어요</div>
    </div>
    <div class="pf-step-body">
      <div class="pf-choices">
        <button class="pf-choice ${_wz.data.gender==='male'?'selected':''}"
          onclick="_pfPickGender(${idx},'male')">👨 남성</button>
        <button class="pf-choice ${_wz.data.gender==='female'?'selected':''}"
          onclick="_pfPickGender(${idx},'female')">👩 여성</button>
      </div>
    </div>`;
}
function _pfPickGender(idx, val) {
  _wz.data.gender = val;
  _pfAnswer(idx, val === 'male' ? '👨 남성' : '👩 여성');
}

// ── Step 1: 생년도 ─────────────────────────────────────────────────────
function _pfBirth(idx) {
  const cur = new Date().getFullYear();
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">태어난 연도를 알려주세요</div>
      <div class="pf-step-sub">연령에 따라 받을 수 있는 혜택이 달라져요</div>
    </div>
    <div class="pf-step-body">
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="pf-birth" class="pf-input"
          style="flex:1;font-size:1.2rem;font-weight:700;text-align:center"
          placeholder="예: 1975" min="1924" max="${cur}"
          value="${_wz.data.birth_year||''}" inputmode="numeric"
          oninput="_pfBirthPreview(this.value,${cur})"
          onkeydown="if(event.key==='Enter')_pfPickBirth(${idx})">
        <button class="btn btn-primary" onclick="_pfPickBirth(${idx})">확인 →</button>
      </div>
      <div id="pf-age-preview" style="text-align:center;margin-top:8px;font-size:.83rem;color:var(--text-muted);min-height:20px">
        ${_wz.data.birth_year ? `만 ${cur - _wz.data.birth_year}세` : ''}
      </div>
    </div>`;
}
function _pfBirthPreview(val, curYear) {
  const y = parseInt(val);
  const el = document.getElementById('pf-age-preview');
  if (el) el.textContent = (y >= 1924 && y <= curYear) ? `만 ${curYear - y}세` : '';
}
function _pfPickBirth(idx) {
  const cur = new Date().getFullYear();
  const val = parseInt(document.getElementById('pf-birth')?.value);
  if (!val || val < 1924 || val > cur) { toast('올바른 연도를 입력해주세요', 'error'); return; }
  _wz.data.birth_year = val;
  _pfAnswer(idx, `${val}년생 (만 ${cur - val}세)`);
}

// ── Step 2: 거주 지역 ─────────────────────────────────────────────────
function _pfRegion(idx) {
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">어디에 사세요?</div>
      <div class="pf-step-sub">거주 지역에 따라 지자체 혜택이 달라져요</div>
    </div>
    <div class="pf-step-body">
      <button class="gps-btn" id="pf-gps-btn" onclick="_pfGetGPS(${idx})">📍 현재 위치로 자동 입력</button>
      <div id="pf-addr-result" class="address-result" style="display:${_wz.data.address?'block':'none'}">
        ✅ ${esc(_wz.data.address||'')}
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <input type="text" id="pf-region" class="pf-input" style="flex:1"
          placeholder="예: 대전광역시 유성구"
          value="${esc(_wz.data.address||'')}"
          onkeydown="if(event.key==='Enter')_pfPickRegion(${idx})">
        <button class="btn btn-primary" onclick="_pfPickRegion(${idx})">확인 →</button>
      </div>
    </div>`;
}
async function _pfGetGPS(idx) {
  const btn = document.getElementById('pf-gps-btn');
  if (!navigator.geolocation) { toast('GPS를 지원하지 않는 브라우저예요', 'error'); return; }
  if (btn) { btn.textContent = '📡 위치 가져오는 중...'; btn.disabled = true; }
  const resetBtn = () => { if (btn) { btn.textContent = '📍 현재 위치로 자동 입력'; btn.disabled = false; } };

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    _wz.data.lat = lat; _wz.data.lng = lng;

    let addr = '';

    // 1차: 카카오 역지오코딩
    try {
      await _wzLoadKakaoSDK();
      addr = await new Promise((res, rej) => {
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result, status) => {
          if (status === kakao.maps.services.Status.OK && result.length > 0) {
            res(result[0].road_address?.address_name || result[0].address?.address_name || '');
          } else { rej(new Error('no result')); }
        });
      });
    } catch (_) {
      // 2차 폴백: Nominatim (OpenStreetMap) — API키 불필요
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
          { headers: { 'Accept-Language': 'ko' } }
        );
        const d = await r.json();
        const a = d.address || {};
        const city = a.city || a.county || a.state || '';
        const gu   = a.suburb || a.borough || a.quarter || a.district || '';
        addr = `${city} ${gu}`.trim() || d.display_name || '';
      } catch (_2) { /* 둘 다 실패 */ }
    }

    if (addr) {
      _wz.data.address = addr;
      const parts = addr.split(' ');
      _wz.data.region = parts[0] || ''; _wz.data.district = parts[1] || '';
      const inp = document.getElementById('pf-region');
      if (inp) inp.value = addr;
      const res = document.getElementById('pf-addr-result');
      if (res) { res.textContent = '✅ ' + addr; res.style.display = 'block'; }
      toast('위치를 가져왔어요', 'success');
    } else {
      toast('주소 변환 실패 — 직접 입력해주세요', 'error');
    }
    resetBtn();
  }, (err) => {
    resetBtn();
    const msg = err.code === 1 ? 'GPS 권한을 허용해주세요'
               : err.code === 2 ? '위치 신호를 찾을 수 없어요'
               : 'GPS 시간이 초과됐어요';
    toast(msg, 'error');
  }, { enableHighAccuracy: true, timeout: 10000 });
}
function _pfPickRegion(idx) {
  const val = document.getElementById('pf-region')?.value.trim();
  if (!val) { toast('지역을 입력해주세요', 'error'); return; }
  if (!_wz.data.address) {
    _wz.data.address = val;
    const parts = val.split(' ');
    _wz.data.region = parts[0]||val; _wz.data.district = parts[1]||'';
  }
  _pfAnswer(idx, `📍 ${_wz.data.address}`);
}
function _wzLoadKakaoSDK() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.services) { resolve(); return; }
    if (window.kakao?.maps) { kakao.maps.load(resolve); return; }
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`;
    s.onload = () => kakao.maps.load(resolve);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Step 3: 가구 구성 ─────────────────────────────────────────────────
function _pfHousehold(idx) {
  const opts = [
    { val:'single',        icon:'🧑',    label:'1인 가구',   desc:'혼자 살고 있어요' },
    { val:'couple',        icon:'👫',    label:'부부 (2인)', desc:'자녀 없는 부부' },
    { val:'family',        icon:'👨‍👩‍👧', label:'자녀 포함', desc:'부부 + 자녀' },
    { val:'single_parent', icon:'👩‍👦',  label:'한부모 가정', desc:'한부모 + 자녀' },
    { val:'other',         icon:'👥',    label:'기타',       desc:'다세대·기타 형태' },
  ];
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">가족 구성이 어떻게 되세요?</div>
      <div class="pf-step-sub">가구 구성에 따라 받을 수 있는 혜택이 달라져요</div>
    </div>
    <div class="pf-step-body">
      <div class="pf-option-list">
        ${opts.map(o => `
          <button class="pf-option-btn ${_wz.data.household_type===o.val?'selected':''}"
            onclick="_pfPickHousehold(${idx},'${o.val}','${o.label.replace(/'/g,"&#39;")}')">
            <span class="pf-opt-icon">${o.icon}</span>
            <div>
              <div style="font-weight:700;font-size:.88rem">${o.label}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">${o.desc}</div>
            </div>
          </button>`).join('')}
      </div>
    </div>`;
}
function _pfPickHousehold(idx, val, label) {
  _wz.data.household_type = val;
  if (val === 'single_parent') _wz.data.is_single_parent = true;
  _pfAnswer(idx, label);
}

// ── Step 4: 소득 수준 ─────────────────────────────────────────────────
function _pfIncome(idx) {
  const levels = [
    { pct:50,  label:'중위소득 50% 이하',  desc:'기초생활수급자·차상위', dot:'#FF5252' },
    { pct:75,  label:'중위소득 75% 이하',  desc:'차상위계층',            dot:'#FF9800' },
    { pct:100, label:'중위소득 100% 이하', desc:'저소득 가구',           dot:'#FFD600' },
    { pct:150, label:'중위소득 150% 이하', desc:'중산층 하단',           dot:'#00C896' },
    { pct:200, label:'중위소득 200% 이하', desc:'중산층',                dot:'#6366F1' },
    { pct:999, label:'중위소득 200% 초과', desc:'고소득',                dot:'#6B7685' },
  ];
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">소득 수준을 선택해주세요</div>
      <div class="pf-step-sub">기준 중위소득 기준 (2024년 1인 가구 기준 약 222만원)</div>
    </div>
    <div class="pf-step-body">
      <div class="pf-option-list">
        ${levels.map(l => `
          <button class="pf-option-btn ${_wz.data.income_level===l.pct?'selected':''}"
            onclick="_pfPickIncome(${idx},${l.pct},'${l.label}')">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${l.dot};flex-shrink:0"></span>
            <div>
              <div style="font-weight:700;font-size:.88rem">${l.label}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">${l.desc}</div>
            </div>
          </button>`).join('')}
      </div>
    </div>`;
}
function _pfPickIncome(idx, pct, label) {
  _wz.data.income_level = pct;
  if (pct <= 50) _wz.data.is_low_income = true;
  _pfAnswer(idx, label);
}

// ── Step 5: 거주 형태 ─────────────────────────────────────────────────
function _pfHousing(idx) {
  const opts = [
    { val:'own',          icon:'🏠', label:'자가',     desc:'본인 소유 주택' },
    { val:'jeonse',       icon:'🔑', label:'전세',     desc:'전세 계약' },
    { val:'monthly_rent', icon:'📋', label:'월세',     desc:'월세 계약' },
    { val:'public',       icon:'🏢', label:'공공임대', desc:'공공임대주택' },
    { val:'other',        icon:'❓', label:'기타',     desc:'무상·기타' },
  ];
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">거주 형태가 어떻게 되세요?</div>
      <div class="pf-step-sub">주거 혜택(주거급여 등) 수급 자격에 영향을 줘요</div>
    </div>
    <div class="pf-step-body">
      <div class="pf-option-list">
        ${opts.map(o => `
          <button class="pf-option-btn ${_wz.data.housing_type===o.val?'selected':''}"
            onclick="_pfPickHousing(${idx},'${o.val}','${o.label}')">
            <span class="pf-opt-icon">${o.icon}</span>
            <div>
              <div style="font-weight:700;font-size:.88rem">${o.label}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">${o.desc}</div>
            </div>
          </button>`).join('')}
      </div>
    </div>`;
}
function _pfPickHousing(idx, val, label) {
  _wz.data.housing_type = val;
  _pfAnswer(idx, label);
}

// ── Step 6: 추가 해당사항 (복수 선택) ─────────────────────────────────
function _pfExtras(idx) {
  const items = [
    { key:'has_disability',   icon:'♿', label:'장애가 있어요',             desc:'장애인 등록 여부' },
    { key:'has_pregnancy',    icon:'🤱', label:'임신 중이거나 출산했어요', desc:'출산지원금 등 해당' },
    { key:'has_infant',       icon:'👶', label:'영유아(만 6세 이하) 자녀', desc:'아동수당·보육료 등' },
    { key:'is_single_parent', icon:'👩‍👦',label:'한부모 가정이에요',        desc:'한부모 가정 지원' },
    { key:'is_low_income',    icon:'📋', label:'기초생활수급자·차상위계층', desc:'이미 수급 중이에요' },
  ];
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">해당되는 항목을 선택해주세요</div>
      <div class="pf-step-sub">없으면 "해당 없음" · 복수 선택 가능</div>
    </div>
    <div class="pf-step-body">
      <div class="pf-check-list" style="margin-bottom:10px">
        ${items.map(it => `
          <div class="pf-check-item ${_wz.data[it.key]?'checked':''}" id="pfx-${it.key}"
            onclick="_pfToggleExtra('${it.key}')">
            <div class="pf-checkbox">${_wz.data[it.key]?'✓':''}</div>
            <span style="font-size:1.1rem">${it.icon}</span>
            <div>
              <div style="font-weight:700;font-size:.86rem">${it.label}</div>
              <div style="font-size:.72rem;color:var(--text-muted)">${it.desc}</div>
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" style="flex:1" onclick="_pfPickExtras(${idx},true)">해당 없음</button>
        <button class="btn btn-primary" style="flex:1" onclick="_pfPickExtras(${idx},false)">확인 →</button>
      </div>
    </div>`;
}
function _pfToggleExtra(key) {
  _wz.data[key] = !_wz.data[key];
  const el = document.getElementById('pfx-' + key);
  if (!el) return;
  el.classList.toggle('checked', _wz.data[key]);
  const box = el.querySelector('.pf-checkbox');
  if (box) box.textContent = _wz.data[key] ? '✓' : '';
}
function _pfPickExtras(idx, noneMode) {
  const keys = ['has_disability','has_pregnancy','has_infant','is_single_parent','is_low_income'];
  const labelMap = { has_disability:'장애', has_pregnancy:'임신/출산', has_infant:'영유아 자녀', is_single_parent:'한부모', is_low_income:'기초수급' };
  if (noneMode) keys.forEach(k => { _wz.data[k] = false; });
  const selected = keys.filter(k => _wz.data[k]).map(k => labelMap[k]);
  _pfAnswer(idx, selected.length ? selected.join(', ') : '해당 없음');
}

// ── 완료 ──────────────────────────────────────────────────────────────
function _pfFinish() {
  const progress = document.getElementById('wizard-progress');
  if (progress) progress.style.width = '100%';
  const btn = document.getElementById('pf-finish');
  if (btn && btn.style.display === 'none') {
    btn.style.display = 'block';
    setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    _wzSaveToSupabase();
  }
}
async function _wzSaveToSupabase() {
  const { error } = await saveProfile({ ..._wz.data, onboarding_done: true });
  if (error) { toast('저장 중 오류가 발생했어요', 'error'); return; }
  MY_PROFILE = { ...MY_PROFILE, ..._wz.data, onboarding_done: true };
  updateHeaderAvatar();
  _strategyAutoLoad();
}

function _wzSelect(key, val) { _wz.data[key] = val; }
