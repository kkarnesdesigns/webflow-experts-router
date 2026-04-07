const { cors, listCollections, getCollection } = require('../lib/config');
const { getFieldMap } = require('../lib/field-map');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const collections = listCollections();

    // For every configured collection, fetch its schema and include the
    // auto-detected field mapping so the UI can show which fields will be
    // read/written.
    const enriched = await Promise.all(
      collections.map(async (c) => {
        if (!c.configured) return c;
        try {
          const col = getCollection(c.key);
          const fields = await getFieldMap(col.id);
          return { ...c, fields };
        } catch (err) {
          return { ...c, error: err.message };
        }
      })
    );

    res.status(200).json({ collections: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
