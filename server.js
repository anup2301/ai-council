require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory cache ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

// ─── HTTP helper ─────────────────────────────────────────────
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

// ─── Provider: Groq ─────────────────────────────────────────────
asyc function callGroq(question) {
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
