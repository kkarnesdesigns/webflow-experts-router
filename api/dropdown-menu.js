/**
 * Vercel Serverless Function: Dropdown Menu Data
 * Generates dropdown menu data from the route manifest
 */

const generateRoutes = require('./generate-routes');

/**
 * Generate dropdown menu from manifest routes
 */
function generateDropdownFromManifest(manifest) {
  const statesMap = new Map();
  const citiesMap = new Map();
  const categoriesMap = new Map();
  const skillsMap = new Map();

  for (const [path, params] of Object.entries(manifest.routes)) {
    // Determine route type from path structure
    const segments = path.split('/').filter(s => s);
    const segmentCount = segments.length;

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

    // Collect cities (3 segments: /hire/state/city with cityId but no categoryId)
    if (segmentCount === 3 && params.cityId && !params.categoryId) {
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

    // Collect categories (3 segments: /hire/state/category with categoryId but no cityId)
    if (segmentCount === 3 && params.categoryId && !params.cityId) {
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

    // Collect skills (4 segments: /hire/state/category/skill with skillId but no cityId)
    if (segmentCount === 4 && params.skillId && !params.cityId) {
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
    generated: manifest.generated
  };
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache for 1 hour, revalidate in background
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Try to get cached dropdown menu first
    let dropdownMenu = generateRoutes.getDropdownMenu();

    // If not cached, generate from manifest
    if (!dropdownMenu) {
      const manifest = generateRoutes.getManifest();

      if (!manifest) {
        // Fetch manifest from the manifest API as fallback
        const manifestResponse = await fetch('https://webflow-experts-router.vercel.app/api/route-manifest');
        if (!manifestResponse.ok) {
          res.status(503).json({
            error: 'Route manifest not available',
            message: 'Please call /api/generate-routes first'
          });
          return;
        }
        const manifestData = await manifestResponse.json();
        dropdownMenu = generateDropdownFromManifest(manifestData);
      } else {
        dropdownMenu = generateDropdownFromManifest(manifest);
      }
    }

    res.status(200).json(dropdownMenu);

  } catch (error) {
    console.error('Error fetching dropdown menu:', error);
    res.status(500).json({
      error: 'Failed to fetch dropdown menu',
      message: error.message
    });
  }
};
