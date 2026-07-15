require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory cache
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(question) {
  return crypto.createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.answer;
}

function setCache(key, answer) {
  cache.set(key, { answer, timestamp: Date.now() });
}

// HTTP helper
const TIMEOUT_MS = 18000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Provider timed out')), ms)
    ),
  ]);
}

async function fetchJSON(url, options) {
  const fetch = require('node-fetch');
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Provider: Groq (LLaMA-3.1-8b-instant)
async function callGroq(question) {
  const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 180,
      messages: [{ role: 'user', content: `Answer in 2-3 sentences, no preamble: ${question}` }],
    }),
  });
  return data.choices[0].message.content.trim();
}

// Provider: Groq (LLaMA-3.3-70b-versatile — second voice)
async function callGroq2(question) {
  const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 180,
      messages: [{ role: 'user', content: `Answer in 2-3 sentences, no preamble: ${question}` }],
    }),
  });
  return data.choices[0].message.content.trim();
}

// Provider: OpenRouter (free auto-routed model — third voice)
async function callOpenRouter(question) {
  const data = await fetchJSON('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/anup2301/ai-council',
      'X-Title': 'AI Council',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      max_tokens: 180,
      messages: [{ role: 'user', content: `Answer in 2-3 sentences, no preamble: ${question}` }],
    }),
  });
  const text = data.choices[0].message.content.trim();
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

// Judge: Gemini (tries multiple models, falls back to Groq judge)
async function callGeminiJudge(question, answers) {
  const answersBlock = answers.map((a, i) => `Perspective ${i + 1}: ${a}`).join('\n\n');
  const prompt =
    `You are a synthesis engine. Given a question and several perspectives, ` +
    `produce a single, clear, comprehensive consensus answer. ` +
    `Resolve any disagreements concisely. Do not mention the perspectives. ` +
    `Just deliver the final answer directly.\n\nQuestion: ${question}\n\n${answersBlock}`;

  const geminiModels = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite-001',
  ];

  let lastError;
  for (const model of geminiModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const data = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400 },
        }),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        console.log(`[JUDGE] Used Gemini model: ${model}`);
        return text;
      }
    } catch (err) {
      console.warn(`[JUDGE] Gemini ${model} failed: ${err.message.slice(0, 80)}`);
      lastError = err;
    }
  }
  throw lastError || new Error('All Gemini judge models failed');
}

// Fallback judge: Groq
async function callGroqJudge(question, answers) {
  const answersBlock = answers.map((a, i) => `Perspective ${i + 1}: ${a}`).join('\n\n');
  const prompt =
    `Synthesize these perspectives into one clear consensus answer. ` +
    `Don't mention the perspectives. Just deliver the final answer.\n\nQuestion: ${question}\n\n${answersBlock}`;
  const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  return data.choices[0].message.content.trim();
}

// POST /ask
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A non-empty question is required.' });
  }

  const trimmed = question.trim();
  const cacheKey = getCacheKey(trimmed);

  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log('[CACHE HIT]', trimmed.slice(0, 60));
    return res.json({ answer: cached, cached: true });
  }

  console.log('[ASK]', trimmed.slice(0, 80));

  // Round 1: parallel
  const providerCalls = [
    { name: 'Groq LLaMA-3.1-8b',   fn: () => callGroq(trimmed) },
    { name: 'Groq LLaMA-3.3-70b',  fn: () => callGroq2(trimmed) },
    { name: 'OpenRouter free',      fn: () => callOpenRouter(trimmed) },
  ];

  const results = await Promise.allSettled(
    providerCalls.map(({ name, fn }) =>
      withTimeout(fn(), TIMEOUT_MS).catch((err) => {
        console.warn(`[PROVIDER FAIL] ${name}: ${err.message.slice(0, 80)}`);
        throw err;
      })
    )
  );

  const successfulAnswers = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter(Boolean);

  console.log(`[ROUND 1] ${successfulAnswers.length}/${providerCalls.length} providers succeeded`);

  if (successfulAnswers.length === 0) {
    return res.status(502).json({ error: 'All AI providers failed. Please try again in a moment.' });
  }

  if (successfulAnswers.length === 1) {
    setCache(cacheKey, successfulAnswers[0]);
    return res.json({ answer: successfulAnswers[0], cached: false });
  }

  // Round 2: judge
  let finalAnswer;
  try {
    finalAnswer = await withTimeout(callGeminiJudge(trimmed, successfulAnswers), TIMEOUT_MS);
  } catch (err) {
    console.warn('[JUDGE] Gemini failed, trying Groq judge');
    try {
      finalAnswer = await withTimeout(callGroqJudge(trimmed, successfulAnswers), TIMEOUT_MS);
      console.log('[JUDGE] Groq fallback judge used');
    } catch (err2) {
      console.warn('[JUDGE] All judges failed, using longest answer');
      finalAnswer = successfulAnswers.reduce((a, b) => (b.length > a.length ? b : a));
    }
  }

  setCache(cacheKey, finalAnswer);
  // Only final answer is returned — no intermediate data
  return res.json({ answer: finalAnswer, cached: false });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: cache.size });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌐 AI Council server running on http://localhost:${PORT}\n`);
});
