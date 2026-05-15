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
