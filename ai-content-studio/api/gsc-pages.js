/**
 * Return page-level Search Console performance, ranked to help find
 * low-performing pages to rewrite.
 *
 * Query params:
 *   days           default 28
 *   minImpressions default 20  (hide pages nobody sees)
 *   sort           default "position" (worst first). Options:
 *                    - position  (highest position = worst rank, first)
 *                    - impressions (lowest first)
 *                    - clicks     (lowest first)
 *                    - ctr        (lowest first)
 *   limit          default 200
 *   contains       optional: only rows whose page URL contains this substring
 *                  (e.g. "skill" or "certification")
 */

const { cors } = require('../lib/config');
const gsc = require('../lib/gsc');

function lastSlugFromUrl(u) {
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch (_) {
    return '';
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!gsc.isConfigured()) {
      return res.status(200).json({
        configured: false,
        error:
          'GSC not configured. Set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL, and add the service account email to the Search Console property.',
      });
    }

    const days = parseInt(req.query.days || '28', 10);
    const minImpressions = parseInt(req.query.minImpressions || '20', 10);
    const sort = (req.query.sort || 'position').toString();
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const contains = (req.query.contains || '').toString().toLowerCase().trim();

    const { siteUrl, startDate, endDate, rows } = await gsc.queryAnalytics({
      days,
      rowLimit: 5000,
      dimensions: ['page'],
    });

    let pages = rows
      .map((r) => ({
        page: r.keys[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr || 0,
        position: r.position || 0,
        slug: lastSlugFromUrl(r.keys[0]),
      }))
      .filter((p) => p.impressions >= minImpressions);

    if (contains) {
      pages = pages.filter((p) => p.page.toLowerCase().includes(contains));
    }

    const sorters = {
      position: (a, b) => b.position - a.position, // worst (highest) first
      impressions: (a, b) => a.impressions - b.impressions,
      clicks: (a, b) => a.clicks - b.clicks,
      ctr: (a, b) => a.ctr - b.ctr,
    };
    pages.sort(sorters[sort] || sorters.position);
    pages = pages.slice(0, limit);

    res.status(200).json({
      configured: true,
      siteUrl,
      startDate,
      endDate,
      total: pages.length,
      sort,
      minImpressions,
      days,
      pages,
    });
  } catch (err) {
    console.error('gsc-pages error:', err);
    res.status(500).json({ error: err.message });
  }
};
