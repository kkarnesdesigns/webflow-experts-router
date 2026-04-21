/**
 * Sitemap cache for Gyde SEO URLs.
 *
 * Fetches https://seo.joingyde.com/api/sitemap.xml and keeps the set of
 * normalized paths in memory + on disk so link generation has a stable,
 * authoritative list of published URLs to draw from.
 *
 * Lookups return a `Set<string>` of lowercased path-only strings with no
 * trailing slash, e.g. "/hire/california/digital-marketing-advertising".
 *
 * Strategy:
 *   - In-memory cache for the life of the serverless instance.
 *   - JSON cache on disk (when the filesystem is writable) for cold starts.
 *   - Best-effort: if the network call fails and no cache exists, return null
 *     so the caller can continue without breaking.
 */

const fs = require('fs');
const path = require('path');

const SITEMAP_URL =
  process.env.SEO_SITEMAP_URL || 'https://seo.joingyde.com/api/sitemap.xml';
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'sitemap.json');
const TTL_MS = 60 * 60 * 1000; // 1 hour

let mem = null; // { fetchedAt, set, paths }

function normalizePath(p) {
  if (!p) return '';
  return String(p).replace(/\/+$/, '').toLowerCase();
}

function parseXml(xml) {
  const paths = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    try {
      const u = new URL(m[1].trim());
      paths.push(normalizePath(u.pathname));
    } catch (_) {
      paths.push(normalizePath(m[1]));
    }
  }
  return paths;
}

async function fetchFresh() {
  try {
    const res = await fetch(SITEMAP_URL, { headers: { accept: 'application/xml' } });
    if (!res.ok) return null;
    const xml = await res.text();
    return parseXml(xml);
  } catch (_) {
    return null;
  }
}

function readDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.paths)) return null;
    return { fetchedAt: j.fetchedAt || 0, paths: j.paths };
  } catch (_) {
    return null;
  }
}

function writeDisk(paths) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), paths }, null, 0),
      'utf8'
    );
  } catch (_) {
    // read-only fs (e.g. Vercel lambda) — in-memory cache takes over.
  }
}

function hydrateFrom(paths, fetchedAt) {
  mem = { fetchedAt, set: new Set(paths), paths };
  return mem;
}

/**
 * Returns the structured cache: `{ fetchedAt, set, paths }` or `null` if we
 * couldn't load anything.
 */
async function load() {
  const now = Date.now();
  if (mem && now - mem.fetchedAt < TTL_MS) return mem;

  // Hydrate from disk first so we can serve instantly while deciding whether
  // to refresh.
  const disk = readDisk();
  if (disk && now - disk.fetchedAt < TTL_MS) {
    return hydrateFrom(disk.paths, disk.fetchedAt);
  }

  const fresh = await fetchFresh();
  if (fresh && fresh.length) {
    writeDisk(fresh);
    return hydrateFrom(fresh, now);
  }

  // Network failed but we have a stale disk cache — use it.
  if (disk && disk.paths.length) {
    return hydrateFrom(disk.paths, disk.fetchedAt);
  }

  return null;
}

async function getPathSet() {
  const data = await load();
  return data ? data.set : null;
}

module.exports = { load, getPathSet, normalizePath, SITEMAP_URL };
