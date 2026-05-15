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
  const hasKey = !!(process.env.VITE_GEMINI_API_KEY);
  res.json({ hasKey });
});

// ─────────────────────────────────────────
// API: Gemini 요약 프록시 (Gemini Summary Proxy)
// 클라이언트는 API 키를 모르고, 서버가 대신 Gemini 호출
// ─────────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 VITE_GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'
    });
  }

  const { content, fileTitle, fileExt } = req.body;

  // 요약할 내용 없음 (No content to summarize)
  if (!content || content.trim().length < 5) {
    return res.status(400).json({ error: '요약할 내용이 없습니다.' });
  }

  // Gemini 프롬프트 구성 (Construct Gemini prompt)
  const prompt =
    '당신은 독서 도우미 AI입니다. 아래 문서 내용을 분석하여 한국어로 핵심 요약을 작성해주세요.\n\n' +
    `**파일명**: ${fileTitle || '문서'} (${fileExt || ''})\n\n` +
    '**요약 형식**:\n' +
    '1. 📌 핵심 주제 (1~2문장)\n' +
    '2. 🔑 주요 내용 (3~5개 불릿 포인트)\n' +
    '3. 💡 특이사항 또는 인상적인 부분\n\n' +
    '**문서 내용**:\n' + content.slice(0, 12000);

  try {
    // @google/generative-ai SDK 사용 (Use official Gemini SDK)
    const { GoogleGenerativeAI } = require('@google/generative-ai');

    // API 키와 v1beta 버전으로 클라이언트 초기화 (Initialize client with API key and v1beta)
    const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: 'v1beta' });

    // .env 의 GEMINI_MODEL 값 우선, 없으면 기본 모델 사용
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature:     0.5,
        maxOutputTokens: 1024
      }
    });

    // 요약 생성 요청 (Generate summary)
    const genResult = await model.generateContent(prompt);
    const result    = genResult.response.text();

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
  const apiKey   = process.env.VITE_GEMINI_API_KEY;
  const model    = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';
  console.log('\n🕯️  나의 가상 서재 서버');
  console.log('─────────────────────────────');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Gemini API 키: ${apiKey ? '✅ 설정됨' : '❌ 미설정 (.env 확인 필요)'}`);
  console.log(`   사용 모델:     ${model}`);
  console.log('─────────────────────────────\n');
});
