# AI Council — Consensus Intelligence Engine

> Ask any question and receive a single, synthesized consensus answer from multiple AI models deliberating in parallel.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

## How It Works

1. **Parallel Round** — Your question is sent simultaneously to three AI models (Groq/LLaMA-3.1-8b, Groq/LLaMA-3.3-70b, OpenRouter free model).
2. **Judge Round** — Answers are merged by a judge model (Gemini Flash, falling back to Groq) into one consensus answer.
3. **Cache** — Repeat questions skip the API round-trips entirely (5-minute TTL).
4. **Privacy** — Intermediate model reasoning is *never* sent to the browser. Only `{ answer }` is returned.

## Setup

```bash
git clone https://github.com/anup2301/ai-council.git
cd ai-council
npm install
```

Create a `.env` file:
```env
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
PORT=3000
```

Then run:
```bash
npm start        # production
npm run dev      # development (nodemon)
```

Open http://localhost:3000

## API

### POST /ask
**Request:** `{ "question": "..." }`  
**Response:** `{ "answer": "...", "cached": false }`

Only the final consensus answer is returned. No intermediate model outputs are ever included.

## Security
- API keys stored in `.env` (gitignored, never committed)
- Frontend never receives intermediate model answers or reasoning chains

## License
MIT
