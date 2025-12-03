# Webflow Experts Dynamic Router

Automatic page generation and dynamic routing system for Webflow + Wized projects. Creates all possible combinations of Skill + Location pages with intelligent filtering.

## Overview

This system generates dynamic routes for expert directory pages with two URL patterns:

- **State-level**: `/experts/{state}/{skill}` (e.g., `/experts/texas/dentistry`)
- **City-level**: `/experts/{state}/{city}/{skill}` (e.g., `/experts/texas/dallas/dentistry`)

### Key Features

- ✅ Automatically generates all valid route combinations from Webflow CMS
- ✅ Single template page in Webflow (edit visually, no code maintenance)
- ✅ Client-side router extracts URL parameters for Wized filtering
- ✅ SEO sitemap generation for all routes
- ✅ Scheduled regeneration via Vercel Cron
- ✅ Smart caching to minimize API calls
- ✅ Comprehensive error handling and 404 support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Webflow CMS                             │
│  (Experts, Cities, States, Skills Collections)              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ API Fetch (Vercel Cron - Daily at 2 AM)
                  ↓
┌─────────────────────────────────────────────────────────────┐
│              Vercel Serverless Functions                    │
│  - Generate all route combinations                          │
│  - Create route manifest JSON                               │
│  - Generate sitemap.xml                                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Serve manifest & sitemap
                  ↓
┌─────────────────────────────────────────────────────────────┐
│         Webflow Template Page + Wized                       │
│  - Client router loads manifest                             │
│  - Extracts params from URL (city, state, skill)            │
│  - Wized filters experts by params                          │
│  - Dynamic content rendering                                │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
webflow-experts-router/
├── api/                           # Vercel serverless functions
│   ├── generate-routes.js         # Main route generator (cron target)
│   ├── route-manifest.js          # Serves route manifest JSON
│   └── sitemap.xml.js             # Serves sitemap XML
├── lib/                           # Shared modules
│   ├── webflow-api.js             # Webflow CMS API client
│   ├── route-generator.js         # Route combination logic
│   └── sitemap-generator.js       # Sitemap XML builder
├── client/                        # Client-side scripts
│   ├── wized-experts-router.js    # Router script for Webflow
│   └── WIZED_INTEGRATION.md       # Wized setup guide
├── .env                           # Environment variables
├── .env.example                   # Environment template
├── vercel.json                    # Vercel configuration + cron
├── test-local.js                  # Local testing script
└── package.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd /Users/kylekarnes/webflow-experts-router
npm install
```

### 2. Configure Environment Variables

Your `.env` file has been created with your Webflow API token. You need to add:

1. **Webflow Site ID**: Find in Webflow Site Settings → General
2. **Collection IDs**: Find in Webflow CMS → Each collection's settings

To get Collection IDs:
- Go to your Webflow project → CMS
- Click on a collection (e.g., "Experts")
- Copy the collection ID from the URL: `https://webflow.com/dashboard/sites/{siteId}/collections/{collectionId}`

Update these values in `.env`:

```bash
WEBFLOW_SITE_ID=your_site_id_here
WEBFLOW_EXPERTS_COLLECTION_ID=your_experts_collection_id
WEBFLOW_CITIES_COLLECTION_ID=your_cities_collection_id
WEBFLOW_STATES_COLLECTION_ID=your_states_collection_id
WEBFLOW_SKILLS_COLLECTION_ID=your_skills_collection_id
SITE_BASE_URL=https://yourdomain.com
```

### 3. Test Locally

Before deploying, test the route generation:

```bash
npm test
```

This will:
- Connect to Webflow API
- Fetch all CMS collections
- Generate routes and manifest
- Create sitemap.xml
- Save output files to `output/` directory

Review the generated files to ensure everything looks correct.

### 4. Deploy to Vercel

First-time deployment:

```bash
# Install Vercel CLI if you haven't
npm install -g vercel

# Deploy (follow prompts to link project)
vercel

# Deploy to production
vercel --prod
```

After deployment, Vercel will provide URLs like:
- Main: `https://webflow-experts-router.vercel.app`
- Generate Routes: `https://webflow-experts-router.vercel.app/api/generate-routes`
- Route Manifest: `https://webflow-experts-router.vercel.app/api/route-manifest`
- Sitemap: `https://webflow-experts-router.vercel.app/api/sitemap.xml`

