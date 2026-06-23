// Vercel 서버리스 함수 — 프로필 기반 복지로(gov24) 서비스 목록 (GPT 분석 없이 원본 목록만)
// 환경변수: BKEY (행정안전부 gov24 API 키)
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ services: [], error: '허용되지 않는 메서드' });

  const { user_profile = {} } = req.body || {};
  const BKEY = process.env.BKEY ? decodeURIComponent(process.env.BKEY) : '';
  if (!BKEY) return res.status(500).json({ services: [], error: 'BKEY 환경변수가 설정되지 않았습니다.' });

  try {
    const p = user_profile;
    const age = p.age || (p.birth_year ? new Date().getFullYear() - p.birth_year : 40);
    const fields = resolveFields(age, p);
    const raw = await fetchServices(fields, BKEY);

    const services = raw.map(item => ({
      id:      item['서비스ID']   || item['서비스명'] || '',
      name:    item['서비스명']   || '',
      agency:  item['소관기관명'] || '',
      field:   item['서비스분야'] || '',
      target:  item['지원대상']   || '',
      content: item['지원내용']   || item['선정기준'] || '',
      method:  item['신청방법']   || '',
      dept:    item['부서명']     || '',
      phone:   item['전화문의']   || '',
      url:     item['상세조회URL'] || '',
    })).filter(s => s.name);

    return res.json({ services, count: services.length });
  } catch (e) {
    console.error('welfare-list error:', e);
    return res.status(500).json({ services: [], error: e.message });
  }
};

// ── 프로필 기반 서비스분야 결정 ───────────────────────────────────────
function resolveFields(age, p) {
  const fields = new Set();
  if (age >= 65)                fields.add('노인·요양');
  if (age < 19)                 fields.add('보육·교육 및 취약아동지원');
  if (p.has_disability)         fields.add('장애인');
  if (p.has_infant || p.has_pregnancy) fields.add('임신·출산');
  if (p.is_single_parent || p.household_type === 'single_parent') fields.add('가족지원');
  if (p.is_low_income)          fields.add('생활지원');
  if (['monthly_rent','jeonse','public'].includes(p.housing_type)) fields.add('주거');
  if (['unemployed','student'].includes(p.employment_status))      fields.add('일자리');
  fields.add('생활지원'); // 항상 기본 포함
  return [...fields].slice(0, 6);
}

// ── gov24 병렬 호출 ──────────────────────────────────────────────────
async function fetchServices(fields, key) {
  const BASE = 'https://api.odcloud.kr/api/gov24/v3/serviceList';
  const encodedKey = encodeURIComponent(key);

  const requests = fields.map(field => {
    const encodedField = encodeURIComponent(field);
    const url = `${BASE}?serviceKey=${encodedKey}&page=1&perPage=20&returnType=JSON&cond[서비스분야::LIKE]=${encodedField}`;
    return fetch(url, { signal: AbortSignal.timeout(9000) })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(body => body.data || [])
      .catch(() => []);
  });

  // 기본 첫 페이지도 추가로 가져와 커버리지 보강
  requests.push(
    fetch(`${BASE}?serviceKey=${encodedKey}&page=1&perPage=20&returnType=JSON`, { signal: AbortSignal.timeout(9000) })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(body => body.data || [])
      .catch(() => [])
  );

  const results = await Promise.allSettled(requests);

  // 중복 제거 (서비스ID 기준)
  const seen = new Set();
  const merged = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const sid = item['서비스ID'] || item['서비스명'];
      if (sid && !seen.has(sid)) { seen.add(sid); merged.push(item); }
    }
  }
  return merged.slice(0, 40);
}
