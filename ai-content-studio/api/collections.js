const { cors, listCollections, FIELDS } = require('../lib/config');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.status(200).json({
    collections: listCollections(),
    fields: FIELDS,
  });
};
