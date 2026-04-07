/**
 * Fetch a single item with its full fieldData so the editor can show the
 * existing body and AI tracking fields.
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, getCollection, FIELDS } = require('../lib/config');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) throw new Error('WEBFLOW_API_TOKEN not set');

    const col = getCollection(req.query.collection);
    const itemId = req.query.id;
    if (!col || !itemId) {
      return res.status(400).json({ error: 'collection and id are required' });
    }

    const api = new WebflowAPI(token);
    const { data } = await api.client.get(
      `/collections/${col.id}/items/${itemId}`
    );

    const fd = data.fieldData || {};
    res.status(200).json({
      id: data.id,
      collection: col.key,
      name: fd.name || '',
      slug: fd.slug || '',
      body: fd[FIELDS.body] || '',
      aiVersion: fd[FIELDS.version] || '',
      lastRefresh: fd[FIELDS.refresh] || '',
      fingerprint: fd[FIELDS.fingerprint] || '',
      notes: fd[FIELDS.notes] || '',
      aiLock: !!fd[FIELDS.lock],
      fieldData: fd,
    });
  } catch (err) {
    console.error('item-detail error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};
