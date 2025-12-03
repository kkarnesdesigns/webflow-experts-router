/**
 * Vercel Serverless Function: Get Experts with Filtering
 * Proxies requests to Webflow CMS and filters by state, city, category, skill
 *
 * Query Parameters:
 * - stateId: Filter by state ID
 * - cityId: Filter by city ID
 * - categoryId: Filter by category ID (checks expert's skills' categories)
 * - skillId: Filter by skill ID
 * - limit: Max results to return (default: 100)
 * - offset: Pagination offset (default: 0)
 */

const axios = require('axios');

// Cache for experts data (refreshes every 5 minutes)
let expertsCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

// Cache for skills data (to look up skill -> category mapping)
let skillsCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 60 * 1000 // 30 minutes
};

// Cache for cities data (to look up city names)
let citiesCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 60 * 1000 // 30 minutes
};

// Cache for states data (to look up state names)
let statesCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 60 * 1000 // 30 minutes
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

    // Small delay to respect rate limits
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return items;
}

/**
 * Get all experts (with caching)
 */
async function getExperts() {
  const now = Date.now();

  if (expertsCache.data && (now - expertsCache.timestamp) < expertsCache.ttl) {
    return expertsCache.data;
  }

  const experts = await fetchAllItems(process.env.WEBFLOW_EXPERTS_COLLECTION_ID);

  // Filter out archived experts
  const activeExperts = experts.filter(e => !e.isArchived && !e.fieldData?.isArchived);

  expertsCache.data = activeExperts;
  expertsCache.timestamp = now;

  return activeExperts;
}

/**
 * Get all skills (with caching) - needed for category lookups
 */
async function getSkills() {
  const now = Date.now();

  if (skillsCache.data && (now - skillsCache.timestamp) < skillsCache.ttl) {
    return skillsCache.data;
  }

  const skills = await fetchAllItems(process.env.WEBFLOW_SKILLS_COLLECTION_ID);

  // Filter out archived skills
  const activeSkills = skills.filter(s => !s.isArchived && !s.fieldData?.isArchived);

  skillsCache.data = activeSkills;
  skillsCache.timestamp = now;

  return activeSkills;
}

/**
 * Get all cities (with caching) - needed for city name lookups
 */
async function getCities() {
  const now = Date.now();

  if (citiesCache.data && (now - citiesCache.timestamp) < citiesCache.ttl) {
    return citiesCache.data;
  }

  const cities = await fetchAllItems(process.env.WEBFLOW_CITIES_COLLECTION_ID);

  citiesCache.data = cities;
  citiesCache.timestamp = now;

  return cities;
}

/**
 * Get all states (with caching) - needed for state name lookups
 */
async function getStates() {
  const now = Date.now();

  if (statesCache.data && (now - statesCache.timestamp) < statesCache.ttl) {
    return statesCache.data;
  }

  const states = await fetchAllItems(process.env.WEBFLOW_STATES_COLLECTION_ID);

  statesCache.data = states;
  statesCache.timestamp = now;

  return states;
}

/**
 * Shuffle array using a seeded random number generator
 * Same seed = same shuffle order (changes daily)
 */
function seededShuffle(array, seed) {
  const shuffled = [...array];

  // Simple seeded random function
  const seededRandom = (s) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  // Fisher-Yates shuffle with seeded random
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Get daily seed - changes once every 24 hours
 */
function getDailySeed() {
  const now = new Date();
  // Create seed from year + day of year
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now - startOfYear;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return now.getFullYear() * 1000 + dayOfYear;
}

/**
 * Enrich experts with city, state, and skill names
 */
function enrichExperts(experts, cities, states, skills) {
  // Build lookup maps
  const cityMap = new Map();
  for (const city of cities) {
    cityMap.set(city.id, city.fieldData?.name || city.name);
  }

  const stateMap = new Map();
  for (const state of states) {
    stateMap.set(state.id, state.fieldData?.name || state.name);
  }

  const skillMap = new Map();
  for (const skill of skills) {
    skillMap.set(skill.id, skill.fieldData?.name || skill.name);
  }

  // Add names to each expert
  return experts.map(expert => {
    const data = expert.fieldData || {};

    // Get skill names from skill IDs
    const skillIds = data['skills-2'] || [];
    const skillNames = skillIds
      .map(id => skillMap.get(id))
      .filter(name => name); // Remove any undefined names

    return {
      ...expert,
      fieldData: {
        ...data,
        cityName: cityMap.get(data.city) || null,
        stateName: stateMap.get(data.state) || null,
        skillNames: skillNames // Array of all skill names
      }
    };
  });
}

/**
 * Filter experts based on query parameters
 */
function filterExperts(experts, skills, filters) {
  const { stateId, cityId, categoryId, skillId } = filters;

  // If no filters provided, return all experts
  if (!stateId && !cityId && !categoryId && !skillId) {
    return experts;
  }

  // Build a map of skillId -> categoryIds for category filtering
  const skillCategoryMap = new Map();
  if (categoryId) {
    for (const skill of skills) {
      const skillCategories = skill.fieldData?.['expert-category'] || [];
      skillCategoryMap.set(skill.id, skillCategories);
    }
  }

  // Get all skills that belong to the target category
  const skillsInCategory = new Set();
  if (categoryId) {
    for (const skill of skills) {
      const skillCategories = skill.fieldData?.['expert-category'] || [];
      if (skillCategories.includes(categoryId)) {
        skillsInCategory.add(skill.id);
      }
    }
  }

  return experts.filter(expert => {
    const data = expert.fieldData || {};

    // Filter by state
    if (stateId && data.state !== stateId) {
      return false;
    }

    // Filter by city
    if (cityId && data.city !== cityId) {
      return false;
    }

    // Filter by skill
    if (skillId) {
      const expertSkills = data['skills-2'] || [];
      if (!expertSkills.includes(skillId)) {
        return false;
      }
    }

    // Filter by category (expert must have at least one skill in this category)
    if (categoryId) {
      const expertSkills = data['skills-2'] || [];
      const hasSkillInCategory = expertSkills.some(sid => skillsInCategory.has(sid));
      if (!hasSkillInCategory) {
        return false;
      }
    }

    return true;
  });
}

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
    // Get query parameters
    const {
      stateId,
      cityId,
      categoryId,
      skillId,
      limit = 100,
      offset = 0
    } = req.query;

    // Fetch experts, skills, cities, and states (cached)
    const [experts, skills, cities, states] = await Promise.all([
      getExperts(),
      getSkills(), // Always fetch skills for name enrichment
      getCities(),
      getStates()
    ]);

    // Enrich experts with city, state, and skill names
    const enrichedExperts = enrichExperts(experts, cities, states, skills);

    // Apply filters
    const filteredExperts = filterExperts(enrichedExperts, skills, {
      stateId,
      cityId,
      categoryId,
      skillId
    });

    // Shuffle experts with daily seed (same order for 24 hours)
    const dailySeed = getDailySeed();
    const shuffledExperts = seededShuffle(filteredExperts, dailySeed);

    // Apply pagination
    const paginatedExperts = shuffledExperts.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    // Return filtered and paginated results
    res.status(200).json({
      items: paginatedExperts,
      count: paginatedExperts.length,
      total: filteredExperts.length,
      filters: {
        stateId: stateId || null,
        cityId: cityId || null,
        categoryId: categoryId || null,
        skillId: skillId || null
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + paginatedExperts.length < filteredExperts.length
      }
    });

  } catch (error) {
    console.error('Error fetching experts:', error.response?.data || error.message);

    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch experts',
      message: error.message,
      details: error.response?.data
    });
  }
};
