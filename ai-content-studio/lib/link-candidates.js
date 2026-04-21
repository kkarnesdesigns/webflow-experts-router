/**
 * Build a shortlist of internal Gyde URLs to link to from the closing
 * paragraph of a long-SEO generation.
 *
 * Sources:
 *   - `sitemap-store`  — authoritative list of URLs actually published on
 *                        seo.joingyde.com. Every recommendation must be in
 *                        the sitemap, so we never point Claude at a 404.
 *   - `/api/route-manifest` — typed + ID-enriched routes from the router
 *                             project. Used to look up category / state /
 *                             city relationships the sitemap alone can't
 *                             describe by path shape.
 *
 * Strategy:
 *   1. Load both sources. Keep only manifest routes whose path is in the
 *      sitemap.
 *   2. Resolve the current CMS item's `categoryId` by looking up its skill
 *      or certification in the manifest (landingContent items only carry
 *      skill-ref / cert-ref, not the parent category).
 *   3. Score candidates toward "same service, broader location", plus a
 *      category-level tier so skill items can hand off to their state or
 *      city category roll-up (the only location pages that actually exist
 *      in the sitemap).
 *   4. Return up to `limit` ranked candidates (default 8) so the prompt has
 *      enough variety to include 2-3 links in the closing paragraph.
 */

const sitemapStore = require('./sitemap-store');

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

