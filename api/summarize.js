'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: '서버에 VITE_GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.'
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
    const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: 'v1beta' });
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 }
    });

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
};
