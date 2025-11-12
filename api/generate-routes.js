/**
 * Vercel Serverless Function: Generate Routes
 * Fetches CMS data and generates route manifest and sitemap
 *
 * Can be triggered manually, via cron, or by webhook
 */

const WebflowAPI = require('../lib/webflow-api');
const RouteGenerator = require('../lib/route-generator');
const SitemapGenerator = require('../lib/sitemap-generator');

// Store generated data (in production, use Vercel KV or similar)
let cachedManifest = null;
let cachedSitemap = null;
let lastGenerated = null;

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('Starting route generation...');

    // Get config from environment variables
    const config = {
      apiToken: process.env.WEBFLOW_API_TOKEN,
      siteId: process.env.WEBFLOW_SITE_ID,
      expertsCollectionId: process.env.WEBFLOW_EXPERTS_COLLECTION_ID,
      citiesCollectionId: process.env.WEBFLOW_CITIES_COLLECTION_ID,
      statesCollectionId: process.env.WEBFLOW_STATES_COLLECTION_ID,
      skillsCollectionId: process.env.WEBFLOW_SKILLS_COLLECTION_ID,
      baseURL: process.env.SITE_BASE_URL || 'https://yourdomain.com',
      basePath: process.env.EXPERTS_BASE_PATH || '/experts'
    };

    // Validate config
    if (!config.apiToken) {
      throw new Error('WEBFLOW_API_TOKEN environment variable is required');
    }

    // Check if we should use cache
    const cacheDuration = parseInt(process.env.CACHE_DURATION_HOURS || '24') * 60 * 60 * 1000;
    const useCache = lastGenerated && (Date.now() - lastGenerated) < cacheDuration;

    if (useCache && req.query.force !== 'true') {
      console.log('Using cached data');
      res.status(200).json({
        success: true,
        cached: true,
        generated: new Date(lastGenerated).toISOString(),
        message: 'Using cached manifest. Add ?force=true to regenerate.',
        stats: cachedManifest.stats
      });
      return;
    }

    // Initialize Webflow API
    const webflow = new WebflowAPI(config.apiToken);

    // Fetch all CMS data
    const data = await webflow.fetchAllData(config);

    // Generate routes
    const { allRoutes, stats } = RouteGenerator.generateAllRoutes(data, config.basePath);

    // Create route manifest
    const manifest = RouteGenerator.createRouteManifest(allRoutes);
    manifest.stats = stats;

    // Generate sitemap
    const sitemap = SitemapGenerator.generateSitemap(allRoutes, config.baseURL);

    // Cache results
    cachedManifest = manifest;
    cachedSitemap = sitemap;
    lastGenerated = Date.now();

    console.log('Route generation complete!');

    // Return results
    res.status(200).json({
      success: true,
      generated: new Date(lastGenerated).toISOString(),
      stats,
      message: `Generated ${stats.total} routes successfully`,
      manifestUrl: '/api/route-manifest',
      sitemapUrl: '/api/sitemap.xml'
    });

  } catch (error) {
    console.error('Error generating routes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Export cached data for other functions
module.exports.getManifest = () => cachedManifest;
module.exports.getSitemap = () => cachedSitemap;
module.exports.getLastGenerated = () => lastGenerated;
