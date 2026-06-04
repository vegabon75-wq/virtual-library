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

  const { docText, docTitle, history } = req.body;
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: '질문이 없습니다.' });
  }

  const systemPrompt =
    '당신은 아래 문서에 대해 답하는 한국어 독서 도우미 AI입니다.\n' +
    '규칙:\n' +
    '1. 반드시 아래 문서 내용에만 근거해 답하세요.\n' +
    '2. 문서에 없는 내용은 지어내지 말고 "문서에서 찾을 수 없습니다"라고 답하세요.\n' +
    '3. 답변은 한국어로 간결하고 명확하게 작성하세요.\n' +
    '4. 가능하면 근거가 된 부분을 짧게 인용하세요.\n\n' +
    `==== 문서 제목: ${docTitle || '문서'} ====\n` +
    `${(docText || '').slice(0, 16000)}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-12).map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '')
    }))
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
        temperature: 0.3
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error?.message || `HTTP ${resp.status}`;
      return res.status(resp.status).json({ error: msg });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: '응답에서 텍스트를 추출할 수 없습니다.' });
    }

    res.json({ reply });

  } catch (err) {
    console.error('[/api/chat] 오류:', err.message);
    res.status(500).json({ error: err.message || '서버 내부 오류' });
  }
};
