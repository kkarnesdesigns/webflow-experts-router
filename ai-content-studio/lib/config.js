/**
 * Shared config for AI Content Studio endpoints.
 * Maps our 5 collection "kinds" to env-configured collection IDs.
 * Field slugs are auto-detected per collection via lib/field-map.js - we no
 * longer rely on hard-coded slugs.
 */

const COLLECTIONS = {
  categories: { key: 'categories', label: 'Categories', envVar: 'WEBFLOW_CATEGORIES_COLLECTION_ID' },
  skills: { key: 'skills', label: 'Skills', envVar: 'WEBFLOW_SKILLS_COLLECTION_ID' },
  certifications: { key: 'certifications', label: 'Certifications', envVar: 'WEBFLOW_CERTIFICATIONS_COLLECTION_ID' },
  cities: { key: 'cities', label: 'Cities', envVar: 'WEBFLOW_CITIES_COLLECTION_ID' },
  states: { key: 'states', label: 'States', envVar: 'WEBFLOW_STATES_COLLECTION_ID' },
};

function getCollection(key) {
  const col = COLLECTIONS[key];
  if (!col) return null;
  const id = process.env[col.envVar];
  if (!id) return null;
  return { ...col, id };
}

function listCollections() {
  return Object.values(COLLECTIONS).map((c) => ({
    key: c.key,
    label: c.label,
    configured: !!process.env[c.envVar],
  }));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { COLLECTIONS, getCollection, listCollections, cors, readJsonBody };
