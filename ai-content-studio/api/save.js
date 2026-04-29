/**
 * Save approved values back to the Webflow CMS item.
 *
 * POST body (single):
 * {
 *   collection: 'skills' | 'certifications',
 *   itemId: '...',
 *   values: { meta: '...', longSeo: '...' },
 *   publish: false
 * }
 *
 * POST body (batch):
 * {
 *   collection: 'skills',
 *   publish: false,
 *   items: [{ itemId, values: { meta, longSeo } }, ...]
 * }
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, readJsonBody, getCollection } = require('../lib/config');
const { getEditableFields, isSupported } = require('../lib/editable-fields');

// Quill 2.x's getSemanticHTML() round-trip can replace ASCII spaces with
// &nbsp; / U+00A0 between every word, which prevents text wrapping on the
// rendered page (Webflow strips paragraph wrapping when nbsp runs are long).
// Strip them out of long-form HTML before write so contamination can't reach
// the CMS regardless of what the client sends.
function sanitizeLongValue(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

function buildFieldUpdate(editableFields, values) {
  const update = {};
  for (const f of editableFields) {
    if (values && typeof values[f.key] === 'string') {
      update[f.slug] = f.kind === 'long' ? sanitizeLongValue(values[f.key]) : values[f.key];
    }
  }
  return update;
}

async function saveOne(api, col, editableFields, entry, publish) {
  const fieldUpdate = buildFieldUpdate(editableFields, entry.values);
  if (!Object.keys(fieldUpdate).length) {
    throw new Error('No editable field values supplied');
  }
  const updated = await api.updateCollectionItem(col.id, entry.itemId, fieldUpdate, !publish);
  return {
    itemId: entry.itemId,
    ok: true,
    updatedId: updated?.id,
    applied: Object.keys(fieldUpdate),
  };
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
    if (!isSupported(col.key)) {
      return res.status(400).json({
        error: `Collection "${col.key}" has no AI-editable fields configured.`,
      });
    }

    const { fields: editableFields } = getEditableFields(col.key);
    const publish = !!body.publish;
    const api = new WebflowAPI(token);

    const entries = Array.isArray(body.items)
      ? body.items
      : [{ itemId: body.itemId, values: body.values }];

    if (!entries.length || !entries.every((e) => e.itemId && e.values)) {
      return res.status(400).json({ error: 'itemId and values required for every entry' });
    }

    const results = [];
    for (const entry of entries) {
      try {
        results.push(await saveOne(api, col, editableFields, entry, publish));
      } catch (err) {
        console.error('save error for', entry.itemId, err.response?.data || err.message);
        results.push({ itemId: entry.itemId, ok: false, error: err.message });
      }
    }

    let publishWarning = null;
    if (publish) {
      const ids = results.filter((r) => r.ok).map((r) => r.itemId);
      if (ids.length) {
        try {
          await api.publishCollectionItems(col.id, ids);
        } catch (err) {
          const msg = err.response?.data?.message || err.message;
          console.error('publish error:', err.response?.data || err.message);
          publishWarning = msg;
          // PATCH /live already publishes per-item, but if the bulk publish
          // call fails (e.g. permissions, rate limit) callers deserve to know
          // — flip ok:false on each entry so the UI surfaces it.
          for (const r of results) {
            if (r.ok) {
              r.ok = false;
              r.error = `Bulk publish failed: ${msg}`;
            }
          }
        }
      }
    }

    res.status(200).json({ ok: true, results, publishWarning });
  } catch (err) {
    console.error('save error:', err);
    res.status(500).json({ error: err.message });
  }
};
