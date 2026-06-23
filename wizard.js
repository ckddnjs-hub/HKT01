'use strict';
// ══════════════════════════════════════════════════════════════════════
//  wizard.js — 점진적 입력 폼 (Progressive Disclosure Form)
//  답변 → 위에 요약 줄로 남음 → 아래에 다음 질문 추가 → 수정 가능
// ══════════════════════════════════════════════════════════════════════

let _wz = {
  data: {
    gender: null, birth_year: null,
    region: null, district: null, address: null, address_detail: null, lat: null, lng: null,
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
    region: null, district: null, address: null, address_detail: null, lat: null, lng: null,
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

// ── 전국 시·도 / 시·군·구 데이터 ──────────────────────────────────────
// 키(시·도)는 카카오 region_1depth_name 과 동일하게 맞춰 자동 매칭이 되도록 함
const KR_REGIONS = {
  '서울특별시': ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'],
  '부산광역시': ['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'],
  '대구광역시': ['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군'],
  '인천광역시': ['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군','옹진군'],
  '광주광역시': ['동구','서구','남구','북구','광산구'],
  '대전광역시': ['동구','중구','서구','유성구','대덕구'],
  '울산광역시': ['중구','남구','동구','북구','울주군'],
  '세종특별자치시': [],
  '경기도': ['수원시','성남시','의정부시','안양시','부천시','광명시','평택시','동두천시','안산시','고양시','과천시','구리시','남양주시','오산시','시흥시','군포시','의왕시','하남시','용인시','파주시','이천시','안성시','김포시','화성시','광주시','양주시','포천시','여주시','연천군','가평군','양평군'],
  '강원특별자치도': ['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'],
  '충청북도': ['청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군'],
  '충청남도': ['천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시','금산군','부여군','서천군','청양군','홍성군','예산군','태안군'],
  '전북특별자치도': ['전주시','군산시','익산시','정읍시','남원시','김제시','완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군'],
  '전라남도': ['목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군'],
  '경상북도': ['포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시','의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군'],
  '경상남도': ['창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시','의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군'],
  '제주특별자치도': ['제주시','서귀포시'],
};

// 카카오/외부 지오코딩이 돌려준 시·도 이름 → KR_REGIONS 키로 정규화
function _wzMatchSido(name) {
  if (!name) return '';
  if (KR_REGIONS[name]) return name;
  const aliases = [
    ['강원', '강원특별자치도'],
    ['전북', '전북특별자치도'], ['전라북', '전북특별자치도'],
    ['제주', '제주특별자치도'],
    ['세종', '세종특별자치시'],
  ];
  for (const [k, v] of aliases) if (name.includes(k)) return v;
  // 마지막 폴백: 앞 2글자가 같은 시·도 (예: "서울시" → "서울특별시")
  for (const k of Object.keys(KR_REGIONS)) if (name.slice(0, 2) === k.slice(0, 2)) return k;
  return '';
}
// 시·군·구 이름을 해당 시·도의 목록과 매칭 (부분 일치 허용: "수원시 장안구" → "수원시")
function _wzMatchSigungu(sido, name) {
  const list = KR_REGIONS[sido] || [];
  if (!list.length || !name) return '';
  if (list.includes(name)) return name;
  return list.find(d => name.includes(d) || d.includes(name)) || '';
}

// ── Step 2: 거주 지역 (시·도 / 시·군·구) ───────────────────────────────
function _pfRegion(idx) {
  const sido = _wz.data.region || '';
  const sigungu = _wz.data.district || '';
  return `
    <div class="pf-step-header">
      <div class="pf-step-label">어디에 사세요?</div>
      <div class="pf-step-sub">시·도와 시·군·구까지 선택하면 지자체 혜택을 더 정확히 찾아드려요</div>
    </div>
    <div class="pf-step-body">
      <button class="gps-btn" id="pf-gps-btn" onclick="_pfGetGPS(${idx})">📍 현재 위치로 시·도 / 시·군·구 자동 선택</button>
      <div id="pf-addr-result" class="address-result" style="display:${_wz.data.address?'block':'none'}">
        ✅ ${esc(_wz.data.address||'')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <select id="pf-sido" class="pf-input" style="flex:1" onchange="_wzOnSidoChange(this.value)">
          <option value="">시·도 선택</option>
          ${Object.keys(KR_REGIONS).map(s => `<option value="${s}" ${s===sido?'selected':''}>${s}</option>`).join('')}
        </select>
        <select id="pf-sigungu" class="pf-input" style="flex:1">
          <option value="">시·군·구 선택</option>
          ${(KR_REGIONS[sido]||[]).map(d => `<option value="${d}" ${d===sigungu?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <input type="text" id="pf-addr-detail" class="pf-input" style="width:100%;margin-top:8px"
        placeholder="상세주소 (선택) — 예: ○○동 ○○아파트"
        value="${esc(_wz.data.address_detail||'')}"
        onkeydown="if(event.key==='Enter')_pfPickRegion(${idx})">
      <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="_pfPickRegion(${idx})">확인 →</button>
    </div>`;
}
// 시·도 선택 시 → 해당 시·군·구 목록으로 갱신
function _wzOnSidoChange(sido) {
  const sg = document.getElementById('pf-sigungu');
  if (!sg) return;
  const list = KR_REGIONS[sido] || [];
  sg.innerHTML = `<option value="">시·군·구 선택</option>` +
    list.map(d => `<option value="${d}">${d}</option>`).join('');
}
async function _pfGetGPS(idx) {
  const btn = document.getElementById('pf-gps-btn');
  if (!navigator.geolocation) { toast('GPS를 지원하지 않는 브라우저예요', 'error'); return; }
  if (btn) { btn.textContent = '📡 위치 가져오는 중...'; btn.disabled = true; }
  const resetBtn = () => { if (btn) { btn.textContent = '📍 현재 위치로 시·도 / 시·군·구 자동 선택'; btn.disabled = false; } };

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    _wz.data.lat = lat; _wz.data.lng = lng;

    let sido = '', sigungu = '', fullAddr = '';

    // 1차: 카카오 좌표→행정구역 (가장 가까운 시·도/시·군·구)
    try {
      await _wzLoadKakaoSDK();
      const region = await new Promise((res, rej) => {
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.coord2RegionCode(lng, lat, (result, status) => {
          if (status === kakao.maps.services.Status.OK && result.length) {
            res(result.find(x => x.region_type === 'B') || result[0]); // 법정동 우선
          } else { rej(new Error('no region')); }
        });
      });
      sido = _wzMatchSido(region.region_1depth_name);
      sigungu = _wzMatchSigungu(sido, region.region_2depth_name);
      fullAddr = region.address_name || '';
    } catch (_) {
      // 2차 폴백: Nominatim (OpenStreetMap) — API키 불필요
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
          { headers: { 'Accept-Language': 'ko' } }
        );
        const d = await r.json();
        const a = d.address || {};
        sido = _wzMatchSido(a.state || a.city || a.province || '');
        sigungu = _wzMatchSigungu(sido, a.city || a.county || a.borough || a.suburb || a.district || '');
      } catch (_2) { /* 둘 다 실패 */ }
    }

    if (sido) {
      _wz.data.region = sido;
      _wz.data.district = sigungu;
      _wz.data.address = [sido, sigungu].filter(Boolean).join(' ');
      // 드롭다운 자동 선택
      const sidoEl = document.getElementById('pf-sido');
      if (sidoEl) sidoEl.value = sido;
      _wzOnSidoChange(sido);
      const sgEl = document.getElementById('pf-sigungu');
      if (sgEl && sigungu) sgEl.value = sigungu;
      const res = document.getElementById('pf-addr-result');
      if (res) { res.textContent = '✅ ' + (fullAddr || _wz.data.address); res.style.display = 'block'; }
      toast('가장 가까운 지역을 선택했어요', 'success');
    } else {
      toast('위치 변환 실패 — 직접 선택해주세요', 'error');
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
  const sido = document.getElementById('pf-sido')?.value || '';
  const sigungu = document.getElementById('pf-sigungu')?.value || '';
  const detail = document.getElementById('pf-addr-detail')?.value.trim() || '';
  if (!sido) { toast('시·도를 선택해주세요', 'error'); return; }
  const needSigungu = (KR_REGIONS[sido] || []).length > 0;
  if (needSigungu && !sigungu) { toast('시·군·구를 선택해주세요', 'error'); return; }
  _wz.data.region = sido;
  _wz.data.district = sigungu;
  _wz.data.address_detail = detail;
  _wz.data.address = [sido, sigungu, detail].filter(Boolean).join(' ');
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
  // address_detail 은 UI 전용 (profiles 테이블에 컬럼 없음) → 저장 페이로드에서 제외
  const { address_detail, ...clean } = _wz.data;
  const { error } = await saveProfile({ ...clean, onboarding_done: true });
  if (error) { toast('저장 중 오류가 발생했어요', 'error'); return; }
  MY_PROFILE = { ...MY_PROFILE, ...clean, onboarding_done: true };
  updateHeaderAvatar();
  _strategyAutoLoad();
}

function _wzSelect(key, val) { _wz.data[key] = val; }
