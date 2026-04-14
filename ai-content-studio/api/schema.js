/**
 * Debug endpoint: dump the full field schema for every configured collection.
 * Hit /api/ai-studio/schema to see every field slug + displayName + type.
 */

const WebflowAPI = require('../../lib/webflow-api');
const { cors, listCollections, getCollection } = require('../lib/config');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) throw new Error('WEBFLOW_API_TOKEN not set');
    const api = new WebflowAPI(token);

    const collections = listCollections();
    const out = [];

    for (const c of collections) {
      if (!c.configured) {
        out.push({ key: c.key, label: c.label, configured: false });
        continue;
      }
      const col = getCollection(c.key);
      try {
        const { data } = await api.client.get(`/collections/${col.id}`);
        out.push({
          key: c.key,
          label: c.label,
          configured: true,
          collectionId: col.id,
          displayName: data.displayName,
          slug: data.slug,
          fields: (data.fields || []).map((f) => ({
            slug: f.slug,
            displayName: f.displayName || f.name,
            type: f.type,
            isRequired: f.isRequired || false,
            isEditable: f.isEditable !== false,
          })),
        });
      } catch (err) {
        out.push({
          key: c.key,
          label: c.label,
          configured: true,
          collectionId: col.id,
          error: err.response?.data || err.message,
        });
      }
    }

    res.status(200).json({ collections: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
