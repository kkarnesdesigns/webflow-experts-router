/**
 * Route Generator Module
 * Generates all valid URL combinations for experts pages
 */

class RouteGenerator {
  /**
   * Slugify a string (convert to URL-friendly format)
   */
  static slugify(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')        // Replace spaces with -
      .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
      .replace(/\-\-+/g, '-')      // Replace multiple - with single -
      .replace(/^-+/, '')          // Trim - from start of text
      .replace(/-+$/, '');         // Trim - from end of text
  }

  /**
   * Get slug from Webflow item (checks common slug fields)
   */
  static getSlugFromItem(item) {
    // Try different possible slug field names
    if (item.slug) return item.slug;
    if (item.fieldData?.slug) return item.fieldData.slug;
    if (item.fieldData?.name) return this.slugify(item.fieldData.name);
    if (item.name) return this.slugify(item.name);

    // Fallback to first field that looks like a name
    const fieldData = item.fieldData || item;
    const nameField = Object.values(fieldData).find(val =>
      typeof val === 'string' && val.length > 0 && val.length < 100
    );

    return nameField ? this.slugify(nameField) : null;
  }

  /**
   * Get state slug from state item (uses full state name)
   */
  static getStateSlug(state) {
    // Use the standard slug getter which will slugify the full state name
    return this.getSlugFromItem(state);
  }

  /**
   * Generate state-level routes: /{basePath}/{state}/{category}/{skill}
   */
  static generateStateRoutes(states, skills, categories, basePath = '/experts') {
    const routes = [];

    // Create category map for lookup
    const categoryMap = new Map();
    for (const category of categories) {
      categoryMap.set(category.id || category._id, category);
    }

    for (const state of states) {
      const stateSlug = this.getStateSlug(state);
      if (!stateSlug) continue;

      for (const skill of skills) {
        const skillSlug = this.getSlugFromItem(skill);
        if (!skillSlug) continue;

        // Get the category for this skill
        const skillCategoryIds = skill.fieldData?.['expert-category'] || [];

        for (const categoryId of skillCategoryIds) {
          const category = categoryMap.get(categoryId);
          if (!category) continue;

          const categorySlug = this.getSlugFromItem(category);
          if (!categorySlug) continue;

          routes.push({
            path: `${basePath}/${stateSlug}/${categorySlug}/${skillSlug}`,
            type: 'state',
            params: {
              state: stateSlug,
              category: categorySlug,
              skill: skillSlug,
              stateId: state.id || state._id,
              categoryId: category.id || category._id,
              skillId: skill.id || skill._id,
              stateName: state.fieldData?.name || state.name,
              categoryName: category.fieldData?.name || category.name,
              skillName: skill.fieldData?.name || skill.name
            }
          });
        }
      }
    }

    return routes;
  }

