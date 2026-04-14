/**
 * Vercel Serverless Function: Get Form Options
 * Returns categories, skills (grouped by category), certifications (grouped by category),
 * and states for the Gyde Matchbot Form.
 */

const axios = require('axios');

// Shared cache (30 min TTL)
let optionsCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 60 * 1000
};

/**
 * Fetch all items from a Webflow collection with pagination
 */
async function fetchAllItems(collectionId) {
  const items = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await axios.get(
      `https://api.webflow.com/v2/collections/${collectionId}/items`,
      {
        params: { limit, offset },
        headers: {
          'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
          'accept-version': '1.0.0'
        }
      }
    );

    const fetchedItems = response.data.items || [];
    items.push(...fetchedItems);

    hasMore = fetchedItems.length === limit;
    offset += limit;

    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return items;
}

/**
 * Build the structured form options from raw CMS data
 */
function buildFormOptions(categories, skills, certifications, states) {
  // Categories - sorted alphabetically
  const categoryList = categories
    .filter(c => !c.isArchived && !c.fieldData?.isArchived)
    .map(c => ({
      id: c.id,
      name: c.fieldData?.name || '',
      slug: c.fieldData?.slug || ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Skills grouped by category
  const skillsByCategory = {};
  const activeSkills = skills.filter(s => !s.isArchived && !s.fieldData?.isArchived);

  for (const skill of activeSkills) {
    const categoryIds = skill.fieldData?.['expert-category'] || [];
    const entry = {
      id: skill.id,
      name: skill.fieldData?.name || '',
      slug: skill.fieldData?.slug || ''
    };

    for (const catId of categoryIds) {
      if (!skillsByCategory[catId]) {
        skillsByCategory[catId] = [];
      }
      skillsByCategory[catId].push(entry);
    }
  }

  // Sort skills within each category
  for (const catId of Object.keys(skillsByCategory)) {
    skillsByCategory[catId].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Certifications grouped by category
  const certsByCategory = {};
  const activeCerts = certifications.filter(c => !c.isArchived && !c.fieldData?.isArchived);

  for (const cert of activeCerts) {
    const categoryIds = cert.fieldData?.category || [];
    const entry = {
      id: cert.id,
      name: cert.fieldData?.name || '',
      slug: cert.fieldData?.slug || ''
    };

    for (const catId of categoryIds) {
      if (!certsByCategory[catId]) {
        certsByCategory[catId] = [];
      }
      certsByCategory[catId].push(entry);
    }
  }

  // Sort certifications within each category
  for (const catId of Object.keys(certsByCategory)) {
    certsByCategory[catId].sort((a, b) => a.name.localeCompare(b.name));
  }

  // States - sorted alphabetically
  const stateList = states
    .map(s => ({
      id: s.id,
      name: s.fieldData?.name || '',
      slug: s.fieldData?.slug || ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    categories: categoryList,
    skills: skillsByCategory,
    certifications: certsByCategory,
    states: stateList
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const now = Date.now();

    // Return cached data if fresh
    if (optionsCache.data && (now - optionsCache.timestamp) < optionsCache.ttl) {
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json(optionsCache.data);
      return;
    }

    // Fetch all collections in parallel
    const [categories, skills, certifications, states] = await Promise.all([
      fetchAllItems(process.env.WEBFLOW_CATEGORIES_COLLECTION_ID),
      fetchAllItems(process.env.WEBFLOW_SKILLS_COLLECTION_ID),
      fetchAllItems(process.env.WEBFLOW_CERTIFICATIONS_COLLECTION_ID),
      fetchAllItems(process.env.WEBFLOW_STATES_COLLECTION_ID)
    ]);

    const formOptions = buildFormOptions(categories, skills, certifications, states);

    // Cache the result
    optionsCache.data = formOptions;
    optionsCache.timestamp = now;

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(formOptions);

  } catch (error) {
    console.error('Error fetching form options:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch form options',
      message: error.message
    });
  }
};
