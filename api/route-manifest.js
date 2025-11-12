/**
 * Vercel Serverless Function: Route Manifest
 * Returns the cached route manifest for client-side router
 */

const generateRoutes = require('./generate-routes');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Try to get cached manifest
    let manifest = generateRoutes.getManifest();
    let lastGenerated = generateRoutes.getLastGenerated();

    // If no cached data, generate it
    if (!manifest) {
      console.log('No cached manifest, triggering generation...');

      // Create a mock request to trigger generation
      const mockReq = { method: 'GET', query: {} };
      const mockRes = {
        setHeader: () => {},
        status: (code) => ({
          json: () => {},
          end: () => {}
        })
      };

      // Wait for generation
      await generateRoutes(mockReq, mockRes);

      // Get the newly generated manifest
      manifest = generateRoutes.getManifest();
      lastGenerated = generateRoutes.getLastGenerated();
    }

    if (!manifest) {
      throw new Error('Failed to generate manifest');
    }

    // Return manifest
    res.status(200).json(manifest);

  } catch (error) {
    console.error('Error serving manifest:', error);
    res.status(500).json({
      error: 'Failed to load route manifest',
      message: error.message
    });
  }
};
