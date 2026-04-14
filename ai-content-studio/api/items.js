/**
 * List items from a configured collection with simple search / pagination.
 * Returns a summary of whether each editable field is already populated.
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, getCollection } = require('../lib/config');
const { getEditableFields } = require('../lib/editable-fields');

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

    const { fields } = getEditableFields(col.key);
    const q = (req.query.q || '').toString().toLowerCase().trim();
    // Webflow Business plan caps collections at 10k items. Allow up to 20k
    // here so the studio can return a whole collection in one call.
    const limit = Math.min(parseInt(req.query.limit || '20000', 10), 20000);
    const offset = parseInt(req.query.offset || '0', 10);

    const api = new WebflowAPI(token);
    const raw = await api.getCollectionItems(col.id);

    const items = raw
      .filter((it) => !it.isArchived && !it.fieldData?.isArchived)
      .map((it) => {
        const fd = it.fieldData || {};
        const populated = {};
        for (const f of fields) {
          populated[f.key] = !!fd[f.slug];
        }
        return {
          id: it.id,
          name: fd.name || '',
          slug: fd.slug || '',
          lastUpdated: it.lastUpdated || null,
          lastPublished: it.lastPublished || null,
          createdOn: it.createdOn || null,
          populated,
        };
      });

    const filtered = q
      ? items.filter(
          (i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q)
        )
      : items;

    res.status(200).json({
      collection: col.key,
      editableFields: fields,
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
