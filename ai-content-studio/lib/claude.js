/**
 * Thin Claude Messages API wrapper for the AI Content Studio.
 */

const MODEL = process.env.AI_STUDIO_MODEL || 'claude-sonnet-4-5';

async function callClaude({ system, messages, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = (json.content || []).map((p) => p.text || '').join('');
  return { text, raw: json };
}

function buildSystemPrompt(styleGuide) {
  const base = `You are a senior SEO content writer for a marketplace that connects clients with Webflow experts. You rewrite CMS "body" content for location / category / skill / certification landing pages.

Rules:
- Return ONLY the rewritten body as clean HTML (no markdown fences, no preamble).
- Use semantic HTML: <h2>, <h3>, <p>, <ul>, <li>. No inline styles, no <html>, <body>, or <script>.
- Keep it factual. Do not invent statistics, names, or credentials.
- Tone: confident, helpful, locally relevant when a location is present.
- Aim for ~350-550 words unless the user asks otherwise.`;

  if (styleGuide && styleGuide.trim()) {
    return `${base}\n\n# Style Guide\n${styleGuide.trim()}`;
  }
  return base;
}

module.exports = { callClaude, buildSystemPrompt, MODEL };
