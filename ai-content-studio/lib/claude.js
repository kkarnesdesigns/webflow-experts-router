/**
 * Thin Claude Messages API wrapper for the AI Content Studio.
 *
 * Generation now asks Claude for a JSON object keyed by field.key, so one
 * request can produce both Meta Description (short plain text) and Long SEO
 * Description (rich HTML) in a single turn.
 */

const MODEL = process.env.AI_STUDIO_MODEL || 'claude-sonnet-4-5';

async function callClaude({ system, messages, maxTokens = 2500 }) {
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

function buildSystemPrompt(styleGuide, editableFields) {
  const fieldDocs = editableFields
    .map((f) => {
      if (f.kind === 'short') {
        return `- "${f.key}" (${f.label}): a single-line plain text meta description, ${f.targetMin}-${f.targetMax} characters, no HTML, no surrounding quotes.`;
      }
      return `- "${f.key}" (${f.label}): rich body content as clean semantic HTML, ~${f.targetMinWords}-${f.targetMaxWords} words. Use <h2>, <h3>, <p>, <ul>, <li>. No <html>, <body>, <script>, no inline styles, no markdown fences.`;
    })
    .join('\n');

  const base = `You are a senior SEO content writer for a marketplace that connects clients with Webflow experts. You rewrite CMS content for category / skill / certification landing pages.

## Output format
Return ONLY a single JSON object (no prose, no markdown fences) with exactly these keys:
${fieldDocs}

## Rules
- Keep it factual. Do not invent statistics, names, certifications, or credentials.
- Tone: confident, helpful, specific.
- The meta description must be compelling and include the primary keyword naturally.
- The long SEO description should be well-structured with subheadings and be genuinely useful to readers.
- In the long SEO HTML, insert an empty spacer paragraph (\`<p><br></p>\`) immediately after every closing \`</p>\` to create a visible blank line before the next block. Do NOT insert a spacer after headings (\`</h2>\`, \`</h3>\`, \`</h4>\`) or between a heading and the paragraph that follows it.
- If the user message includes a "Candidate Gyde links" section, the closing paragraph must include **2–3** links picked from that list, each as a plain \`<a href="...">\` tag with natural anchor text woven into the sentence. Prefer pages at a BROADER location scope than the current page (city → state, state → nationwide). Never invent a URL and never link to the current page itself. The \`/hire\` fallback is only acceptable if no better candidate is supplied.`;

  if (styleGuide && styleGuide.trim()) {
    return `${base}\n\n## Style Guide\n${styleGuide.trim()}`;
  }
  return base;
}

/**
 * Normalise spacer paragraphs in a long-SEO HTML body.
 *
 * Strips any existing empty spacer paragraphs, then inserts exactly one
 * `<p><br></p>` after each closing `</p>` that is followed by another block
 * element. Headings (`</h2>`, `</h3>`, `</h4>`) intentionally get no spacer
 * after them — the heading already provides visual separation above the
 * paragraph that follows. Idempotent: running twice yields the same output.
 */
function addParagraphSpacing(html) {
  if (!html || typeof html !== 'string') return html;
  const nextBlock = '(?:p|h2|h3|h4|ul|ol|blockquote)';
  const existingSpacer = /<p[^>]*>\s*(?:<br\s*\/?\s*>|&nbsp;|\s)*\s*<\/p>/gi;
  const stripped = html.replace(existingSpacer, '');
  const afterParagraph = new RegExp(`(</p>)\\s*(<${nextBlock}\\b)`, 'gi');
  return stripped.replace(afterParagraph, `$1<p><br></p>$2`);
}

/**
 * Parse Claude's JSON response. Tolerates code fences and leading prose.
 */
function parseJsonResponse(text) {
  if (!text) return null;
  let cleaned = text.trim();
  // Strip ```json ... ``` fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Find the outermost JSON object if there's surrounding text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

module.exports = { callClaude, buildSystemPrompt, parseJsonResponse, addParagraphSpacing, MODEL };
