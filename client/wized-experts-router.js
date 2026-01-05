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
   * - /hire/{category} (2 segments) - category index (no location)
   * - /hire/{category}/{skill} (3 segments) - skill/cert index (no location)
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

    // 2-segment routes: /hire/{category} - handled by Webflow directly, not this router
    if (segments.length === 2) {
      return null;
    }

    // 3-segment routes: could be state/category, state/city, OR category/skill (index)
    // Pattern: ['hire', X, Y] - 3 segments
    // We'll let the manifest validation determine which type it is
    if (segments.length === 3) {
      return {
        type: 'ambiguous-3', // Will be resolved by manifest lookup
        segment1: segments[1].toLowerCase(),
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
      const manifestUrl = 'https://seo.joingyde.com/api/route-manifest';
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

    // Store params in Wized and trigger request (combined for proper sequencing)
    storeInWizedAndTriggerRequest(params);
  }

  /**
   * Store route params in Wized's data store and trigger request
   * Uses Wized's native event system when available for reliable timing
   */
  function storeInWizedAndTriggerRequest(params) {
    // Function to store params in Wized
    const storeParams = () => {
      window.Wized.data.v.routeParams = params;
      window.Wized.data.v.stateName = params.stateName || '';
      window.Wized.data.v.cityName = params.cityName || '';
      window.Wized.data.v.categoryName = params.categoryName || '';
      window.Wized.data.v.skillName = params.skillName || '';
      window.Wized.data.v.certificationName = params.certificationName || '';
      window.Wized.data.v.stateId = params.stateId || '';
      window.Wized.data.v.cityId = params.cityId || '';
      window.Wized.data.v.categoryId = params.categoryId || '';
      window.Wized.data.v.skillId = params.skillId || '';
      window.Wized.data.v.certificationId = params.certificationId || '';
      console.log('Stored route params in Wized data store');
    };

    // Function to execute the request with retries
    const executeRequest = async (attempt = 1) => {
      try {
        console.log(`Triggering Wized get_experts request (attempt ${attempt})...`);
        const result = await window.Wized.requests.execute('get_experts');
        console.log('Wized request result:', result);

        // Check if result has data - if undefined or empty, Wized may need more time
        if (result === undefined && attempt < 3) {
          console.log('Request returned undefined, retrying...');
          setTimeout(() => executeRequest(attempt + 1), 300 * attempt);
        }
      } catch (e) {
        console.warn(`Wized request attempt ${attempt} failed:`, e);
        if (attempt < 3) {
          setTimeout(() => executeRequest(attempt + 1), 300 * attempt);
        }
      }
    };

    // Check if Wized is already fully initialized
    const isWizedReady = () => {
      return window.Wized &&
             window.Wized.data &&
             window.Wized.data.v &&
             typeof window.Wized.requests?.execute === 'function';
    };

    // Main initialization flow using Wized's onReady
    if (window.Wized && typeof window.Wized.on === 'function') {
      // Use Wized's native event system - this is the most reliable
      window.Wized.on('ready', () => {
        console.log('Wized ready event fired');
        storeParams();
        // Give Wized time to process params before executing
        setTimeout(() => executeRequest(), 100);
      });

      // Also store params immediately if Wized data is available
      // This handles the case where 'ready' already fired
      if (isWizedReady()) {
        storeParams();
        setTimeout(() => executeRequest(), 100);
      }
    } else if (isWizedReady()) {
      // Wized is ready but doesn't have .on() method
      storeParams();
      setTimeout(() => executeRequest(), 100);
    } else {
      // Fallback: poll for Wized to be ready
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max

      const pollForWized = () => {
        attempts++;

        // Check for Wized.on becoming available
        if (window.Wized && typeof window.Wized.on === 'function') {
          window.Wized.on('ready', () => {
            console.log('Wized ready event fired (from poll)');
            storeParams();
            setTimeout(() => executeRequest(), 100);
          });
          // Also check if already ready
          if (isWizedReady()) {
            storeParams();
            setTimeout(() => executeRequest(), 100);
          }
        } else if (isWizedReady()) {
          storeParams();
          setTimeout(() => executeRequest(), 100);
        } else if (attempts < maxAttempts) {
          setTimeout(pollForWized, 100);
        } else {
          console.warn('Wized not ready after 10 seconds');
        }
      };

      pollForWized();
    }
  }

  // Legacy function names for compatibility
  function storeInWized(params) {
    // Now handled by storeInWizedAndTriggerRequest
  }

  function triggerWizedRequest() {
    // Now handled by storeInWizedAndTriggerRequest
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

    const certificationName = params.certificationName || params.certification;

    switch (params.type) {
      case 'skill-index':
        title = `${skillName} Experts`;
        description = `Find qualified ${skillName} experts. Browse profiles and connect with professionals.`;
        break;
      case 'certification-index':
        title = `${certificationName} Certified Experts`;
        description = `Find ${certificationName} certified experts. Browse profiles and connect with professionals.`;
        break;
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
      case 'state-certification':
        title = `${certificationName} Certified Experts in ${stateName}`;
        description = `Find ${certificationName} certified experts in ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'city':
        title = `${skillName} Experts in ${cityName}, ${stateName}`;
        description = `Find qualified ${skillName} experts in ${cityName}, ${stateName}. Browse profiles and connect with professionals.`;
        break;
      case 'city-certification':
        title = `${certificationName} Certified Experts in ${cityName}, ${stateName}`;
        description = `Find ${certificationName} certified experts in ${cityName}, ${stateName}. Browse profiles and connect with professionals.`;
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
