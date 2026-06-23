// Vercel 서버리스 함수 — 프론트엔드 공개 설정값 전달
// 환경변수: KAKAO_MAP_KEY (카카오 지도 JavaScript 앱키)
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // 짧게 캐싱 (10분) — 키는 자주 바뀌지 않음
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.status(200).json({
    kakaoKey: process.env.KAKAO_MAP_KEY || '',
    advisorUrl: process.env.ADVISOR_URL || '',
  });
};
