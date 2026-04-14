/**
 * Fetch a single item and return the current values of the editable fields
 * for this collection.
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
    const itemId = req.query.id;
    if (!col || !itemId) {
      return res.status(400).json({ error: 'collection and id are required' });
    }

    const { fields } = getEditableFields(col.key);
    const api = new WebflowAPI(token);
    const { data } = await api.client.get(`/collections/${col.id}/items/${itemId}`);
    const fd = data.fieldData || {};

    const values = {};
    for (const f of fields) values[f.key] = fd[f.slug] || '';

    res.status(200).json({
      id: data.id,
      collection: col.key,
      name: fd.name || '',
      slug: fd.slug || '',
      editableFields: fields,
      values,
      fieldData: fd,
    });
  } catch (err) {
    console.error('item-detail error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};