function normalizePath(p) {
  return sitemapStore.normalizePath(p);
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
    normalizedPath: normalizePath(path),
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

function locationDepth(route) {
  if (route.citySlug || route.cityId) return 2;
  if (route.stateSlug || route.stateId) return 1;
  return 0;
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
    categorySlug: null,
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

/**
 * Landing-content items reference a specific skill/cert but not the parent
 * category. The sitemap only publishes location+category pages, so we need
 * the category id/slug to find those candidates. Resolve it by scanning the
 * manifest for a skill-index or certification-index route for the same
 * skillId / certificationId.
 */
function enrichCategoryFromManifest(keys, routes) {
  if (!routes || keys.categoryId) return keys;
  for (const meta of Object.values(routes)) {
    if (keys.skillId && meta.skillId === keys.skillId && meta.categoryId) {
      keys.categoryId = meta.categoryId;
      keys.categorySlug = meta.category || null;
      return keys;
    }
    if (
      keys.certificationId &&
      meta.certificationId === keys.certificationId &&
      meta.categoryId
    ) {
      keys.categoryId = meta.categoryId;
      keys.categorySlug = meta.category || null;
      return keys;
    }
  }
  return keys;
}

function itemDepth(keys) {
  if (keys.cityId) return 2;
  if (keys.stateId) return 1;
  return 0;
}

/**
 * A route is "the same page as the current item" if every location/service
 * pin on the item matches the route with no extra specificity. Used to
 * filter the current page out of its own candidate pool.
 */
function sameItemRoute(route, keys) {
  const pins = [
    ['skillId', route.skillId],
    ['certificationId', route.certificationId],
    ['categoryId', route.categoryId],
    ['stateId', route.stateId],
    ['cityId', route.cityId],
  ];
  let anyShared = false;
  for (const [k, v] of pins) {
    const kv = keys[k];
    if (kv || v) {
      if (kv !== v) return false;
      anyShared = true;
    }
  }
  return anyShared;
}

/**
 * Rank a candidate against the item. Service match is required; broader
 * location than the current page gets a big bonus, narrower gets penalised.
 */
function scoreRoute(route, keys, slug, currentDepth) {
  let serviceMatch = false;
  let score = 0;

  if (keys.skillId && route.skillId === keys.skillId) {
    score += 22;
    serviceMatch = true;
  }
  if (keys.certificationId && route.certificationId === keys.certificationId) {
    score += 22;
    serviceMatch = true;
  }
  if (keys.categoryId && route.categoryId === keys.categoryId) {
    score += 14;
    serviceMatch = true;
  }
  if (slug && (route.skillSlug === slug || route.certificationSlug === slug)) {
    score += 10;
    serviceMatch = true;
  }
  if (!serviceMatch) return 0;

  const routeDepth = locationDepth(route);
  const delta = currentDepth - routeDepth;
  if (delta > 0) {
    // Strictly broader than the current page — the ideal target.
    score += 12 * delta;
  } else if (delta === 0 && currentDepth > 0) {
    // Same depth but different location = lateral sibling. Useful in
    // moderation, so don't drop it — just deprioritise.
    score -= 3;
  } else if (delta < 0) {
    // More specific than the current page — not what we want, but keep a
    // low score so it shows up only if nothing better exists.
    score -= 8;
  }

  if (route.expertCount > 0) score += 1;
  return score;
}

/**
 * Return up to `limit` candidates ranked by relevance to the item.
 * Candidates are restricted to URLs present in the live sitemap.
 */
async function findRelevantLinks(collectionKey, item, limit = 8) {
  const [routes, sitemap] = await Promise.all([
    loadManifest(),
    sitemapStore.getPathSet(),
  ]);
  if (!routes) return [];
  const fd = item.fieldData || {};
  const keys = enrichCategoryFromManifest(
    extractItemKeys(collectionKey, { ...fd, _id: item.id }),
    routes
  );
  const slug = fd.slug || null;
  const currentDepth = itemDepth(keys);

  const scored = [];
  for (const [path, meta] of Object.entries(routes)) {
    const r = normalizeRoute(path, meta);
    if (sitemap && !sitemap.has(r.normalizedPath)) continue;
    if (sameItemRoute(r, keys)) continue;
    const score = scoreRoute(r, keys, slug, currentDepth);
    if (score <= 0) continue;
    scored.push({ ...r, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      locationDepth(a) - locationDepth(b) ||
      b.expertCount - a.expertCount
  );

  // Dedupe by normalized path in case the manifest has two entries resolving
  // to the same URL.
  const seen = new Set();
  const top = [];
  for (const r of scored) {
    if (seen.has(r.normalizedPath)) continue;
    seen.add(r.normalizedPath);
    top.push(r);
    if (top.length >= limit) break;
  }

  // Always append a safe fallback so Claude can still assemble a closing
  // paragraph if every ranked candidate failed.
  const fallbackPath = '/hire';
  if (!top.some((r) => r.normalizedPath === normalizePath(fallbackPath))) {
    top.push({
      url: `${siteBaseUrl()}${fallbackPath}`,
      path: fallbackPath,
      normalizedPath: normalizePath(fallbackPath),
      type: 'directory-root',
      skillName: null,
      certificationName: null,
      categoryName: null,
      cityName: null,
      stateName: null,
      expertCount: 0,
      score: 0,
    });
  }
  return top;
}

function labelFor(l) {
  const service = l.skillName || l.certificationName || l.categoryName;
  const locationParts = [l.cityName, l.stateName].filter(Boolean).join(', ');
  if (service && locationParts) return `${service} experts in ${locationParts}`;
  if (service) return `${service} experts`;
  if (locationParts) return `Experts in ${locationParts}`;
  return 'Find an expert';
}

function formatLinksForPrompt(links) {
  if (!links.length) return '';
  const lines = links.map((l) => `- ${l.url}  (${labelFor(l)})`);
  return [
    '## Candidate Gyde links for the closing paragraph',
    'Pick 2-3 of the following published URLs and link to them from the closing paragraph, each as a plain `<a href="...">` tag with natural anchor text. Do NOT invent a URL and do NOT link to the current page itself.',
    'The list is ordered best → worst. Prefer pages that offer the SAME service at a BROADER location than the current page (e.g. from a city page link up to the state roll-up, from a state page link up to the nationwide service). If the current page is already nationwide, it is fine to pick related category or state-level pages instead.',
    'Use the `/hire` fallback only if no better choices are available.',
    ...lines,
  ].join('\n');
}

module.exports = {
  loadManifest,
  findRelevantLinks,
  formatLinksForPrompt,
  siteBaseUrl,
};