### 5. Set Environment Variables in Vercel

In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add all variables from your `.env` file
3. Click "Redeploy" to apply changes

### 6. Set Up Webflow Template Page

1. **Create Template Page** in Webflow:
   - Page name: `Experts Template` (or similar)
   - URL: `/experts/template` or any URL (it won't be used directly)

2. **Design the Template**:
   - Add heading for title (e.g., "Find {Skill} Experts in {Location}")
   - Add a collection list for experts
   - Add any other content (filters, map, etc.)

3. **Add Router Script** to Page Settings → Custom Code → Before `</body>`:

```html
<script src="https://webflow-experts-router.vercel.app/client/wized-experts-router.js"></script>
```

Or copy the entire contents of `client/wized-experts-router.js` directly.

### 7. Configure Wized

Follow the detailed guide in `client/WIZED_INTEGRATION.md` to:
- Set up Wized variables from route params
- Filter experts collection by skill and location
- Dynamically update page content
- Handle empty results

**Quick Start for Wized:**

Create these Wized variables:

```javascript
// v.routeType
return window.ExpertsRouteParams?.type;

// v.skillId
return window.ExpertsRouteParams?.skillId;

// v.stateId
return window.ExpertsRouteParams?.stateId;

// v.cityId
return window.ExpertsRouteParams?.cityId;

// v.pageTitle
const p = window.ExpertsRouteParams;
if (!p) return 'Find Experts';
const location = p.type === 'city' ? `${p.cityName}, ${p.stateName}` : p.stateName;
return `${p.skillName} Experts in ${location}`;
```

Then use these variables to filter your Experts request and display content.

### 8. Set Up Webflow Hosting Redirects

In Webflow's hosting settings, set up a redirect:

**From**: `/experts/*`
**To**: `/experts/template`
**Status**: 200 (rewrite)

This ensures all `/experts/{anything}` URLs load your template page while keeping the original URL.

> **Note**: Webflow's redirect capabilities may be limited. If you can't set up rewrites, consider using Cloudflare Workers or Vercel Edge Functions as a proxy.

## How It Works

### Route Generation Flow

1. **Cron Trigger**: Every day at 2 AM UTC, Vercel runs `/api/generate-routes`
2. **CMS Fetch**: Script fetches all Experts, Cities, States, and Skills from Webflow
3. **Combination Logic**: Generates all valid combinations:
   - State × Skill → State-level routes
   - (City → State) × Skill → City-level routes
4. **Manifest Creation**: Creates a JSON lookup map of all routes with metadata
5. **Sitemap Generation**: Creates SEO-friendly sitemap.xml
6. **Caching**: Results cached for 24 hours (configurable)

### Client-Side Routing

1. **Page Load**: User visits `/experts/texas/dallas/dentistry`
2. **Webflow Redirect**: Webflow redirects to template page (200 rewrite)
3. **Router Init**: Client script parses URL and extracts params
4. **Manifest Check**: Validates route exists in manifest
5. **Wized Variables**: Sets global variables for Wized
6. **Content Filter**: Wized filters experts by skill + location
7. **Dynamic Render**: Page shows filtered results with correct location text

## API Endpoints

### `GET /api/generate-routes`

Manually trigger route generation.

**Query Parameters:**
- `force=true` - Force regeneration (ignore cache)

**Response:**
```json
{
  "success": true,
  "generated": "2025-01-15T02:00:00.000Z",
  "stats": {
    "total": 1250,
    "stateLevel": 250,
    "cityLevel": 1000,
    "states": 50,
    "cities": 20,
    "skills": 5
  },
  "manifestUrl": "/api/route-manifest",
  "sitemapUrl": "/api/sitemap.xml"
}
```

### `GET /api/route-manifest`

Returns the route manifest for client-side router.

**Response:**
```json
{
  "routes": {
    "/experts/texas/dentistry": {
      "state": "texas",
      "skill": "dentistry",
      "stateId": "...",
      "skillId": "...",
      "stateName": "Texas",
      "skillName": "Dentistry"
    }
  },
  "generated": "2025-01-15T02:00:00.000Z",
  "count": 1250
}
```

### `GET /api/sitemap.xml`

Returns XML sitemap for SEO.

## Customization

### Adjusting Cron Schedule

Edit `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/generate-routes",
    "schedule": "0 */6 * * *"  // Every 6 hours
  }]
}
```

[Cron syntax guide](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

### Changing URL Structure

Edit `lib/route-generator.js`:

```javascript
// Current: /experts/{state}/{skill}
// Change to: /find/{state}/{skill}

routes.push({
  path: `/find/${stateSlug}/${skillSlug}`,
  // ...
});
```

### Custom Slug Fields

If your CMS uses different field names, update `RouteGenerator.getSlugFromItem()` in `lib/route-generator.js`.

### Adding More Filters

To add more route parameters (e.g., specialization):

1. Fetch additional collection in `lib/webflow-api.js`
2. Add to combination logic in `lib/route-generator.js`
3. Update client router pattern matching
4. Add Wized variables for new params

## Troubleshooting

### Routes Not Generating

**Check environment variables:**
```bash
node test-local.js
```

**Common issues:**
- Missing or incorrect Collection IDs
- Invalid API token
- Collection field structure doesn't match expectations

### Router Not Working in Browser

**Check browser console for:**
- Script loading errors
- `ExpertsRouteParams` is undefined
- API manifest request failing

**Fixes:**
- Ensure script loads before Wized
- Check Vercel deployment URL in script src
- Verify CORS headers (should be open)

### Experts Not Filtering

**Check Wized:**
- Variables are correctly reading `window.ExpertsRouteParams`
- Request filters use correct collection field names
- Field types match (Reference ID vs Text slug)

**Debug:**
```javascript
// In browser console
console.log(window.ExpertsRouteParams);
console.log(sessionStorage.getItem('expertsRouteParams'));
```

### 404 Errors

- Check Webflow redirect is set up (200 rewrite, not 301/302)
- Verify template page exists and is published
- Check route exists in manifest: `/api/route-manifest`

### Sitemap Not Updating

- Check cron job ran: Vercel Dashboard → Deployments → Cron Jobs
- Manually trigger: Visit `/api/generate-routes?force=true`
- Check browser cache (sitemap cached for 24h)

## Maintenance

### When Adding New Skills/Locations

Routes auto-regenerate daily at 2 AM. To force immediate update:

```bash
curl https://webflow-experts-router.vercel.app/api/generate-routes?force=true
```

Or visit the URL in your browser.

### Updating the Template Design

Edit the Webflow template page visually - no code changes needed. The router script and Wized filters remain the same.

### Monitoring

Check Vercel Dashboard for:
- Function invocations
- Error rates
- Cron job execution logs

## Performance Notes

- **Route generation**: ~5-10 seconds for 1000+ routes
- **Manifest size**: ~100-500 KB (cached, gzipped)
- **Client router**: <5ms to parse and validate
- **Caching**: Manifest and sitemap cached for 24 hours

## SEO Considerations

1. **Sitemap**: Submit to Google Search Console
2. **Pre-rendering**: Consider using Vercel's pre-rendering for better crawling
3. **Meta Tags**: Router updates title and meta description dynamically
4. **Canonical URLs**: Add canonical link tags to template page

## Security

- API token stored in environment variables (never committed)
- CORS open by default (restrict in production if needed)
- No authentication on endpoints (add if exposing sensitive data)
- Rate limiting handled by Vercel (no additional config needed)

## Support & Resources

- [Webflow API Documentation](https://developers.webflow.com/)
- [Wized Documentation](https://docs.wized.com/)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- Client integration guide: `client/WIZED_INTEGRATION.md`

## License

ISC

---

## Quick Reference

### Local Commands
```bash
npm install          # Install dependencies
npm test             # Test route generation locally
npm run deploy       # Deploy to Vercel
```

### Important Files
- `.env` - Configuration (keep secure!)
- `vercel.json` - Cron schedule and routing
- `client/wized-experts-router.js` - Add to Webflow
- `output/` - Generated files (local testing only)

### Need Help?

Check the generated files in `output/` after running `npm test` to see:
- All generated routes
- Route manifest structure
- Sitemap XML output
