/**
 * Save approved content back to the Webflow CMS item, using auto-detected
 * field slugs from the collection schema.
 *
 * POST body:
 * {
 *   collection: 'skills',
 *   itemId: '...',
 *   content: '<html body>',
 *   publish: false,
 *   notes: 'optional qa notes',
 *   version: 'optional version string'
 * }
 *
 * Batch: pass `items: [{ itemId, content, notes, version }, ...]`.
 */

const crypto = require('crypto');
const WebflowAPI = require('../../lib/webflow-api');
const { cors, readJsonBody, getCollection } = require('../lib/config');
const { getFieldMap } = require('../lib/field-map');

function fingerprint(content) {
  return crypto.createHash('sha1').update(content || '').digest('hex').slice(0, 16);
}

async function saveOne(api, col, fields, entry, publish) {
  if (!fields.body) {
    throw new Error(
      `Could not auto-detect a body/RichText field on collection ${col.key}. ` +
        `Add a RichText field or set one matching slug 'page-body'/'body'/'content'.`
    );
  }

  const fieldUpdate = { [fields.body]: entry.content };
  if (fields.refresh) fieldUpdate[fields.refresh] = new Date().toISOString();
  if (fields.fingerprint) fieldUpdate[fields.fingerprint] = fingerprint(entry.content);
  if (fields.version && entry.version) fieldUpdate[fields.version] = entry.version;
  if (fields.notes && entry.notes !== undefined) fieldUpdate[fields.notes] = entry.notes;

  const updated = await api.updateCollectionItem(col.id, entry.itemId, fieldUpdate, !publish);
  return { itemId: entry.itemId, ok: true, updatedId: updated?.id, applied: Object.keys(fieldUpdate) };
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

    const fields = await getFieldMap(col.id);
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
        results.push(await saveOne(api, col, fields, entry, publish));
      } catch (err) {
        console.error('save error for', entry.itemId, err.response?.data || err.message);
        results.push({ itemId: entry.itemId, ok: false, error: err.message });
      }
    }

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

    res.status(200).json({ ok: true, fields, results });
  } catch (err) {
    console.error('save error:', err);
    res.status(500).json({ error: err.message });
  }
};
