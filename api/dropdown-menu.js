/**
 * Vercel Serverless Function: Dropdown Menu Data
 * Returns categorized routes for the navigation dropdown menu
 */

const generateRoutes = require('./generate-routes');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Get the cached manifest from generate-routes
    const manifest = generateRoutes.getManifest();

    if (!manifest || !manifest.routes) {
      res.status(503).json({
        error: 'Route manifest not yet generated',
        message: 'Please call /api/generate-routes first'
      });
      return;
    }

    // Organize routes for the dropdown menu
    const routes = Object.entries(manifest.routes);

    // States with expert counts (aggregate from state-category routes)
    const statesMap = new Map();
    // Cities with expert counts
    const citiesMap = new Map();
    // Categories with expert counts
    const categoriesMap = new Map();
    // Popular skills (from state-level skill routes)
    const skillsMap = new Map();

    for (const [path, params] of routes) {
      // Collect states from state-category routes
      if (params.type === 'state-category' || (!params.cityId && params.stateId)) {
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
      if (params.type === 'state-city' && params.cityId) {
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
      if (params.type === 'state-category' && params.categoryId) {
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
      if (params.type === 'state' && params.skillId) {
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
      .slice(0, 30); // Top 30 cities by expert count

    const categories = Array.from(categoriesMap.values())
      .filter(c => c.totalExperts > 0)
      .sort((a, b) => b.totalExperts - a.totalExperts);

    const popularSkills = Array.from(skillsMap.values())
      .filter(s => s.totalExperts > 0)
      .sort((a, b) => b.totalExperts - a.totalExperts)
      .slice(0, 10); // Top 10 skills

    res.status(200).json({
      states,
      cities,
      categories,
      popularSkills,
      generated: manifest.generated,
      stats: {
        totalStates: states.length,
        totalCities: cities.length,
        totalCategories: categories.length,
        totalSkills: popularSkills.length
      }
    });

  } catch (error) {
    console.error('Error generating dropdown menu:', error);
    res.status(500).json({
      error: 'Failed to generate dropdown menu',
      message: error.message
    });
  }
};
