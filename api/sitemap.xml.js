/**
 * Vercel Serverless Function: Sitemap XML
 * Returns the generated sitemap for SEO
 */

const generateRoutes = require('./generate-routes');

module.exports = async (req, res) => {
  // Set headers for XML
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

  try {
    // Try to get cached sitemap
    let sitemap = generateRoutes.getSitemap();

    // If no cached data, generate it
    if (!sitemap) {
      console.log('No cached sitemap, triggering generation...');

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

      // Get the newly generated sitemap
      sitemap = generateRoutes.getSitemap();
    }

    if (!sitemap) {
      throw new Error('Failed to generate sitemap');
    }

    // Return sitemap XML
    res.status(200).send(sitemap);

  } catch (error) {
    console.error('Error serving sitemap:', error);
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>Failed to generate sitemap</message>
  <details>${error.message}</details>
</error>`);
  }
};
