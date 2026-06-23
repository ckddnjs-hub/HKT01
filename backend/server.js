import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const app = express();
app.use(cors());
app.use(express.json());

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ── 프로필 → 사람 말 요약 ──────────────────────────────────────────────
function profileToText(p) {
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : '미상';
  const lines = [
    `- 성별: ${p.gender === 'male' ? '남성' : p.gender === 'female' ? '여성' : '미상'}`,
    `- 나이: ${age}세`,
    `- 거주 지역: ${[p.region, p.district].filter(Boolean).join(' ') || '미상'}`,
    `- 가구 구성: ${{ single:'1인 가구', couple:'부부', family:'자녀포함 가족', single_parent:'한부모 가정', extended:'다세대 가구', other:'기타' }[p.household_type] || '미상'} (${p.household_size || 1}인)`,
    `- 소득 수준: 중위소득 ${p.income_level || '미상'}% / 월 ${p.income_amount || '미상'}만원`,
    `- 거주 형태: ${{ own:'자가', jeonse:'전세', monthly_rent:'월세', public:'공공임대', other:'기타' }[p.housing_type] || '미상'}`,
    `- 취업 상태: ${{ employed:'재직중', unemployed:'미취업', self_employed:'자영업', student:'학생', retired:'은퇴' }[p.employment_status] || '미상'}`,
    p.has_disability ? `- 장애 여부: 있음 (${p.disability_grade || '등급 미입력'})` : null,
    p.has_pregnancy ? '- 임신/출산 해당' : null,
    p.has_infant ? '- 영유아(만 6세 이하) 자녀 있음' : null,
    p.is_single_parent ? '- 한부모 가정' : null,
    p.is_low_income ? '- 기초생활수급자 또는 차상위계층' : null,
  ].filter(Boolean);
  return lines.join('\n');
}

// ── POST /api/chat — AI 혜택 상담 ──────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { userId, profile, message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const profileText = profile ? profileToText(profile) : '(프로필 미입력)';
  const systemPrompt = `당신은 대한민국 복지 혜택 전문가 AI입니다. 사용자의 상황에 딱 맞는 정부 혜택과 신청 전략을 안내합니다.

## 사용자 프로필
${profileText}

## 답변 원칙
- 이 프로필 기반으로 실제 수급 가능한 혜택만 안내
- 혜택명, 지원 금액, 신청처, 필요 서류를 구체적으로 명시
- 신청 마감일이 임박한 혜택은 강조
- 복지로(bokjiro.go.kr), 정부24(gov.kr) 등 공식 채널 안내
- 친근하고 쉬운 말투, 고령층도 이해할 수 있게`;

  const messages = [
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';
    const stream = claude.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      fullContent += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    // Supabase에 대화 저장
    if (userId) {
      await sb.from('conversations').insert([
        { user_id: userId, role: 'user', content: message },
        { user_id: userId, role: 'assistant', content: fullContent },
      ]);
    }
  } catch (e) {
    console.error(e);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// ── POST /api/strategy — AI 전략 분석 (JSON 구조화 응답) ───────────────
app.post('/api/strategy', async (req, res) => {
  const { userId, profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'profile required' });

  const profileText = profileToText(profile);
  const prompt = `다음 사용자 프로필을 분석하여 맞춤형 복지 혜택 전략을 JSON으로 반환하세요.

## 사용자 프로필
${profileText}

## 반환 JSON 형식 (반드시 이 형식 준수, 마크다운 코드블록 없이 순수 JSON만):
{
  "benefits": [
    {
      "name": "혜택명",
      "category": "주거지원|생활지원|돌봄지원|교육지원|자산형성|의료지원",
      "description": "한 줄 설명",
      "amount": "지원 금액 (예: 월 최대 33만원)",
      "urgency": 1~10,
      "impact": 1~10,
      "deadline": "YYYY-MM-DD 또는 null",
      "how_to_apply": "신청 방법",
      "apply_url": "복지로 또는 정부24 URL"
    }
  ],
  "strategy_summary": "3~4문장 전략 요약",
  "radar_scores": {
    "주거지원": 0~100,
    "생활지원": 0~100,
    "돌봄지원": 0~100,
    "교육지원": 0~100,
    "자산형성": 0~100,
    "의료지원": 0~100
  },
  "navigation_path": [
    { "label": "현재", "monthly_amount": 0, "type": "current" },
    { "label": "혜택명", "monthly_amount": 숫자(만원), "type": "benefit" },
    { "label": "목표", "monthly_amount": 0, "type": "goal" }
  ],
  "urgent_actions": ["지금 당장 해야 할 일 1", "지금 당장 해야 할 일 2"]
}`;

  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].text.trim();
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const result = JSON.parse(jsonStr);

    if (userId) {
      await sb.from('benefit_results').insert([{ user_id: userId, query: 'strategy', result }]);
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/push/subscribe — 푸시 구독 저장 ─────────────────────────
app.post('/api/push/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: 'missing fields' });
  const { error } = await sb.from('push_subscriptions')
    .upsert({ user_id: userId, subscription }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── POST /api/push/send — 푸시 발송 (서버→클라이언트) ──────────────────
app.post('/api/push/send', async (req, res) => {
  const { userId, title, body } = req.body;
  const { data } = await sb.from('push_subscriptions').select('subscription').eq('user_id', userId).single();
  if (!data) return res.status(404).json({ error: 'no subscription' });
  try {
    await webpush.sendNotification(data.subscription, JSON.stringify({ title, body }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ 복지AI 백엔드 :${PORT}`));
