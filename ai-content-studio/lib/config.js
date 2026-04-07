/**
 * Shared config for AI Content Studio endpoints.
 * Maps our 5 collection "kinds" to env-configured collection IDs and
 * to the Webflow field slugs we read/write.
 */

const BODY_FIELD = process.env.AI_STUDIO_BODY_FIELD || 'page-body';
const VERSION_FIELD = process.env.AI_STUDIO_VERSION_FIELD || 'ai-version';
const REFRESH_FIELD = process.env.AI_STUDIO_REFRESH_FIELD || 'last-ai-refresh';
const FINGERPRINT_FIELD = process.env.AI_STUDIO_FINGERPRINT_FIELD || 'ai-fingerprint';
const NOTES_FIELD = process.env.AI_STUDIO_NOTES_FIELD || 'ai-notes';
const LOCK_FIELD = process.env.AI_STUDIO_LOCK_FIELD || 'ai-lock';

const COLLECTIONS = {
  categories: {
    key: 'categories',
    label: 'Categories',
    envVar: 'WEBFLOW_CATEGORIES_COLLECTION_ID',
  },
  skills: {
    key: 'skills',
    label: 'Skills',
    envVar: 'WEBFLOW_SKILLS_COLLECTION_ID',
  },
  certifications: {
    key: 'certifications',
    label: 'Certifications',
    envVar: 'WEBFLOW_CERTIFICATIONS_COLLECTION_ID',
  },
  cities: {
    key: 'cities',
    label: 'Cities',
    envVar: 'WEBFLOW_CITIES_COLLECTION_ID',
  },
  states: {
    key: 'states',
    label: 'States',
    envVar: 'WEBFLOW_STATES_COLLECTION_ID',
  },
};

function getCollection(key) {
  const col = COLLECTIONS[key];
  if (!col) return null;
  const id = process.env[col.envVar];
  if (!id) return null;
  return { ...col, id };
}

function listCollections() {
  return Object.values(COLLECTIONS)
    .map((c) => {
      const id = process.env[c.envVar];
      return { key: c.key, label: c.label, configured: !!id };
    });
}

const FIELDS = {
  body: BODY_FIELD,
  version: VERSION_FIELD,
  refresh: REFRESH_FIELD,
  fingerprint: FINGERPRINT_FIELD,
  notes: NOTES_FIELD,
  lock: LOCK_FIELD,
};

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

module.exports = {
  COLLECTIONS,
  FIELDS,
  getCollection,
  listCollections,
  cors,
  readJsonBody,
};
