/**
 * Generate or revise editable-field content for a single CMS item.
 *
 * Returns a JSON object keyed by field.key (e.g. { meta, longSeo }).
 *
 * POST body:
 * {
 *   collection: 'skills' | 'certifications',
 *   itemId: '...',                  // required
 *   instructions: '...',            // optional extra guidance
 *   history: [                      // optional prior turns for revision loops
 *     { role: 'assistant', content: '{"meta": "...", "longSeo": "..."}' },
 *     { role: 'user', content: 'make it shorter' }
 *   ],
 *   currentValues: { meta, longSeo } // optional override - the edited values
 *                                    // the user is currently looking at
 * }
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, readJsonBody, getCollection } = require('../lib/config');
const { getEditableFields, isSupported } = require('../lib/editable-fields');
const {
  callClaude,
  buildSystemPrompt,
  parseJsonResponse,
  addParagraphSpacing,
  MODEL,
} = require('../lib/claude');
const styleGuide = require('../lib/style-guide-store');
const { findRelevantLinks, formatLinksForPrompt } = require('../lib/link-candidates');

async function loadItem(col, itemId) {
  const token = process.env.WEBFLOW_API_TOKEN;
  const api = new WebflowAPI(token);
  const { data } = await api.client.get(`/collections/${col.id}/items/${itemId}`);
  return data;
}

function buildInitialUserTurn({ col, item, instructions, editableFields, currentValues, linkBlock }) {
  const fd = item.fieldData || {};
  const lines = [
    `Collection: ${col.label}`,
    `Name: ${fd.name || ''}`,
    `Slug: ${fd.slug || ''}`,
  ];

  // Include any short scalar context fields that might be useful.
  for (const [slug, val] of Object.entries(fd)) {
    if (slug === 'name' || slug === 'slug') continue;
    if (editableFields.some((f) => f.slug === slug)) continue;
    if (typeof val !== 'string') continue;
    if (val.length > 300) continue;
    if (!val.trim()) continue;
    lines.push(`${slug}: ${val}`);
  }

  let prompt = `Rewrite the following CMS fields for this item.\n\n## Context\n${lines.join('\n')}\n\n`;

  prompt += `## Current values\n`;
  for (const f of editableFields) {
    const current = (currentValues && currentValues[f.key]) || fd[f.slug] || '';
    prompt += `### ${f.label} (${f.key})\n${current || '(empty — write a new one)'}\n\n`;
  }

  if (linkBlock) {
    prompt += `${linkBlock}\n\n`;
  }

  if (instructions && instructions.trim()) {
    prompt += `## Additional instructions\n${instructions.trim()}\n\n`;
  }

  prompt += `Return ONLY the JSON object with keys: ${editableFields.map((f) => `"${f.key}"`).join(', ')}.`;
  return prompt;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const body = await readJsonBody(req);
    const col = getCollection(body.collection);
    if (!col) return res.status(400).json({ error: 'Unknown collection' });
    if (!isSupported(col.key)) {
      return res.status(400).json({
        error: `Collection "${col.key}" has no AI-editable fields configured.`,
      });
    }

    const { fields: allEditableFields } = getEditableFields(col.key);

    const requested = Array.isArray(body.fields) && body.fields.length
      ? allEditableFields.filter((f) => body.fields.includes(f.key))
      : allEditableFields;
    if (!requested.length) {
      return res.status(400).json({ error: 'No valid fields selected' });
    }
    const editableFields = requested;

    if (!body.itemId) return res.status(400).json({ error: 'itemId is required' });
    const item = await loadItem(col, body.itemId);

    const system = buildSystemPrompt(styleGuide.read(), editableFields);

    // Only bother fetching link candidates when we're generating a long body.
    const needsLinks = editableFields.some((f) => f.kind === 'long');
    const links = needsLinks ? await findRelevantLinks(col.key, item, 10) : [];
    const linkBlock = formatLinksForPrompt(links);

    const messages = [];
    const initialUserTurn = buildInitialUserTurn({
      col,
      item,
      instructions: body.instructions,
      editableFields,
      currentValues: body.currentValues,
      linkBlock,
    });
    messages.push({ role: 'user', content: initialUserTurn });

    for (const turn of Array.isArray(body.history) ? body.history : []) {
      if (!turn || !turn.role || !turn.content) continue;
      messages.push({ role: turn.role, content: turn.content });
    }

    const { text } = await callClaude({ system, messages, maxTokens: 2500 });
    const parsed = parseJsonResponse(text);

    if (!parsed) {
      return res.status(502).json({
        error: 'Claude returned unparseable JSON',
        raw: text,
      });
    }

    // Only keep the keys we asked for. Long-form fields get spacer paragraphs
    // inserted between blocks so the rendered Webflow page has visible breaks
    // between paragraphs/headers regardless of what Claude returned.
    const values = {};
    for (const f of editableFields) {
      let value = typeof parsed[f.key] === 'string' ? parsed[f.key] : '';
      if (f.kind === 'long' && value) value = addParagraphSpacing(value);
      values[f.key] = value;
    }

    res.status(200).json({
      ok: true,
      model: MODEL,
      values,
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
