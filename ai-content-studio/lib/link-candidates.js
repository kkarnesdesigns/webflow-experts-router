/**
 * Fetch Gyde SEO sitemap + route manifest and find the best "broader" internal
 * link for the closing paragraph of a long SEO body.
 *
 * Strategy:
 *   1. Pull the published sitemap (https://seo.joingyde.com/api/sitemap.xml)
 *      so the candidate pool is only URLs that are actually live and indexed.
 *   2. Pull the route manifest so we can type each path (skill / state+cat /
 *      state+city+cat, etc.) and match against the CMS item's ID refs.
 *   3. Intersect the two: manifest routes whose normalized path is in the
 *      sitemap are our candidate set.
 *   4. Score candidates toward **same service, less specific location** — e.g.
 *      from a city page, prefer the state version; from a state page, prefer
 *      the plain service page. Never recommend the item's own URL.
 */

let manifestCache = null;
let manifestFetchedAt = 0;
let sitemapCache = null;
let sitemapFetchedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

const SITEMAP_URL =
  process.env.SEO_SITEMAP_URL || 'https://seo.joingyde.com/api/sitemap.xml';

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
  if (!p) return '';
  return String(p).replace(/\/+$/, '').toLowerCase();
}

async function loadManifest() {
  if (manifestCache && Date.now() - manifestFetchedAt < CACHE_TTL_MS) {
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

async function loadSitemapPaths() {
  if (sitemapCache && Date.now() - sitemapFetchedAt < CACHE_TTL_MS) {
    return sitemapCache;
  }
  try {
    const res = await fetch(SITEMAP_URL, { headers: { accept: 'application/xml' } });
    if (!res.ok) return null;
    const xml = await res.text();
    const paths = new Set();
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      try {
        const u = new URL(m[1].trim());
        paths.add(normalizePath(u.pathname));
      } catch (_) {
        paths.add(normalizePath(m[1]));
      }
    }
    sitemapCache = paths;
    sitemapFetchedAt = Date.now();
    return paths;
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

function itemDepth(keys) {
  if (keys.cityId) return 2;
  if (keys.stateId) return 1;
  return 0;
}

/**
 * Score a candidate route. Returns 0 if it has no shared service with the
 * item (in which case we drop it). Higher = better.
 *
 * Goal: same service, less-specific location. Service match is required;
 * the location bonus/penalty biases toward "broader" versions of the same
 * page (state over city, nationwide over state).
 */
function scoreRoute(route, keys, slug, currentDepth) {
  let serviceMatch = false;
  let score = 0;

  if (keys.skillId && route.skillId === keys.skillId) {
    score += 20;
    serviceMatch = true;
  }
  if (keys.certificationId && route.certificationId === keys.certificationId) {
    score += 20;
    serviceMatch = true;
  }
  if (keys.categoryId && route.categoryId === keys.categoryId) {
    score += 8;
    serviceMatch = true;
  }
  if (slug && (route.skillSlug === slug || route.certificationSlug === slug)) {
    score += 15;
    serviceMatch = true;
  }
  if (!serviceMatch) return 0;

  const routeDepth = locationDepth(route);
  const delta = currentDepth - routeDepth;
  if (delta > 0) {
    // Strictly broader than the current page — the ideal target.
    score += 12 * delta;
  } else if (delta === 0 && currentDepth > 0) {
    // Same depth but different location = lateral, less useful.
    score -= 4;
  } else if (delta < 0) {
    // More specific than the current page (e.g. linking from a national
    // skill page down into a single city) — usually not what we want.
    score -= 10;
  }

  if (route.expertCount > 0) score += 1;
  return score;
}

function sameItemRoute(route, keys) {
  // A route is "the same page" if every id that the item pins matches and no
  // additional id makes the route more specific.
  const pins = [
    ['skillId', route.skillId],
    ['certificationId', route.certificationId],
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
 * Return up to `limit` candidate URLs ranked by relevance to the item.
 * Candidates are restricted to URLs present in the live sitemap so Claude
 * never gets pointed at a path that 404s or was un-published.
 */
async function findRelevantLinks(collectionKey, item, limit = 5) {
  const [routes, sitemap] = await Promise.all([loadManifest(), loadSitemapPaths()]);
  if (!routes) return [];
  const fd = item.fieldData || {};
  const keys = extractItemKeys(collectionKey, { ...fd, _id: item.id });
  const slug = fd.slug || null;
  const currentDepth = itemDepth(keys);

  const scored = [];
  for (const [path, meta] of Object.entries(routes)) {
    const r = normalizeRoute(path, meta);
    if (sitemap && !sitemap.has(r.normalizedPath)) continue; // not a live URL
    if (sameItemRoute(r, keys)) continue; // don't recommend the page itself
    const score = scoreRoute(r, keys, slug, currentDepth);
    if (score <= 0) continue;
    scored.push({ ...r, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      locationDepth(a) - locationDepth(b) || // prefer broader on tie
      b.expertCount - a.expertCount
  );
  const top = scored.slice(0, limit);

  // Always offer a safe fallback so Claude never has to invent a URL.
  const fallbackPath = '/hire';
  const fallback = {
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
  };
  if (!top.some((r) => r.normalizedPath === fallback.normalizedPath)) top.push(fallback);
  return top;
}

function labelFor(l) {
  // Describe the target so Claude can pick a human-readable anchor text.
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
    'Pick ONE of these published URLs for the closing `<a>` tag. Do not invent a URL.',
    'The list is ordered best → worst: prefer a page that offers the SAME service',
    'but at a BROADER location scope than the current page — e.g. from a city',
    'page link up to the state-level page for the same service, from a state page',
    'link up to the nationwide service page. Only fall back to a sibling or the',
    '/hire directory if nothing broader is available.',
    ...lines,
  ].join('\n');
}

module.exports = {
  loadManifest,
  loadSitemapPaths,
  findRelevantLinks,
  formatLinksForPrompt,
  siteBaseUrl,
};
