// Vercel 서버리스 함수
// 환경변수: BKEY (행정안전부 gov24 API), gpt_key (OpenAI)
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ text: '허용되지 않는 메서드입니다.' });

  const { message = '', user_profile = {}, history = [] } = req.body || {};

  const BKEY = process.env.BKEY ? decodeURIComponent(process.env.BKEY) : '';
  const GPT_KEY = process.env.gpt_key || '';

  if (!BKEY) return res.status(500).json({ text: '⚠️ BKEY 환경변수가 설정되지 않았습니다.' });
  if (!GPT_KEY) return res.status(500).json({ text: '⚠️ gpt_key 환경변수가 설정되지 않았습니다.' });

  try {
    const p = user_profile;
    const age = p.age || (p.birth_year ? new Date().getFullYear() - p.birth_year : 40);

    // 1. 메시지+프로필에서 관련 서비스분야 추출
    const fields = resolveFields(message, age, p);

    // 2. gov24 병렬 검색 → 중복 제거 → 최대 50건
    const services = await fetchServices(fields, BKEY);

    // 3. GPT 응답 (이전 대화 반영)
    const profileSummary = buildProfile(age, p);
    const isFollowUp = history.length >= 2;
    const text = await askGPT(message, profileSummary, services, history, GPT_KEY, isFollowUp);

    return res.json({ text, source_count: services.length });
  } catch (e) {
    console.error('welfare-chat error:', e);
    return res.status(500).json({ text: `⚠️ 서버 오류: ${e.message}` });
  }
};

// ── 서비스분야 결정 (메시지 키워드 + 프로필) ──────────────────────────
function resolveFields(message, age, p) {
  const fields = new Set();
  const m = message;

  if (/주거|월세|전세|임대|주택|집/.test(m))             fields.add('주거');
  if (/노인|어르신|연금|고령|기초연금/.test(m))          fields.add('노인·요양');
  if (/장애/.test(m))                                    fields.add('장애인');
  if (/임신|출산|육아|아이|아동|영유아|보육/.test(m))    fields.add('임신·출산');
  if (/취업|고용|일자리|실업|구직/.test(m))              fields.add('일자리');
  if (/교육|학비|장학|학교/.test(m))                    fields.add('교육');
  if (/한부모/.test(m))                                  fields.add('가족지원');
  if (/의료|병원|건강|치료|약/.test(m))                  fields.add('건강');
  if (/기초|차상위|수급/.test(m))                        fields.add('생활지원');

  // 프로필 기반
  if (age >= 65)              fields.add('노인·요양');
  if (age < 19)               fields.add('보육·교육 및 취약아동지원');
  if (p.has_disability)       fields.add('장애인');
  if (p.has_infant)           fields.add('임신·출산');
  if (p.is_single_parent)    fields.add('가족지원');
  if (p.is_low_income)        fields.add('생활지원');
  if (p.housing_type === 'monthly_rent') fields.add('주거');

  // 항상 기본 포함
  fields.add('생활지원');

  return [...fields].slice(0, 5);
}

// ── gov24 병렬 호출 ──────────────────────────────────────────────────
async function fetchServices(fields, key) {
  const BASE = 'https://api.odcloud.kr/api/gov24/v3/serviceList';

  // 각 서비스분야별로 15건씩 병렬 요청
  // URLSearchParams 를 사용하지 않고 직접 URL 조합 → [ ] 인코딩 문제 방지
  const requests = fields.map(field => {
    const encodedKey = encodeURIComponent(key);
    const encodedField = encodeURIComponent(field);
    // cond 파라미터의 대괄호는 raw 그대로 (서버가 literal [] 기대)
    const url = `${BASE}?serviceKey=${encodedKey}&page=1&perPage=15&returnType=JSON&cond[서비스분야::LIKE]=${encodedField}`;
    return fetch(url, { signal: AbortSignal.timeout(9000) })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(body => body.data || [])
      .catch(() => []);
  });

  // 추가: 기본 첫 페이지도 가져와서 커버리지 보강
  const encodedKey = encodeURIComponent(key);
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
      const sid = item['서비스ID'];
      if (sid && !seen.has(sid)) {
        seen.add(sid);
        merged.push(item);
      }
    }
  }

  return merged.slice(0, 50);
}

