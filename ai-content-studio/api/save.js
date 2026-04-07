/**
 * Save approved content back to the Webflow CMS item.
 *
 * POST body:
 * {
 *   collection: 'skills',
 *   itemId: '...',
 *   content: '<html body>',
 *   publish: false,                // default false -> draft
 *   notes: 'optional qa notes'
 * }
 *
 * Supports batch by accepting `items: [{ itemId, content, notes }, ...]`.
 */

const crypto = require('crypto');
const WebflowAPI = require('../../lib/webflow-api');
const { cors, readJsonBody, getCollection, FIELDS } = require('../lib/config');

function fingerprint(content) {
  return crypto.createHash('sha1').update(content || '').digest('hex').slice(0, 16);
}

async function saveOne(api, col, entry, publish) {
  const fieldUpdate = {
    [FIELDS.body]: entry.content,
    [FIELDS.refresh]: new Date().toISOString(),
    [FIELDS.fingerprint]: fingerprint(entry.content),
  };
  if (entry.version) fieldUpdate[FIELDS.version] = entry.version;
  if (entry.notes !== undefined) fieldUpdate[FIELDS.notes] = entry.notes;

  const updated = await api.updateCollectionItem(
    col.id,
    entry.itemId,
    fieldUpdate,
    !publish
  );
  return { itemId: entry.itemId, ok: true, updatedId: updated?.id };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) throw new Error('WEBFLOW_API_TOKEN not set');

    const body = await readJsonBody(req);
    const col = getCollection(body.collection);
    if (!col) return res.status(400).json({ error: 'Unknown collection' });

    const publish = !!body.publish;
    const api = new WebflowAPI(token);

    const entries = Array.isArray(body.items)
      ? body.items
      : [{ itemId: body.itemId, content: body.content, notes: body.notes, version: body.version }];

    if (!entries.length || !entries.every((e) => e.itemId && typeof e.content === 'string')) {
      return res.status(400).json({ error: 'itemId and content required for every entry' });
    }

    const results = [];
    for (const entry of entries) {
      try {
        results.push(await saveOne(api, col, entry, publish));
      } catch (err) {
        console.error('save error for', entry.itemId, err.response?.data || err.message);
        results.push({ itemId: entry.itemId, ok: false, error: err.message });
      }
    }

    // Optionally publish saved items
    if (publish) {
      const ids = results.filter((r) => r.ok).map((r) => r.itemId);
      if (ids.length) {
        try {
          await api.publishCollectionItems(col.id, ids);
        } catch (err) {
          console.error('publish error:', err.response?.data || err.message);
        }
      }
    }

    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('save error:', err);
    res.status(500).json({ error: err.message });
  }
};
