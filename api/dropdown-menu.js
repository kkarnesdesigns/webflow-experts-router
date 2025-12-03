/**
 * Vercel Serverless Function: Dropdown Menu Data
 * Returns pre-generated dropdown menu data (generated daily with routes)
 */

const generateRoutes = require('./generate-routes');

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
    // Get the pre-generated dropdown menu
    const dropdownMenu = generateRoutes.getDropdownMenu();

    if (!dropdownMenu) {
      res.status(503).json({
        error: 'Dropdown menu not yet generated',
        message: 'Please call /api/generate-routes first'
      });
      return;
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