// ── 프로필 요약 ───────────────────────────────────────────────────────
function buildProfile(age, p) {
  return [
    `나이: ${age}세`,
    p.gender === 'female' ? '여성' : p.gender === 'male' ? '남성' : '',
    p.region ? `거주지: ${[p.region, p.district].filter(Boolean).join(' ')}` : '',
    p.household_type ? `가구: ${{ single:'1인가구', couple:'부부', family:'자녀포함', single_parent:'한부모가정', other:'기타' }[p.household_type] || p.household_type}` : '',
    p.income_level ? `소득: 중위소득 ${p.income_level}%` : '',
    p.income_amount ? `월소득: 약 ${p.income_amount}만원` : '',
    p.housing_type ? `주거: ${{ own:'자가', jeonse:'전세', monthly_rent:'월세', public:'공공임대', other:'기타' }[p.housing_type] || p.housing_type}` : '',
    p.has_disability ? '장애인 등록' : '',
    p.has_infant ? '영유아 자녀 있음' : '',
    p.is_single_parent ? '한부모 가정' : '',
    p.is_low_income ? '기초수급·차상위' : '',
  ].filter(Boolean).join(' | ');
}

// ── GPT 호출 ─────────────────────────────────────────────────────────
async function askGPT(message, profileSummary, services, history, key, isFollowUp) {
  const serviceText = services.length
    ? services.slice(0, 40).map((s, i) => {
        const name       = s['서비스명']    || '';
        const agency     = s['소관기관명']  || '';
        const field      = s['서비스분야']  || '';
        const target     = s['지원대상']    || '';
        const criteria   = s['선정기준']    || '';
        const content    = s['지원내용']    || '';
        const method     = s['신청방법']    || '';
        const dept       = s['부서명']      || '';
        const phone      = s['전화문의']    || '';
        const url        = s['상세조회URL'] || '';
        return [
          `[${i+1}] ${name} (${agency} | ${field})`,
          `신청자격: ${(criteria || target).slice(0, 200)}`,
          `혜택내용: ${content.slice(0, 200)}`,
          `담당부서: ${dept}`,
          `전화번호: ${phone}`,
          `신청방법: ${method.slice(0, 100)}`,
          url ? `URL: ${url}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n')
    : '(검색 결과 없음)';

  const systemPrompt = `당신은 한국 복지 혜택 전문 AI 상담사입니다.
행정안전부 gov24 공공 복지서비스 데이터와 사용자 프로필을 바탕으로 맞춤 혜택을 안내합니다.

[필수 출력 형식 - 첫 질문 및 서비스 추천 시 반드시 준수]
각 혜택마다 아래 6개 항목을 반드시 모두 포함하세요. 데이터가 없으면 "확인 필요"로 표기하세요.

1️⃣ **혜택명** (소관기관)
📋 신청자격: (선정기준 또는 지원대상 — 구체적으로)
💰 혜택내용: (지원내용 — 금액이나 현물 내용 포함)
🏢 담당부서: (부서명)
📞 전화번호: (전화문의)
🔗 [상세정보 보러가기](URL)

위 형식으로 우선순위 상위 5개를 1️⃣~5️⃣ 순으로 나열하세요.
마지막 줄: "총 N개 혜택 중 프로필에 가장 적합한 5개를 선별했어요 😊"

[후속 질문 처리]
이전 대화 맥락을 참고해 자연스럽게 답변하되,
특정 혜택에 대한 질문이면 해당 혜택의 6개 항목을 다시 상세히 안내하세요.

[공통 규칙]
- 사용자 프로필(나이·소득·가구형태)에 맞지 않는 서비스는 제외
- 한국어, 친절한 대화체
- URL이 없으면 https://www.bokjiro.go.kr 을 대체 링크로 사용`;

  // 이전 대화를 GPT messages에 추가 (최대 최근 8턴)
  const historyMessages = history.slice(-8).map(h => ({
    role: h.role === 'ai' ? 'assistant' : 'user',
    content: typeof h.content === 'string' ? h.content.slice(0, 500) : '',
  }));

  // 현재 요청 메시지 구성
  let userContent;
  if (isFollowUp) {
    // 후속 질문: 서비스 목록은 줄이고 대화 맥락 강조
    userContent = `[사용자 프로필]\n${profileSummary}\n\n[추가 검색된 서비스 (참고용)]\n${serviceText.slice(0, 2000)}\n\n[후속 질문]\n${message}\n\n이전 대화 내역을 참고해 답변해 주세요.`;
  } else {
    // 첫 질문: 전체 서비스 목록 제공
    userContent = `[사용자 프로필]\n${profileSummary}\n\n[gov24 검색 결과 (${services.length}건)]\n${serviceText}\n\n[질문]\n${message}\n\n위 데이터에서 이 사용자에게 가장 적합한 상위 5개를 우선순위 순으로 추천해 주세요.`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: 2000,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`OpenAI ${r.status}: ${err.error?.message || r.statusText}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content || '응답을 받지 못했어요.';
}
