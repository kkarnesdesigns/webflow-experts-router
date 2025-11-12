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
   */
  function parseExpertsRoute() {
    const path = window.location.pathname;

    // Remove trailing slash and split into segments
    const segments = path.replace(/\/$/, '').split('/').filter(s => s);

    // Check if this is an experts route
    if (segments[0] !== 'experts') {
      return null;
    }

    // State-level route: /experts/{state}/{skill}
    // Pattern: ['experts', state, skill] - 3 segments
    if (segments.length === 3) {
      return {
        type: 'state',
        state: segments[1].toLowerCase(),
        skill: segments[2].toLowerCase(),
        city: null
      };
    }

    // City-level route: /experts/{state}/{city}/{skill}
    // Pattern: ['experts', state, city, skill] - 4 segments
    if (segments.length === 4) {
      return {
        type: 'city',
        state: segments[1].toLowerCase(),
        city: segments[2].toLowerCase(),
        skill: segments[3].toLowerCase()
      };
    }

    return null;
  }

  /**
   * Fetch route manifest from API
   */
  async function fetchRouteManifest() {
    try {
      // Change this URL to your actual Vercel deployment URL
      const manifestUrl = '/api/route-manifest';
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
  }

  /**
   * Update page meta data and title based on route
   */
  function updatePageMeta(params) {
    if (!params || !params.isValidRoute) return;

    // Update page title
    let title = 'Find Experts';
    if (params.type === 'city') {
      title = `${params.skillName || params.skill} Experts in ${params.cityName || params.city}, ${params.stateName || params.state}`;
    } else if (params.type === 'state') {
      title = `${params.skillName || params.skill} Experts in ${params.stateName || params.state}`;
    }
    document.title = title;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      const location = params.type === 'city'
        ? `${params.cityName || params.city}, ${params.stateName || params.state}`
        : params.stateName || params.state;
      metaDesc.setAttribute('content',
        `Find qualified ${params.skillName || params.skill} experts in ${location}. Browse profiles and connect with professionals.`
      );
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
