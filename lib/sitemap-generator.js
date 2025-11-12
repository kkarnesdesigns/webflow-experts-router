/**
 * Sitemap Generator Module
 * Creates XML sitemaps for SEO
 */

class SitemapGenerator {
  /**
   * Generate XML sitemap from routes
   */
  static generateSitemap(routes, baseURL) {
    const urls = routes.map(route => {
      const url = `${baseURL}${route.path}`;
      const priority = route.type === 'city' ? '0.8' : '0.7';
      const changefreq = 'weekly';

      return `  <url>
    <loc>${this.escapeXml(url)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }

  /**
   * Escape special XML characters
   */
  static escapeXml(unsafe) {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate a sitemap index if routes are split into multiple files
   */
  static generateSitemapIndex(sitemapUrls, baseURL) {
    const sitemaps = sitemapUrls.map(url => `  <sitemap>
    <loc>${this.escapeXml(`${baseURL}${url}`)}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`);

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.join('\n')}
</sitemapindex>`;
  }

  /**
   * Split routes into chunks for multiple sitemaps (if needed)
   * Google recommends max 50,000 URLs per sitemap
   */
  static splitRoutesForSitemap(routes, maxPerSitemap = 50000) {
    const chunks = [];
    for (let i = 0; i < routes.length; i += maxPerSitemap) {
      chunks.push(routes.slice(i, i + maxPerSitemap));
    }
    return chunks;
  }
}

module.exports = SitemapGenerator;
