# AI Council — Consensus Intelligence Engine

> Ask any question and receive a single, synthesized consensus answer from multiple AI models deliberating in parallel.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

## How It Works

1. **Parallel Round** — Your question is fired simultaneously to **3 AI voices**:
   - Groq / LLaMA-3.1-8b-instant (ultra-fast)
   - Groq / LLaMA-3.3-70b-versatile (high-quality)
   - OpenRouter free-tier model (independent third voice)
2. **Judge Round** — All answers are merged by a judge model (Gemini Flash, with Groq as fallback) into one final consensus answer.
3. **Cache** — Repeat questions skip API calls entirely (SHA-256 keyed, 5-minute TTL).
4. **Privacy** — Intermediate model reasoning is *never* sent to the browser. The `/ask` endpoint only returns `{ answer, cached }`.

## Architecture

```
 Browser
    |
 POST /ask { question }
    |
  Express Server
    |
    +-- [parallel] --> Groq LLaMA-3.1-8b
    +-- [parallel] --> Groq LLaMA-3.3-70b
    +-- [parallel] --> OpenRouter (free)
    |
    +-- [judge]    --> Gemini Flash (fallback: Groq)
    |
  { answer }  <-- only this is returned
```

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Node.js + Express                   |
| Frontend | Plain HTML / Vanilla CSS / Vanilla JS |
| AI APIs  | Groq, Google Gemini, OpenRouter     |
| Cache    | In-memory Map with 5-min TTL        |

## Setup

```bash
git clone https://github.com/anup2301/ai-council.git
cd ai-council
npm install
```

Copy `.env.example` to `.env` and fill in your keys:
```env
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
PORT=3000
```

```bash
npm start        # production
npm run dev      # development with auto-reload
```

Open http://localhost:3000

## API

### `POST /ask`

**Request:**
```json
{ "question": "What is the speed of light?" }
```

**Response:**
```json
{ "answer": "The speed of light in a vacuum is approximately 299,792,458 metres per second...", "cached": false }
```

> **Only the final consensus answer is returned.** No intermediate model outputs, no reasoning chains, no raw provider responses.

### `GET /health`

Returns server status and cache size.

## Features

- **Graceful degradation** — if 1 or 2 providers fail/timeout, the council still deliberates with remaining voices
- **Judge fallback** — if Gemini is rate-limited, Groq acts as the synthesis judge
- **Last-resort** — if all judges fail, returns the longest provider answer
- **18s per-provider timeout** with `Promise.allSettled` (no provider blocks others)
- **Ctrl+Enter** keyboard shortcut to submit
- **Copy to clipboard** button on the answer
- **Typewriter reveal** animation for the final answer
- **Mobile-responsive** dark-mode UI

## Security Notes

- API keys live only in `.env` (gitignored — never committed)
- Frontend JS contains zero secrets or provider references
- The `/ask` endpoint exposes only `{ answer, cached }` — no model names, no intermediate responses, no reasoning

## Project Structure

```
ai-council/
├── server.js          # Express + pipeline logic (never leaks intermediates)
├── public/
│   ├── index.html     # Single-page app
│   ├── style.css      # Dark-mode design system with animations
│   └── app.js         # Frontend logic (no secrets)
├── .env.example       # Template — copy to .env and fill keys
├── .gitignore         # Excludes .env and node_modules
└── package.json
```

## License

MIT
