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
   * Fetch all categories (excludes archived items)
   */
  async getCategories(collectionId) {
    const items = await this.getCollectionItems(collectionId);
    // Filter out archived items
    return items.filter(item => !item.isArchived && !item.fieldData?.isArchived);
  }

  /**
   * Fetch all certifications (excludes archived items)
   */
  async getCertifications(collectionId) {
    const items = await this.getCollectionItems(collectionId);
    // Filter out archived items
    return items.filter(item => !item.isArchived && !item.fieldData?.isArchived);
  }

  /**
   * Fetch all CMS data needed for routing
   */
  async fetchAllData(config) {
    console.log('Fetching all CMS data from Webflow...');

    const [experts, cities, states, skills, categories, certifications] = await Promise.all([
      this.getExperts(config.expertsCollectionId),
      this.getCities(config.citiesCollectionId),
      this.getStates(config.statesCollectionId),
      this.getSkills(config.skillsCollectionId),
      this.getCategories(config.categoriesCollectionId),
      config.certificationsCollectionId ? this.getCertifications(config.certificationsCollectionId) : Promise.resolve([])
    ]);

    return { experts, cities, states, skills, categories, certifications };
  }

  /**
   * Fetch SEO landing content collection items
   */
  async getSeoContent(collectionId) {
    const items = await this.getCollectionItems(collectionId);
    return items.filter(item => !item.isArchived && !item.fieldData?.isArchived);
  }

  /**
   * Create a new CMS item in a collection (draft by default)
   * @param {string} collectionId - The Webflow collection ID
   * @param {object} fieldData - Field values for the new item
   * @param {boolean} isDraft - Whether to create as draft (default: true)
   * @returns {Promise<object>} Created item
   */
  async createCollectionItem(collectionId, fieldData, isDraft = true) {
    try {
      const response = await this.client.post(`/collections/${collectionId}/items${isDraft ? '' : '/live'}`, {
        fieldData
      });
      return response.data;
    } catch (error) {
      console.error('Error creating collection item:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Update an existing CMS item
   * @param {string} collectionId - The Webflow collection ID
   * @param {string} itemId - The item ID to update
   * @param {object} fieldData - Field values to update
   * @param {boolean} isDraft - Whether to keep as draft (default: true)
   * @returns {Promise<object>} Updated item
   */
  async updateCollectionItem(collectionId, itemId, fieldData, isDraft = true) {
    try {
      const response = await this.client.patch(`/collections/${collectionId}/items/${itemId}${isDraft ? '' : '/live'}`, {
        fieldData
      });
      return response.data;
    } catch (error) {
      console.error(`Error updating item ${itemId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Publish collection items (move from draft to live)
   * @param {string} collectionId - The Webflow collection ID
   * @param {string[]} itemIds - Array of item IDs to publish
   * @returns {Promise<object>} Publish result
   */
  async publishCollectionItems(collectionId, itemIds) {
    try {
      const response = await this.client.post(`/collections/${collectionId}/items/publish`, {
        itemIds
      });
      return response.data;
    } catch (error) {
      console.error('Error publishing items:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = WebflowAPI;
