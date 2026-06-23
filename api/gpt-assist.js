// Vercel 서버리스 함수 — GPT 보조 (① 6영역 분류  ② 쉬운 말 변환)
// 환경변수: gpt_key (OpenAI)
// 모델: 분류/요약에 적합한 최상위 일반 모델. 더 상위 모델 쓰려면 MODEL 값만 변경하세요.
const MODEL = 'gpt-4o';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드' });

  const KEY = process.env.gpt_key || '';
  if (!KEY) return res.status(500).json({ error: 'gpt_key 환경변수가 설정되지 않았습니다.' });

  const { action } = req.body || {};

  try {
    // ① 6영역 분류 — 주거 / 생활 / 의료 / 교육 / 취업 / 돌봄
    if (action === 'classify') {
      const { items = [] } = req.body;
      if (!items.length) return res.json({ categories: {} });

      const list = items
        .map(it => `- id: ${it.id}\n  서비스명: ${it.name}\n  설명: ${(it.desc || '').slice(0, 120)}`)
        .join('\n');

      const sys = `너는 한국 복지 서비스를 분류하는 전문가야. 각 서비스를 반드시 다음 6개 영역 중 하나로만 분류해: 주거, 생활, 의료, 교육, 취업, 돌봄.
- 주거: 임대·전세·월세·주택 관련
- 생활: 생계·기초생활·에너지·금융 등 일반 생활지원
- 의료: 건강·병원·치료·약·요양 의료비
- 교육: 학비·장학·보육·교육 프로그램
- 취업: 일자리·고용·구직·창업·직업훈련
- 돌봄: 아동·영유아·노인·장애인 돌봄 및 보호
반드시 JSON 객체로만 답해. 형식: {"categories": {"<id>": "<영역>"}}. 영역 값은 위 6개 단어 중 하나만 써.`;
      const user = `다음 서비스들을 분류해줘:\n${list}`;

      const raw = await callGPT(KEY, sys, user, true);
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (_) {}
      const categories = parsed.categories || parsed || {};
      return res.json({ categories });
    }

    // ② 쉬운 말 변환
    if (action === 'simplify') {
      const { name = '', text = '' } = req.body;
      const sys = `너는 복지 정보를 쉽게 풀어주는 도우미야. 어르신과 어린이도 이해할 수 있도록 아주 쉬운 한국어로, 전문용어 없이 2~3문장으로 설명해. 따뜻하고 친근한 말투로.`;
      const user = `복지 혜택 "${name}"에 대한 설명이야. 쉽게 풀어서 설명해줘:\n${text || name}`;
      const out = await callGPT(KEY, sys, user, false);
      return res.json({ text: out });
    }

    return res.status(400).json({ error: '알 수 없는 action' });
  } catch (e) {
    console.error('gpt-assist error:', e);
    return res.status(500).json({ error: e.message });
  }
};

async function callGPT(key, sys, user, jsonMode) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    max_tokens: 900,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`OpenAI ${r.status}: ${e.error?.message || r.statusText}`);
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}
