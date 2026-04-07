/**
 * List items from a configured collection with simple search / pagination.
 * Response items are trimmed down so the UI payload stays small.
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, getCollection, FIELDS } = require('../lib/config');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) throw new Error('WEBFLOW_API_TOKEN not set');

    const collectionKey = req.query.collection;
    const col = getCollection(collectionKey);
    if (!col) {
      return res.status(400).json({
        error: `Unknown or unconfigured collection: ${collectionKey}`,
      });
    }

    const q = (req.query.q || '').toString().toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
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
          hasBody: !!fd[FIELDS.body],
          aiVersion: fd[FIELDS.version] || '',
          lastRefresh: fd[FIELDS.refresh] || '',
          aiLock: !!fd[FIELDS.lock],
        };
      });

    const filtered = q
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.slug.toLowerCase().includes(q)
        )
      : items;

    const paged = filtered.slice(offset, offset + limit);

    res.status(200).json({
      collection: col.key,
      total: filtered.length,
      offset,
      limit,
      items: paged,
    });
  } catch (err) {
    console.error('items error:', err);
    res.status(500).json({ error: err.message });
  }
};
