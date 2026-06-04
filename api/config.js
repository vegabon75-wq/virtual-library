'use strict';

// ─────────────────────────────────────────
// Vercel 서버리스 함수 — GET /api/config
// API 키 설정 여부만 반환 (키 값 자체는 노출 안 함)
// ─────────────────────────────────────────
module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const hasKey = !!(process.env.GEMINI_API_KEY);
  res.json({ hasKey });
};
