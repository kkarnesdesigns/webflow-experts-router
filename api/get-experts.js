/**
 * Vercel Serverless Function: Proxy for Webflow CMS API
 * Solves CORS issues by proxying requests from Wized to Webflow
 */

const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers to allow Wized to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Get query parameters from the request
    const { limit = 100, offset = 0 } = req.query;

    // Fetch experts from Webflow API
    const response = await axios.get(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_EXPERTS_COLLECTION_ID}/items`,
      {
        params: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        headers: {
          'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
          'accept-version': '1.0.0'
        }
      }
    );

    // Return the experts data
    res.status(200).json(response.data);

  } catch (error) {
    console.error('Error fetching experts:', error.response?.data || error.message);

    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch experts',
      message: error.message,
      details: error.response?.data
    });
  }
};
