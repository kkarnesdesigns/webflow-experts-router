/**
 * List items from a configured collection with simple search / pagination.
 * Uses the auto-detected field map from field-map.js so we don't depend on
 * hard-coded slugs.
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, getCollection } = require('../lib/config');
const { getFieldMap } = require('../lib/field-map');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) throw new Error('WEBFLOW_API_TOKEN not set');

    const col = getCollection(req.query.collection);
    if (!col) {
      return res.status(400).json({
        error: `Unknown or unconfigured collection: ${req.query.collection}`,
      });
    }

    const fields = await getFieldMap(col.id);

    const q = (req.query.q || '').toString().toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);

    const api = new WebflowAPI(token);
    const raw = await api.getCollectionItems(col.id);

    const items = raw
      .filter((it) => !it.isArchived && !it.fieldData?.isArchived)
      .map((it) => {
        const fd = it.fieldData || {};
        return {
          id: it.id,
          name: fd.name || '',
          slug: fd.slug || '',
          hasBody: fields.body ? !!fd[fields.body] : false,
          aiVersion: fields.version ? fd[fields.version] || '' : '',
          lastRefresh: fields.refresh ? fd[fields.refresh] || '' : '',
          aiLock: fields.lock ? !!fd[fields.lock] : false,
        };
      });

    const filtered = q
      ? items.filter(
          (i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q)
        )
      : items;

    res.status(200).json({
      collection: col.key,
      fields,
      total: filtered.length,
      offset,
      limit,
      items: filtered.slice(offset, offset + limit),
    });
  } catch (err) {
    console.error('items error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};
