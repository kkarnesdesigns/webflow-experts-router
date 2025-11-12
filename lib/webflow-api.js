/**
 * Webflow CMS API Integration Module
 * Handles fetching data from Webflow CMS collections
 */

const axios = require('axios');

class WebflowAPI {
  constructor(apiToken) {
    this.apiToken = apiToken;
    this.baseURL = 'https://api.webflow.com/v2';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'accept-version': '1.0.0',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Fetch all items from a collection with pagination
   * @param {string} collectionId - The Webflow collection ID
   * @returns {Promise<Array>} Array of collection items
   */
  async getCollectionItems(collectionId) {
    try {
      let allItems = [];
      let offset = 0;
      const limit = 100; // Max items per request
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/collections/${collectionId}/items`, {
          params: { offset, limit }
        });

        const items = response.data.items || [];
        allItems = allItems.concat(items);

        // Check if there are more items to fetch
        hasMore = items.length === limit;
        offset += limit;

        // Add small delay to respect rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`Fetched ${allItems.length} items from collection ${collectionId}`);
      return allItems;
    } catch (error) {
      console.error(`Error fetching collection ${collectionId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch all experts (excludes archived items)
   */
  async getExperts(collectionId) {
    const items = await this.getCollectionItems(collectionId);
    // Filter out archived items
    return items.filter(item => !item.isArchived && !item.fieldData?.isArchived);
  }

  /**
   * Fetch all cities
   */
  async getCities(collectionId) {
    return this.getCollectionItems(collectionId);
  }

  /**
   * Fetch all states
   */
  async getStates(collectionId) {
    return this.getCollectionItems(collectionId);
  }

  /**
   * Fetch all skills (excludes archived items)
   */
  async getSkills(collectionId) {
    const items = await this.getCollectionItems(collectionId);
    // Filter out archived items
    return items.filter(item => !item.isArchived && !item.fieldData?.isArchived);
  }

  /**
   * Fetch all CMS data needed for routing
   */
  async fetchAllData(config) {
    console.log('Fetching all CMS data from Webflow...');

    const [experts, cities, states, skills] = await Promise.all([
      this.getExperts(config.expertsCollectionId),
      this.getCities(config.citiesCollectionId),
      this.getStates(config.statesCollectionId),
      this.getSkills(config.skillsCollectionId)
    ]);

    return { experts, cities, states, skills };
  }
}

module.exports = WebflowAPI;
