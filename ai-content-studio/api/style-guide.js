const { cors, readJsonBody } = require('../lib/config');
const store = require('../lib/style-guide-store');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ content: store.read() });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readJsonBody(req);
      const content = (body && body.content) || '';
      store.write(content);
      return res.status(200).json({ ok: true, length: content.length });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
