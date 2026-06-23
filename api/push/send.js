// Vercel 서버리스 함수 — 웹푸시 발송
// 환경변수: PUSH_KEY (VAPID 비공개키)
const webpush = require('web-push');

const VAPID_PUBLIC = 'BEGPZAvkXbZXmo7zu8GgFGi_C9cHE2XMf9fkENJ17w-AdTiU-dcNAtBj7xULHciWGGLeNUiY9wH3-BLOK9P0vLI';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드' });

  const PRIVATE = process.env.PUSH_KEY || '';
  if (!PRIVATE) return res.status(500).json({ error: 'PUSH_KEY 환경변수가 설정되지 않았습니다.' });

  try {
    webpush.setVapidDetails('mailto:noreply@hkt-welfare.app', VAPID_PUBLIC, PRIVATE);

    const { subscription, subscriptions, title = '복지혜택 AI 알림', body = '', url = '/' } = req.body || {};
    const targets = (subscriptions && subscriptions.length) ? subscriptions : (subscription ? [subscription] : []);
    if (!targets.length) return res.status(400).json({ error: '구독 정보(subscription)가 없습니다.' });

    const payload = JSON.stringify({ title, body, url });
    const results = await Promise.allSettled(
      targets.map(s => webpush.sendNotification(s, payload))
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    return res.json({ sent, failed });
  } catch (e) {
    console.error('push send error:', e);
    return res.status(500).json({ error: e.message });
  }
};
