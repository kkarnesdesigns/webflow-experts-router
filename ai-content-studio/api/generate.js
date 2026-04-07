/**
 * Generate or revise body content for a single CMS item.
 *
 * POST body:
 * {
 *   collection: 'skills' | 'categories' | ...,
 *   itemId: '...',                 // optional - we'll fetch fresh data if given
 *   item: {                        // or pass the item context inline
 *     name, slug, body (current), extra: { ... }
 *   },
 *   instructions: 'optional free-text instructions',
 *   history: [                    // prior turns for revision loops
 *     { role: 'assistant', content: '<html>...</html>' },
 *     { role: 'user', content: 'make it shorter' }
 *   ]
 * }
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, readJsonBody, getCollection } = require('../lib/config');
const { getFieldMap } = require('../lib/field-map');
const { callClaude, buildSystemPrompt, MODEL } = require('../lib/claude');
const styleGuide = require('../lib/style-guide-store');

async function loadItem(col, itemId) {
  const token = process.env.WEBFLOW_API_TOKEN;
  const api = new WebflowAPI(token);
  const { data } = await api.client.get(
    `/collections/${col.id}/items/${itemId}`
  );
  return data;
}

function buildInitialUserTurn({ col, item, instructions, fields }) {
  const fd = item.fieldData || {};
  const contextLines = [
    `Collection: ${col.label}`,
    `Name: ${fd.name || item.name || ''}`,
    `Slug: ${fd.slug || item.slug || ''}`,
  ];
  // Include any short-text context fields that exist on this collection.
  for (const f of fields.allFields || []) {
    if (f.slug === fields.body || f.slug === 'name' || f.slug === 'slug') continue;
    if (!['PlainText', 'Text', 'Link'].includes(f.type)) continue;
    const val = fd[f.slug];
    if (val && typeof val === 'string' && val.length < 500) {
      contextLines.push(`${f.name}: ${val}`);
    }
  }

  const currentBody = (fields.body && fd[fields.body]) || item.body || '';

  let prompt =
    `Rewrite the page body content for the following CMS item.\n\n` +
    `## Context\n${contextLines.join('\n')}\n\n`;

  if (currentBody) {
    prompt += `## Current body (HTML)\n${currentBody}\n\n`;
  } else {
    prompt += `## Current body\n(empty — write a new one from scratch)\n\n`;
  }

  if (instructions && instructions.trim()) {
    prompt += `## Additional instructions\n${instructions.trim()}\n\n`;
  }

  prompt +=
    `Return the rewritten body as clean semantic HTML only, with no markdown fences or commentary.`;

  return prompt;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  try {
    const body = await readJsonBody(req);
    const col = getCollection(body.collection);
    if (!col) {
      return res.status(400).json({ error: 'Unknown collection' });
    }

    const fields = await getFieldMap(col.id);

    let item = body.item;
    if (body.itemId) {
      item = await loadItem(col, body.itemId);
    }
    if (!item) {
      return res.status(400).json({ error: 'item or itemId required' });
    }

    const system = buildSystemPrompt(styleGuide.read());

    // Build the conversation. history lets the UI keep revising.
    const history = Array.isArray(body.history) ? body.history.slice() : [];
    const messages = [];

    const initialUserTurn = buildInitialUserTurn({
      col,
      item,
      instructions: body.instructions,
      fields,
    });
    messages.push({ role: 'user', content: initialUserTurn });

    for (const turn of history) {
      if (!turn || !turn.role || !turn.content) continue;
      messages.push({ role: turn.role, content: turn.content });
    }

    const { text } = await callClaude({ system, messages, maxTokens: 2500 });

    res.status(200).json({
      ok: true,
      model: MODEL,
      content: text,
      // Echo the new turns so the client can append them to its history:
      turns: [
        { role: 'user', content: initialUserTurn, synthetic: true },
        { role: 'assistant', content: text },
      ],
    });
  } catch (err) {
    console.error('generate error:', err);
    res.status(500).json({ error: err.message });
  }
};
