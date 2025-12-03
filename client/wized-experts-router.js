/**
 * Wized Experts Dynamic Router
 * Client-side JavaScript to handle dynamic routing for experts pages
 *
 * Add this script to your Webflow template page in the <head> or before </body>
 * Make sure it loads BEFORE Wized initializes
 */

(function() {
  'use strict';

  /**
   * Parse the current URL path and extract route parameters
   *
   * Supported patterns:
   * - /hire/{state}/{category} (3 segments) - state + category (validated against manifest)
   * - /hire/{state}/{city} (3 segments) - state + city (validated against manifest)
   * - /hire/{state}/{city}/{category} (4 segments) - state + city + category
   * - /hire/{state}/{category}/{skill} (4 segments) - state + category + skill
   * - /hire/{state}/{city}/{category}/{skill} (5 segments) - full path
   */
  function parseExpertsRoute() {
    const path = window.location.pathname;

    // Remove trailing slash and split into segments
    const segments = path.replace(/\/$/, '').split('/').filter(s => s);

    // Check if this is a hire/experts route
    if (segments[0] !== 'hire' && segments[0] !== 'experts') {
      return null;
    }

    // 3-segment routes: could be state/category OR state/city
    // Pattern: ['hire', state, category-or-city] - 3 segments
    // We'll let the manifest validation determine which type it is
    if (segments.length === 3) {
      return {
        type: 'ambiguous-3', // Will be resolved by manifest lookup
        state: segments[1].toLowerCase(),
        segment2: segments[2].toLowerCase()
      };
    }

    // 4-segment routes: could be state/city/category OR state/category/skill
    // Pattern: ['hire', state, X, Y] - 4 segments
    // We'll let the manifest validation determine which type it is
    if (segments.length === 4) {
      return {
        type: 'ambiguous-4', // Will be resolved by manifest lookup
        state: segments[1].toLowerCase(),
        segment2: segments[2].toLowerCase(),
        segment3: segments[3].toLowerCase()
      };
    }

    // City-level route with skill: /hire/{state}/{city}/{category}/{skill}
    // Pattern: ['hire', state, city, category, skill] - 5 segments
    if (segments.length === 5) {
      return {
        type: 'city',
        state: segments[1].toLowerCase(),
        city: segments[2].toLowerCase(),
        category: segments[3].toLowerCase(),
        skill: segments[4].toLowerCase()
      };
    }

    return null;
  }

  /**
   * Fetch route manifest from API
   */
  async function fetchRouteManifest() {
    try {
      const manifestUrl = 'https://webflow-experts-router.vercel.app/api/route-manifest';
      const response = await fetch(manifestUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching route manifest:', error);
      return null;
    }
  }

  /**
   * Validate and enrich route parameters with manifest data
   */
  function enrichRouteParams(routeParams, manifest) {
    if (!manifest || !routeParams) return routeParams;

    const path = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
    const manifestData = manifest.routes?.[path];

    if (manifestData) {
      return {
        ...routeParams,
        ...manifestData,
        isValidRoute: true
      };
    }

    return {
      ...routeParams,
      isValidRoute: false
    };
  }

  /**
   * Initialize Wized variables for filtering
   */
  function initializeWizedVariables(params) {
    if (!params) {
      console.error('No route params to initialize');
      return;
    }

    // Create a global object for Wized to access
    window.ExpertsRouteParams = params;

    // Dispatch custom event for Wized to listen to
    const event = new CustomEvent('expertsRouteReady', {
      detail: params
    });
    window.dispatchEvent(event);

    console.log('Experts Route Params:', params);

    // Store in session storage for Wized to access
    try {
      sessionStorage.setItem('expertsRouteParams', JSON.stringify(params));
    } catch (e) {
      console.warn('Could not store route params in session storage:', e);
    }

    // Store params in Wized data store if available
    storeInWized(params);

    // Trigger Wized request if Wized is available
    triggerWizedRequest();
  }

  /**
   * Store route params in Wized's data store
   */
  function storeInWized(params) {
    const setWizedData = () => {
      if (window.Wized && window.Wized.data && window.Wized.data.v) {
        // Store each param as a Wized variable
        window.Wized.data.v.routeParams = params;
        window.Wized.data.v.stateName = params.stateName || '';
        window.Wized.data.v.cityName = params.cityName || '';
        window.Wized.data.v.categoryName = params.categoryName || '';
        window.Wized.data.v.skillName = params.skillName || '';
        window.Wized.data.v.stateId = params.stateId || '';
        window.Wized.data.v.cityId = params.cityId || '';
        window.Wized.data.v.categoryId = params.categoryId || '';
        window.Wized.data.v.skillId = params.skillId || '';
        console.log('Stored route params in Wized data store');
      }
    };

    if (window.Wized) {
      setWizedData();
    } else {
      // Wait for Wized
      const checkWized = setInterval(() => {
        if (window.Wized) {
          clearInterval(checkWized);
          setWizedData();
        }
      }, 100);
      setTimeout(() => clearInterval(checkWized), 5000);
    }
  }

  /**
   * Trigger the Wized get_experts request
   * Waits for Wized to be fully ready before executing
   */
  function triggerWizedRequest() {
    // Use Wized's built-in ready check if available
    if (window.Wized && typeof window.Wized.requests?.execute === 'function') {
      // Small delay to ensure Wized has loaded all request configs
      setTimeout(executeWizedRequest, 100);
    } else {
      // Wait for Wized to initialize, then wait a bit more for configs
      const checkWized = setInterval(() => {
        if (window.Wized && typeof window.Wized.requests?.execute === 'function') {
          clearInterval(checkWized);
          setTimeout(executeWizedRequest, 100);
        }
      }, 100);

      // Stop checking after 5 seconds
      setTimeout(() => clearInterval(checkWized), 5000);
    }
  }

  /**
   * Execute the Wized request
   */
  async function executeWizedRequest() {
    try {
      if (window.Wized && window.Wized.requests) {
        console.log('Triggering Wized get_experts request...');
        const result = await window.Wized.requests.execute('get_experts');
        console.log('Wized request result:', result);
      }
    } catch (e) {
      console.warn('Could not trigger Wized request:', e);
    }
  }

  /**
   * Update page meta data and title based on route
   */
  function updatePageMeta(params) {
    if (!params || !params.isValidRoute) return;

    // Build page title based on route type
    let title = 'Find Experts';
    let description = '';

    const categoryName = params.categoryName || params.category;
    const skillName = params.skillName || params.skill;
    const stateName = params.stateName || params.state;
    const cityName = params.cityName || params.city;

    switch (params.type) {
      case 'state-category':
        title = `${categoryName} Experts in ${stateName}`;
        description = `Find qualified ${categoryName} experts in ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'state-city':
        title = `Experts in ${cityName}, ${stateName}`;
        description = `Find qualified experts in ${cityName}, ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'state-city-category':
        title = `${categoryName} Experts in ${cityName}, ${stateName}`;
        description = `Find qualified ${categoryName} experts in ${cityName}, ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'state':
        title = `${skillName} Experts in ${stateName}`;
        description = `Find qualified ${skillName} experts in ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'city':
        title = `${skillName} Experts in ${cityName}, ${stateName}`;
        description = `Find qualified ${skillName} experts in ${cityName}, ${stateName}. Browse profiles and connect with professionals.`;
        break;
      default:
        title = 'Find Experts';
        description = 'Find qualified experts. Browse profiles and connect with professionals.';
    }

    document.title = title;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    }

    // Update Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', window.location.href);
  }

  /**
   * Show 404 if route is not valid
   */
  function handle404(params) {
    console.warn('Invalid route:', window.location.pathname);

    // Dispatch 404 event for Wized to handle
    const event = new CustomEvent('expertsRoute404', {
      detail: { path: window.location.pathname, params }
    });
    window.dispatchEvent(event);

    // Update title
    document.title = 'Page Not Found';
  }

  /**
   * Main initialization function
   */
  async function initExpertsRouter() {
    console.log('Initializing Experts Router...');

    // Parse current route
    const routeParams = parseExpertsRoute();

    if (!routeParams) {
      console.log('Not an experts route, skipping router initialization');
      return;
    }

    console.log('Parsed route:', routeParams);

    // Fetch and validate with manifest
    const manifest = await fetchRouteManifest();
    const enrichedParams = enrichRouteParams(routeParams, manifest);

    // Handle invalid routes
    if (!enrichedParams.isValidRoute) {
      handle404(enrichedParams);
      return;
    }

    // Initialize Wized variables
    initializeWizedVariables(enrichedParams);

    // Update page meta
    updatePageMeta(enrichedParams);

    console.log('Experts Router initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertsRouter);
  } else {
    initExpertsRouter();
  }

  // Re-initialize on history changes (for SPA behavior)
  window.addEventListener('popstate', initExpertsRouter);

  // Export for external access if needed
  window.ExpertsRouter = {
    init: initExpertsRouter,
    parseRoute: parseExpertsRoute,
    getCurrentParams: () => window.ExpertsRouteParams
  };

})();
