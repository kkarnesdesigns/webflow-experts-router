/**
 * Cloudflare Worker for Webflow Experts Router
 *
 * Intercepts requests to /hire/{state}/{skill} and /hire/{state}/{city}/{skill}
 * and serves the Webflow template page while preserving the URL
 *
 * Leaves other /hire/* URLs untouched (e.g., /hire/contact, /hire/about)
 */

// Configuration
const CONFIG = {
  // Your Webflow site URL
  webflowSiteUrl: 'https://www.joingyde.com',

  // The path to your Webflow template page
  templatePagePath: '/hire-template', // Change this to wherever your template page lives

  // Vercel API URL for route manifest
  manifestApiUrl: 'https://webflow-experts-router.vercel.app/api/route-manifest',

  // Cache duration for manifest (in seconds)
  manifestCacheDuration: 3600, // 1 hour
};

// In-memory cache for the manifest
let manifestCache = {
  data: null,
  timestamp: 0
};

/**
 * Fetch and cache the route manifest
 */
async function getRouteManifest() {
  const now = Date.now();

  // Return cached manifest if still valid
  if (manifestCache.data && (now - manifestCache.timestamp) < (CONFIG.manifestCacheDuration * 1000)) {
    return manifestCache.data;
  }

  try {
    const response = await fetch(CONFIG.manifestApiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const manifest = await response.json();

    // Update cache
    manifestCache.data = manifest;
    manifestCache.timestamp = now;

    return manifest;
  } catch (error) {
    console.error('Error fetching manifest:', error);
    // Return cached data if fetch fails
    return manifestCache.data;
  }
}

/**
 * Check if a URL path matches the expert route pattern
 * Returns: { isMatch: boolean, segments: number }
 */
function matchesExpertRoutePattern(pathname) {
  // Remove trailing slash and split
  const segments = pathname.replace(/\/$/, '').split('/').filter(s => s);

  // Must start with 'hire'
  if (segments[0] !== 'hire') {
    return { isMatch: false, segments: 0 };
  }

  // Check for valid patterns:
  // /hire/{state}/{category}/{skill} = 4 segments
  // /hire/{state}/{city}/{category}/{skill} = 5 segments
  if (segments.length === 4 || segments.length === 5) {
    return { isMatch: true, segments: segments.length };
  }

  return { isMatch: false, segments: segments.length };
}

/**
 * Validate if the route exists in the manifest
 */
function isValidRoute(pathname, manifest) {
  if (!manifest || !manifest.routes) {
    return false;
  }

  // Normalize path (remove trailing slash)
  const normalizedPath = pathname.replace(/\/$/, '');

  return normalizedPath in manifest.routes;
}

/**
 * Main request handler
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if this matches an expert route pattern
  const patternMatch = matchesExpertRoutePattern(pathname);

  // If it doesn't match the pattern, let it pass through
  if (!patternMatch.isMatch) {
    return fetch(request);
  }

  // It matches the pattern, now validate against the manifest
  const manifest = await getRouteManifest();

  if (!manifest || !isValidRoute(pathname, manifest)) {
    // Invalid route - return 404 or pass through to Webflow
    return fetch(request);
  }

  // Valid expert route - serve the template page
  const templateUrl = new URL(CONFIG.webflowSiteUrl + CONFIG.templatePagePath);

  // Create new request to template page
  const templateRequest = new Request(templateUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });

  // Fetch the template page
  const response = await fetch(templateRequest);

  // Clone the response so we can modify headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });

  // Add custom header to indicate this was routed
  newResponse.headers.set('X-Experts-Router', 'cloudflare-worker');
  newResponse.headers.set('X-Route-Type', manifest.routes[pathname.replace(/\/$/, '')]?.type || 'unknown');

  return newResponse;
}

/**
 * Cloudflare Worker entry point
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