  /**
   * Generate city-level routes: /{basePath}/{state}/{city}/{category}/{skill}
   */
  static generateCityRoutes(cities, states, skills, categories, basePath = '/experts') {
    const routes = [];

    // Create maps for state lookup by both ID and name
    const stateMapById = new Map();
    const stateMapByName = new Map();
    for (const state of states) {
      const stateId = state.id || state._id;
      const stateName = state.fieldData?.name || state.name;
      stateMapById.set(stateId, state);
      if (stateName) {
        stateMapByName.set(stateName.toLowerCase(), state);
      }
    }

    // Create category map for lookup
    const categoryMap = new Map();
    for (const category of categories) {
      categoryMap.set(category.id || category._id, category);
    }

    for (const city of cities) {
      const citySlug = this.getSlugFromItem(city);
      if (!citySlug) continue;

      // Get the state this city belongs to (try ID first, then name)
      const cityStateRef = city.fieldData?.state || city.state;
      let state = stateMapById.get(cityStateRef);
      if (!state && typeof cityStateRef === 'string') {
        // Try looking up by name if ID lookup failed
        state = stateMapByName.get(cityStateRef.toLowerCase());
      }
      if (!state) continue;

      const stateSlug = this.getStateSlug(state);
      if (!stateSlug) continue;

      for (const skill of skills) {
        const skillSlug = this.getSlugFromItem(skill);
        if (!skillSlug) continue;

        // Get the category for this skill
        const skillCategoryIds = skill.fieldData?.['expert-category'] || [];

        for (const categoryId of skillCategoryIds) {
          const category = categoryMap.get(categoryId);
          if (!category) continue;

          const categorySlug = this.getSlugFromItem(category);
          if (!categorySlug) continue;

          routes.push({
            path: `${basePath}/${stateSlug}/${citySlug}/${categorySlug}/${skillSlug}`,
            type: 'city',
            params: {
              city: citySlug,
              state: stateSlug,
              category: categorySlug,
              skill: skillSlug,
              cityId: city.id || city._id,
              stateId: state.id || state._id,
              categoryId: category.id || category._id,
              skillId: skill.id || skill._id,
              cityName: city.fieldData?.name || city.name,
              stateName: state.fieldData?.name || state.name,
              categoryName: category.fieldData?.name || category.name,
              skillName: skill.fieldData?.name || skill.name
            }
          });
        }
      }
    }

    return routes;
  }

  /**
   * Generate state/category routes: /{basePath}/{state}/{category}
   * All experts in that state with that category
   */
  static generateStateCategoryRoutes(states, categories, basePath = '/experts') {
    const routes = [];

    for (const state of states) {
      const stateSlug = this.getStateSlug(state);
      if (!stateSlug) continue;

      for (const category of categories) {
        const categorySlug = this.getSlugFromItem(category);
        if (!categorySlug) continue;

        routes.push({
          path: `${basePath}/${stateSlug}/${categorySlug}`,
          type: 'state-category',
          params: {
            state: stateSlug,
            category: categorySlug,
            stateId: state.id || state._id,
            categoryId: category.id || category._id,
            stateName: state.fieldData?.name || state.name,
            categoryName: category.fieldData?.name || category.name
          }
        });
      }
    }

    return routes;
  }

  /**
   * Generate state/city routes: /{basePath}/{state}/{city}
   * All experts in that city
   */
  static generateStateCityRoutes(cities, states, basePath = '/experts') {
    const routes = [];

    // Create maps for state lookup
    const stateMapById = new Map();
    const stateMapByName = new Map();
    for (const state of states) {
      const stateId = state.id || state._id;
      const stateName = state.fieldData?.name || state.name;
      stateMapById.set(stateId, state);
      if (stateName) {
        stateMapByName.set(stateName.toLowerCase(), state);
      }
    }

    for (const city of cities) {
      const citySlug = this.getSlugFromItem(city);
      if (!citySlug) continue;

      // Get the state this city belongs to
      const cityStateRef = city.fieldData?.state || city.state;
      let state = stateMapById.get(cityStateRef);
      if (!state && typeof cityStateRef === 'string') {
        state = stateMapByName.get(cityStateRef.toLowerCase());
      }
      if (!state) continue;

      const stateSlug = this.getStateSlug(state);
      if (!stateSlug) continue;

      routes.push({
        path: `${basePath}/${stateSlug}/${citySlug}`,
        type: 'state-city',
        params: {
          state: stateSlug,
          city: citySlug,
          stateId: state.id || state._id,
          cityId: city.id || city._id,
          stateName: state.fieldData?.name || state.name,
          cityName: city.fieldData?.name || city.name
        }
      });
    }

    return routes;
  }

