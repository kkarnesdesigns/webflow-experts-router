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
let cachedDropdownMenu = null;
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
      categoriesCollectionId: process.env.WEBFLOW_CATEGORIES_COLLECTION_ID,
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

    // Generate dropdown menu data
    const dropdownMenu = generateDropdownMenu(allRoutes);

    // Cache results
    cachedManifest = manifest;
    cachedSitemap = sitemap;
    cachedDropdownMenu = dropdownMenu;
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

/**
 * Generate dropdown menu data from routes
 */
function generateDropdownMenu(allRoutes) {
  const statesMap = new Map();
  const citiesMap = new Map();
  const categoriesMap = new Map();
  const skillsMap = new Map();

  for (const route of allRoutes) {
    const params = route.params;

    // Collect states
    if (params.stateId && params.stateName) {
      const existing = statesMap.get(params.stateId);
      if (!existing) {
        statesMap.set(params.stateId, {
          path: `/hire/${params.state}`,
          name: params.stateName,
          slug: params.state,
          expertCount: params.expertCount || 0
        });
      } else {
        existing.expertCount = Math.max(existing.expertCount, params.expertCount || 0);
      }
    }

    // Collect cities from state-city routes
    if (route.type === 'state-city' && params.cityId) {
      if (!citiesMap.has(params.cityId)) {
        citiesMap.set(params.cityId, {
          path: `/hire/${params.state}/${params.city}`,
          name: params.cityName,
          slug: params.city,
          state: params.stateName,
          stateSlug: params.state,
          expertCount: params.expertCount || 0
        });
      }
    }

    // Collect categories from state-category routes
    if (route.type === 'state-category' && params.categoryId) {
      const existing = categoriesMap.get(params.categoryId);
      if (!existing) {
        categoriesMap.set(params.categoryId, {
          name: params.categoryName,
          slug: params.category,
          totalExperts: params.expertCount || 0
        });
      } else {
        existing.totalExperts += params.expertCount || 0;
      }
    }

    // Collect skills from state-level skill routes
    if (route.type === 'state' && params.skillId) {
      const existing = skillsMap.get(params.skillId);
      if (!existing) {
        skillsMap.set(params.skillId, {
          name: params.skillName,
          slug: params.skill,
          category: params.categoryName,
          categorySlug: params.category,
          totalExperts: params.expertCount || 0
        });
      } else {
        existing.totalExperts += params.expertCount || 0;
      }
    }
  }

  // Convert to arrays and sort
  const states = Array.from(statesMap.values())
    .filter(s => s.expertCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cities = Array.from(citiesMap.values())
    .filter(c => c.expertCount > 0)
    .sort((a, b) => b.expertCount - a.expertCount)
    .slice(0, 30);

  const categories = Array.from(categoriesMap.values())
    .filter(c => c.totalExperts > 0)
    .sort((a, b) => b.totalExperts - a.totalExperts);

  const popularSkills = Array.from(skillsMap.values())
    .filter(s => s.totalExperts > 0)
    .sort((a, b) => b.totalExperts - a.totalExperts)
    .slice(0, 10);

  return {
    states,
    cities,
    categories,
    popularSkills,
    generated: new Date().toISOString()
  };
}

// Export cached data for other functions
module.exports.getManifest = () => cachedManifest;
module.exports.getSitemap = () => cachedSitemap;
module.exports.getDropdownMenu = () => cachedDropdownMenu;
module.exports.getLastGenerated = () => lastGenerated;
