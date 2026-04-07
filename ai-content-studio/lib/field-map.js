/**
 * Fetches a Webflow collection schema and auto-detects the field slugs we
 * need (body + AI tracking). Cached per collection id for the lifetime of
 * the serverless instance.
 *
 * Detection rules (case-insensitive, runs against both slug and displayName):
 *   body        -> first RichText field whose name/slug matches body|content|page-body|seo-body,
 *                  else the first RichText field in the collection.
 *   version     -> matches /ai.?version/
 *   refresh     -> matches /last.?(ai.?)?(refresh|update|generated)/ or /ai.?(refreshed|updated)/
 *   fingerprint -> matches /fingerprint/
 *   notes       -> matches /ai.?notes/ or /generation.?notes/
 *   lock        -> matches /ai.?lock/ or /locked/
 */

const WebflowAPI = require('../../lib/webflow-api');

const schemaCache = new Map();
const fieldMapCache = new Map();

async function fetchSchema(collectionId) {
  if (schemaCache.has(collectionId)) return schemaCache.get(collectionId);
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error('WEBFLOW_API_TOKEN not set');
  const api = new WebflowAPI(token);
  const { data } = await api.client.get(`/collections/${collectionId}`);
  schemaCache.set(collectionId, data);
  return data;
}

function norm(str) {
  return String(str || '').toLowerCase();
}

function matches(field, patterns) {
  const slug = norm(field.slug);
  const name = norm(field.displayName || field.name);
  return patterns.some((re) => re.test(slug) || re.test(name));
}

function pickBodyField(fields) {
  const richText = fields.filter(
    (f) => f.type === 'RichText' || f.type === 'PlainText' || f.type === 'Text'
  );
  const preferred = richText.find((f) =>
    matches(f, [/page.?body/, /\bbody\b/, /seo.?body/, /\bcontent\b/, /description/])
  );
  if (preferred) return preferred;
  const rt = fields.find((f) => f.type === 'RichText');
  if (rt) return rt;
  return richText[0] || null;
}

function buildFieldMap(schema) {
  const fields = schema.fields || [];
  const body = pickBodyField(fields);
  const version = fields.find((f) => matches(f, [/ai.?version/]));
  const refresh = fields.find((f) =>
    matches(f, [
      /last.?ai.?(refresh|update|generat(ed|ion))/,
      /ai.?(refresh(ed)?|updated)/,
      /last.?(refresh|updated)/,
    ])
  );
  const fingerprint = fields.find((f) => matches(f, [/fingerprint/]));
  const notes = fields.find((f) => matches(f, [/ai.?notes/, /generation.?notes/]));
  const lock = fields.find((f) => matches(f, [/ai.?lock/, /\blocked?\b/]));

  return {
    body: body?.slug || null,
    bodyType: body?.type || null,
    version: version?.slug || null,
    refresh: refresh?.slug || null,
    fingerprint: fingerprint?.slug || null,
    notes: notes?.slug || null,
    lock: lock?.slug || null,
    // Full schema in case callers want more:
    allFields: fields.map((f) => ({
      slug: f.slug,
      name: f.displayName || f.name,
      type: f.type,
    })),
  };
}

async function getFieldMap(collectionId) {
  if (fieldMapCache.has(collectionId)) return fieldMapCache.get(collectionId);
  const schema = await fetchSchema(collectionId);
  const map = buildFieldMap(schema);
  fieldMapCache.set(collectionId, map);
  return map;
}

function invalidate(collectionId) {
  schemaCache.delete(collectionId);
  fieldMapCache.delete(collectionId);
}

module.exports = { getFieldMap, invalidate };
