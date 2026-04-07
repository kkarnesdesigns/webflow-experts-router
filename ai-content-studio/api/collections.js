const { cors, listCollections } = require('../lib/config');
const { getEditableFields, isSupported } = require('../lib/editable-fields');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const collections = listCollections().map((c) => ({
    ...c,
    supported: isSupported(c.key),
    editableFields: getEditableFields(c.key).fields,
  }));

  res.status(200).json({ collections });
};
