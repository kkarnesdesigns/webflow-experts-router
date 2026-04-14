/**
 * Fetch the live Gyde route manifest and find URLs relevant to a given CMS
 * item. Feeds the top candidates into Claude's generate prompt so the
 * closing `<a>` link lands on a real, indexed page.
 *
 * Manifest source: /api/route-manifest on the same deployment. We call it
 * over HTTP (rather than importing generate-routes directly) because the
 * studio functions live in separate serverless instances with their own
 * module caches. The manifest endpoint has its own ~1h cache, so repeated
 * calls within a warm instance are cheap.
 */
let manifestCache = null;
let manifestFetchedAt = 0;
const MANIFEST_TTL_MS = 10 * 60 * 1000;

function manifestUrl() {
  return (
    process.env.ROUTE_MANIFEST_URL ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://webflow-experts-router.vercel.app'}/api/route-manifest`
  );
}

function siteBaseUrl() {
  return (process.env.SITE_BASE_URL || 'https://joingyde.com').replace(/\/$/, '');
}

async function loadManifest() {
  if (manifestCache && Date.now() - manifestFetchedAt < MANIFEST_TTL_MS) {
    return manifestCache;
  }
  try {
    const res = await fetch(manifestUrl(), { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    manifestCache = json?.routes || null;
    manifestFetchedAt = Date.now();
    return manifestCache;
  } catch (_) {
    return null;
  }
}

function normalizeRoute(path, meta) {
  return {
    url: `${siteBaseUrl()}${path}`,
    path,
    type: meta.type,
    skillSlug: meta.skill || null,
    skillName: meta.skillName || null,
    certificationSlug: meta.certification || null,
    certificationName: meta.certificationName || null,
    categorySlug: meta.category || null,
    categoryName: meta.categoryName || null,
    stateSlug: meta.state || null,
    stateName: meta.stateName || null,
    citySlug: meta.city || null,
    cityName: meta.cityName || null,
    skillId: meta.skillId || null,
    certificationId: meta.certificationId || null,
    stateId: meta.stateId || null,
    cityId: meta.cityId || null,
    categoryId: meta.categoryId || null,
    expertCount: meta.expertCount || 0,
  };
}

/**
 * Extract identifiers from a CMS item we can use to match routes.
 * Handles skills, certifications, and landingContent (which has ref fields).
 */
function extractItemKeys(collectionKey, fieldData = {}) {
  const keys = {
    slug: fieldData.slug || null,
    name: fieldData.name || null,
    skillId: null,
    certificationId: null,
    stateId: null,
    cityId: null,
    categoryId: null,
  };
  if (collectionKey === 'skills') keys.skillId = fieldData._id || null;
  if (collectionKey === 'certifications') keys.certificationId = fieldData._id || null;
  if (collectionKey === 'landingContent') {
    keys.skillId = fieldData['skill-ref'] || null;
    keys.certificationId = fieldData['certification-ref'] || null;
    keys.stateId = fieldData['state-ref'] || null;
    keys.cityId = fieldData['city-ref'] || null;
  }
  return keys;
}

function scoreRoute(route, keys, slug) {
  let score = 0;
  if (keys.skillId && route.skillId === keys.skillId) score += 10;
  if (keys.certificationId && route.certificationId === keys.certificationId) score += 10;
  if (keys.cityId && route.cityId === keys.cityId) score += 5;
  if (keys.stateId && route.stateId === keys.stateId) score += 3;
  if (keys.categoryId && route.categoryId === keys.categoryId) score += 2;
  if (slug && (route.skillSlug === slug || route.certificationSlug === slug)) score += 6;
  // Prefer routes with experts
  if (route.expertCount > 0) score += 1;
  return score;
}

/**
 * Return up to `limit` candidate URLs ranked by relevance to the item.
 */
async function findRelevantLinks(collectionKey, item, limit = 5) {
  const routes = await loadManifest();
  if (!routes) return [];
  const fd = item.fieldData || {};
  const keys = extractItemKeys(collectionKey, { ...fd, _id: item.id });
  const slug = fd.slug || null;

  const scored = [];
  for (const [path, meta] of Object.entries(routes)) {
    const r = normalizeRoute(path, meta);
    const score = scoreRoute(r, keys, slug);
    if (score <= 0) continue;
    scored.push({ ...r, score });
  }
  scored.sort((a, b) => b.score - a.score || b.expertCount - a.expertCount);
  const top = scored.slice(0, limit);

  // Always offer a safe fallback so Claude never has to invent a URL.
  const fallback = {
    url: `${siteBaseUrl()}/hire`,
    path: '/hire',
    type: 'directory-root',
    skillName: null,
    certificationName: null,
    cityName: null,
    stateName: null,
    expertCount: 0,
    score: 0,
  };
  if (!top.some((r) => r.path === fallback.path)) top.push(fallback);
  return top;
}

function formatLinksForPrompt(links) {
  if (!links.length) return '';
  const lines = links.map((l) => {
    const label = [
      l.skillName || l.certificationName,
      l.cityName || l.stateName,
    ]
      .filter(Boolean)
      .join(' in ');
    return `- ${l.url}${label ? `  (${label})` : ''}`;
  });
  return [
    '## Candidate Gyde links for the closing paragraph',
    'Pick ONE of these as the href for the closing `<a>` tag. Do not invent a different URL.',
    ...lines,
  ].join('\n');
}

module.exports = {
  loadManifest,
  findRelevantLinks,
  formatLinksForPrompt,
  siteBaseUrl,
};
