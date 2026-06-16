'use strict';

// 환경변수 로드 (.env 파일) — require 전에 실행해야 함
require('dotenv').config();

const express  = require('express');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// 미들웨어 (Middleware)
// ─────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));          // JSON 바디 파서 (JSON body parser)
app.use(express.static(path.join(__dirname)));     // 정적 파일 서빙 (Serve static files)

// ─────────────────────────────────────────
// API: 키 설정 여부 확인 (Check if API key is configured)
// 실제 키 값은 절대 클라이언트에 전송하지 않음
// ─────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const hasKey = !!(process.env.GROQ_API_KEY);
  res.json({ hasKey });
});

// ─────────────────────────────────────────
// API: Groq 요약 프록시
// ─────────────────────────────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

app.post('/api/summarize', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 GROQ_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'
    });
  }

  const { content, fileTitle, fileExt } = req.body;

  if (!content || content.trim().length < 5) {
    return res.status(400).json({ error: '요약할 내용이 없습니다.' });
  }

  const prompt =
    '당신은 독서 도우미 AI입니다. 아래 문서 내용을 분석하여 한국어로 핵심 요약을 작성해주세요.\n\n' +
    `**파일명**: ${fileTitle || '문서'} (${fileExt || ''})\n\n` +
    '**요약 형식**:\n' +
    '1. 📌 핵심 주제 (1~2문장)\n' +
    '2. 🔑 주요 내용 (3~5개 불릿 포인트)\n' +
    '3. 💡 특이사항 또는 인상적인 부분\n\n' +
    '**문서 내용**:\n' + content.slice(0, 12000);

  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.5
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error?.message || `HTTP ${resp.status}`;
      return res.status(resp.status).json({ error: msg });
    }

    const result = data.choices?.[0]?.message?.content;
    if (!result) {
      return res.status(500).json({ error: '응답에서 텍스트를 추출할 수 없습니다.' });
    }

    res.json({ result });

  } catch (err) {
    console.error('[/api/summarize] 오류:', err.message);
    res.status(500).json({ error: err.message || '서버 내부 오류' });
  }
});

// ─────────────────────────────────────────
// API: 문서 기반 챗봇 (Groq)
// ─────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 GROQ_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'
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
});

// ─────────────────────────────────────────
// API: 번역 (Groq) — 문서 제약 없는 순수 번역 전용
// ─────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 GROQ_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'
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
});

// ─────────────────────────────────────────
// SPA 폴백 — 모든 미매칭 경로를 index.html 로 (SPA fallback)
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────
// 서버 시작 (Start server)
// ─────────────────────────────────────────
app.listen(PORT, () => {
  const apiKey = process.env.GROQ_API_KEY;
  console.log('\n🕯️  나의 가상 서재 서버');
  console.log('─────────────────────────────');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Groq API 키:   ${apiKey ? '✅ 설정됨' : '❌ 미설정 (.env 확인 필요)'}`);
  console.log(`   사용 모델:     llama-3.1-8b-instant (Groq)`);
  console.log('─────────────────────────────\n');
});
