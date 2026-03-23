/**
 * Cloudflare Worker for Webflow Experts Router
 *
 * Intercepts dynamic expert route requests and serves the Webflow template page
 * while preserving the URL.
 *
 * Supported patterns:
 * - /hire/{state}/{category}
 * - /hire/{state}/{city}
 * - /hire/{state}/{city}/{category}
 * - /hire/{state}/{category}/{skill}
 * - /hire/{state}/{city}/{category}/{skill}
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
  manifestApiUrl: 'https://seo.joingyde.com/api/route-manifest',

  // Vercel API URL for experts (used to fetch SEO landing content)
  expertsApiUrl: 'https://seo.joingyde.com/api/get-experts',

  // Cache duration for manifest (in seconds)
  manifestCacheDuration: 300, // 5 minutes
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
 *
 * Valid patterns:
 * - /hire/{state}/{category} = 3 segments
 * - /hire/{state}/{city} = 3 segments
 * - /hire/{state}/{city}/{category} = 4 segments
 * - /hire/{state}/{category}/{skill} = 4 segments
 * - /hire/{state}/{city}/{category}/{skill} = 5 segments
 */
function matchesExpertRoutePattern(pathname) {
  // Remove trailing slash and split
  const segments = pathname.replace(/\/$/, '').split('/').filter(s => s);

  // Must start with 'hire'
  if (segments[0] !== 'hire') {
    return { isMatch: false, segments: 0 };
  }

  // Check for valid patterns (3-5 segments)
  if (segments.length >= 3 && segments.length <= 5) {
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
 * Fetch SEO meta content from the experts API for a given route.
 * Uses lightweight request with limit=0 to avoid fetching expert items.
 */
async function fetchSeoMeta(routeData) {
  const params = new URLSearchParams({ limit: '0' });
  if (routeData.stateId) params.set('stateId', routeData.stateId);
  if (routeData.cityId) params.set('cityId', routeData.cityId);
  if (routeData.skillId) params.set('skillId', routeData.skillId);
  if (routeData.certificationId) params.set('certificationId', routeData.certificationId);
  if (routeData.categoryId) params.set('categoryId', routeData.categoryId);

  try {
    const response = await fetch(`${CONFIG.expertsApiUrl}?${params.toString()}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.seoLanding || null;
  } catch (e) {
    return null;
  }
}

/**
 * Inject SEO meta tags into HTML response.
 * Replaces existing <title> and meta description/og tags with CMS content.
 */
function injectMetaTags(html, seoMeta, routeData) {
  // Build fallback title from route data
  const entityName = routeData.skillName || routeData.certificationName || '';
  const location = [routeData.cityName, routeData.stateName].filter(Boolean).join(', ');
  const fallbackTitle = `${entityName} Experts${location ? ' in ' + location : ''} | Gyde`;

  const title = seoMeta.metaTitle || fallbackTitle;
  const description = seoMeta.metaDescription || '';

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);

  // Replace or inject meta description
  if (html.includes('name="description"')) {
    html = html.replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${escapeHtml(description)}$2`
    );
  } else {
    html = html.replace('</head>', `<meta name="description" content="${escapeHtml(description)}">\n</head>`);
  }

  // Replace or inject og:title
  if (html.includes('property="og:title"')) {
    html = html.replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
      `$1${escapeHtml(title)}$2`
    );
  }

  // Inject canonical URL
  const canonicalUrl = `${CONFIG.webflowSiteUrl}${routeData.path || ''}`;
  if (!html.includes('rel="canonical"')) {
    html = html.replace('</head>', `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n</head>`);
  } else {
    html = html.replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
      `$1${escapeHtml(canonicalUrl)}$2`
    );
  }

  return html;
}

/**
 * Escape HTML special characters for safe attribute injection
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

  const routeData = manifest.routes[pathname.replace(/\/$/, '')] || {};

  // Try to inject SEO meta tags into the HTML for crawlers
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html') && routeData.stateId) {
    try {
      const seoMeta = await fetchSeoMeta(routeData);
      if (seoMeta) {
        let html = await response.text();
        html = injectMetaTags(html, seoMeta, routeData);

        const newResponse = new Response(html, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers)
        });
        newResponse.headers.set('X-Experts-Router', 'cloudflare-worker');
        newResponse.headers.set('X-Route-Type', routeData.type || 'unknown');
        newResponse.headers.set('X-SEO-Injected', 'true');
        return newResponse;
      }
    } catch (e) {
      // Fall through to non-injected response on error
      console.error('SEO injection error:', e);
    }
  }

  // Fallback: serve template without SEO injection
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });

  // Add custom header to indicate this was routed
  newResponse.headers.set('X-Experts-Router', 'cloudflare-worker');
  newResponse.headers.set('X-Route-Type', routeData.type || 'unknown');

  return newResponse;
}

/**
 * Cloudflare Worker entry point
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
