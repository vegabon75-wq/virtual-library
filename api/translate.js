'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 GROQ_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.'
    });
  }

  const { text } = req.body;
  if (!text || String(text).trim().length < 1) {
    return res.status(400).json({ error: '번역할 내용이 없습니다.' });
  }

  const systemPrompt =
    '당신은 전문 번역가입니다. 사용자가 보낸 텍스트를 번역하는 일만 합니다.\n' +
    '규칙:\n' +
    '1. 입력이 한국어가 아니면 자연스러운 한국어로, 한국어이면 자연스러운 영어로 번역하세요.\n' +
    '2. 의미를 보존하되 직역투를 피하고 매끄럽게 다듬으세요.\n' +
    '3. 설명·해설·원문·따옴표를 덧붙이지 말고 번역 결과만 출력하세요.\n' +
    '4. 고유명사·코드·숫자·서식은 임의로 바꾸지 마세요.';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: String(text).slice(0, 4000) }
  ];

  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        max_tokens: 1024,
        temperature: 0.2
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error?.message || `HTTP ${resp.status}`;
      return res.status(resp.status).json({ error: msg });
    }

    const translation = data.choices?.[0]?.message?.content;
    if (!translation) {
      return res.status(500).json({ error: '응답에서 번역 결과를 추출할 수 없습니다.' });
    }

    res.json({ translation });

  } catch (err) {
    console.error('[/api/translate] 오류:', err.message);
    res.status(500).json({ error: err.message || '서버 내부 오류' });
  }
};