  /**
   * Generate state/city/category routes: /{basePath}/{state}/{city}/{category}
   * All experts in that city with that category
   */
  static generateStateCityCategoryRoutes(cities, states, categories, basePath = '/experts') {
    const routes = [];

    // Create maps for state lookup
    const stateMapById = new Map();
    const stateMapByName = new Map();
    for (const state of states) {
      const stateId = state.id || state._id;
      const stateName = state.fieldData?.name || state.name;
      stateMapById.set(stateId, state);
      if (stateName) {
        stateMapByName.set(stateName.toLowerCase(), state);
      }
    }

    for (const city of cities) {
      const citySlug = this.getSlugFromItem(city);
      if (!citySlug) continue;

      // Get the state this city belongs to
      const cityStateRef = city.fieldData?.state || city.state;
      let state = stateMapById.get(cityStateRef);
      if (!state && typeof cityStateRef === 'string') {
        state = stateMapByName.get(cityStateRef.toLowerCase());
      }
      if (!state) continue;

      const stateSlug = this.getStateSlug(state);
      if (!stateSlug) continue;

      for (const category of categories) {
        const categorySlug = this.getSlugFromItem(category);
        if (!categorySlug) continue;

        routes.push({
          path: `${basePath}/${stateSlug}/${citySlug}/${categorySlug}`,
          type: 'state-city-category',
          params: {
            state: stateSlug,
            city: citySlug,
            category: categorySlug,
            stateId: state.id || state._id,
            cityId: city.id || city._id,
            categoryId: category.id || category._id,
            stateName: state.fieldData?.name || state.name,
            cityName: city.fieldData?.name || city.name,
            categoryName: category.fieldData?.name || category.name
          }
        });
      }
    }

    return routes;
  }

  /**
   * Generate all routes
   */
  static generateAllRoutes(data, basePath = '/experts') {
    const { cities, states, skills, categories } = data;

    console.log('Generating routes...');
    console.log(`- ${states.length} states`);
    console.log(`- ${cities.length} cities`);
    console.log(`- ${categories.length} categories`);
    console.log(`- ${skills.length} skills`);

    const stateCategoryRoutes = this.generateStateCategoryRoutes(states, categories, basePath);
    const stateCityRoutes = this.generateStateCityRoutes(cities, states, basePath);
    const stateCityCategoryRoutes = this.generateStateCityCategoryRoutes(cities, states, categories, basePath);
    const stateRoutes = this.generateStateRoutes(states, skills, categories, basePath);
    const cityRoutes = this.generateCityRoutes(cities, states, skills, categories, basePath);

    const allRoutes = [
      ...stateCategoryRoutes,
      ...stateCityRoutes,
      ...stateCityCategoryRoutes,
      ...stateRoutes,
      ...cityRoutes
    ];

    console.log(`\nGenerated ${allRoutes.length} total routes:`);
    console.log(`- ${stateCategoryRoutes.length} state/category routes`);
    console.log(`- ${stateCityRoutes.length} state/city routes`);
    console.log(`- ${stateCityCategoryRoutes.length} state/city/category routes`);
    console.log(`- ${stateRoutes.length} state/category/skill routes`);
    console.log(`- ${cityRoutes.length} city/category/skill routes`);

    return {
      stateCategoryRoutes,
      stateCityRoutes,
      stateCityCategoryRoutes,
      stateRoutes,
      cityRoutes,
      allRoutes,
      stats: {
        total: allRoutes.length,
        stateCategory: stateCategoryRoutes.length,
        stateCity: stateCityRoutes.length,
        stateCityCategory: stateCityCategoryRoutes.length,
        stateLevel: stateRoutes.length,
        cityLevel: cityRoutes.length,
        states: states.length,
        cities: cities.length,
        categories: categories.length,
        skills: skills.length
      }
    };
  }

  /**
   * Create a route manifest (lookup map for quick matching)
   */
  static createRouteManifest(routes) {
    const manifest = {
      routes: {},
      generated: new Date().toISOString(),
      count: routes.length
    };

    for (const route of routes) {
      manifest.routes[route.path] = route.params;
    }

    return manifest;
  }
}

module.exports = RouteGenerator;
