# Cloudflare Worker Setup Guide

This guide explains how to deploy the Cloudflare Worker to intercept `/hire/{state}/{skill}` and `/hire/{state}/{city}/{skill}` routes while leaving other `/hire/*` pages untouched.

## How It Works

The worker:
1. **Intercepts requests** to URLs matching the expert route pattern (`/hire/` with 3 or 4 segments)
2. **Validates** the route against the manifest from your Vercel API
3. **Serves your Webflow template page** while preserving the original URL
4. **Passes through** all other requests (like `/hire/contact`, `/hire/about`, etc.)

## Prerequisites

- Cloudflare account (free tier works)
- Your domain's DNS managed by Cloudflare
- Webflow template page set up

## Step 1: Configure the Worker

Open `cloudflare-worker.js` and update the configuration:

```javascript
const CONFIG = {
  // Your Webflow site URL
  webflowSiteUrl: 'https://www.joingyde.com',

  // The path to your Webflow template page
  templatePagePath: '/hire-template', // Change to your actual template page path

  // Vercel API URL for route manifest
  manifestApiUrl: 'https://webflow-experts-router.vercel.app/api/route-manifest',

  // Cache duration for manifest (in seconds)
  manifestCacheDuration: 3600, // 1 hour
};
```

**Important:** Create a template page in Webflow (e.g., at `/hire-template`) that will be served for all expert routes.

## Step 2: Deploy to Cloudflare

### Option A: Using Cloudflare Dashboard (Easiest)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your website (joingyde.com)
3. Go to **Workers & Pages** → **Create application** → **Create Worker**
4. Name it: `experts-router`
5. Click **Deploy**
6. Click **Edit code**
7. **Delete the default code** and paste the contents of `cloudflare-worker.js`
8. Click **Save and Deploy**

### Option B: Using Wrangler CLI (Advanced)

Install Wrangler:
```bash
npm install -g wrangler
```

Login to Cloudflare:
```bash
wrangler login
```

Create `wrangler.toml` in the project root:
```toml
name = "experts-router"
main = "cloudflare-worker.js"
compatibility_date = "2024-01-01"

[env.production]
workers_dev = false
route = "joingyde.com/hire/*"
zone_id = "YOUR_ZONE_ID" # Find in Cloudflare dashboard
```

Deploy:
```bash
wrangler deploy
```

## Step 3: Configure Worker Route

1. In Cloudflare Dashboard, go to **Workers & Pages**
2. Click on your `experts-router` worker
3. Go to **Settings** → **Triggers**
4. Under **Routes**, click **Add route**
5. Add: `joingyde.com/hire/*`
6. Select your zone: `joingyde.com`
7. Click **Save**

**Important:** The route pattern `joingyde.com/hire/*` will intercept ALL `/hire/*` requests, but the worker code filters to only handle expert routes (3-4 segments).

## Step 4: Test the Worker

### Test Valid Expert Routes

Open these URLs in your browser:
- `https://www.joingyde.com/hire/texas/dentistry`
- `https://www.joingyde.com/hire/texas/dallas/dentistry`

**Expected behavior:**
- Page loads successfully
- URL stays as-is (doesn't change)
- Your template page content is displayed
- Check DevTools → Network → Response Headers for `X-Experts-Router: cloudflare-worker`

### Test Other /hire/ Pages

Open your other `/hire/` pages:
- `https://www.joingyde.com/hire/contact`
- `https://www.joingyde.com/hire/about`

**Expected behavior:**
- These pages load normally
- NOT intercepted by the worker
- No `X-Experts-Router` header

### Debugging

Check worker logs in Cloudflare Dashboard:
1. Go to **Workers & Pages** → **experts-router**
2. Click **Logs** tab
3. You'll see requests, route matches, and any errors

## How the Worker Decides What to Intercept

```
Request: /hire/contact
├─ Check pattern: /hire/ + 1 segment = NO MATCH
└─ Pass through to Webflow ✓

Request: /hire/about/team
├─ Check pattern: /hire/ + 2 segments = NO MATCH
└─ Pass through to Webflow ✓

Request: /hire/texas/dentistry
├─ Check pattern: /hire/ + 2 segments = MATCH (3 total)
├─ Validate against manifest: EXISTS ✓
└─ Serve template page ✓

Request: /hire/texas/fake-skill
├─ Check pattern: /hire/ + 2 segments = MATCH (3 total)
├─ Validate against manifest: NOT FOUND ✗
└─ Pass through (will 404) ✓

Request: /hire/texas/dallas/dentistry
├─ Check pattern: /hire/ + 3 segments = MATCH (4 total)
├─ Validate against manifest: EXISTS ✓
└─ Serve template page ✓
```

## Caching

The worker caches the route manifest for 1 hour by default. This means:
- Fast validation (no API call on every request)
- Updates when manifest changes (within 1 hour)

To change cache duration, update `manifestCacheDuration` in the config.

## Troubleshooting

### Worker not intercepting routes
- Check the route is configured correctly in Cloudflare
- Verify the route pattern matches: `yourdomain.com/hire/*`
- Check worker logs for errors

### Template page not loading
- Verify `templatePagePath` is correct
- Ensure the template page exists in Webflow and is published
- Check that the page URL is accessible directly

### Other /hire/ pages being intercepted
- The worker should only intercept 3 or 4 segment URLs
- If a page is being intercepted incorrectly, check the `matchesExpertRoutePattern` function
- Review worker logs to see what's being matched

### Manifest not updating
- Wait up to 1 hour for cache to expire
- Or restart the worker in Cloudflare Dashboard
- Or reduce `manifestCacheDuration`

### 404 errors on valid routes
- Check that the manifest API is accessible: `curl https://webflow-experts-router.vercel.app/api/route-manifest`
- Verify routes exist in the manifest
- Check worker logs for manifest fetch errors

## Performance

The worker adds minimal overhead:
- **First request**: ~100-200ms (fetches manifest)
- **Cached requests**: ~10-20ms (in-memory lookup)
- **Template page fetch**: Same as normal Webflow page load

## Maintenance

When you add new routes:
1. Routes are automatically added via your Vercel cron job
2. Worker cache updates within 1 hour
3. No worker code changes needed

## Alternative: Specific State Routes

If you want even more control, you could modify the worker to only intercept specific states:

```javascript
const ALLOWED_STATES = ['texas', 'california', 'new-york'];

function matchesExpertRoutePattern(pathname) {
  const segments = pathname.replace(/\/$/, '').split('/').filter(s => s);

  if (segments[0] !== 'hire') {
    return { isMatch: false };
  }

  // Check if second segment is an allowed state
  if (segments.length >= 3 && ALLOWED_STATES.includes(segments[1])) {
    return { isMatch: true, segments: segments.length };
  }

  return { isMatch: false };
}
```

## Cost

Cloudflare Workers Free Tier includes:
- 100,000 requests/day
- This should be more than enough for most sites
- Paid plans available if needed

## Questions?

Check the main README.md or review worker logs in Cloudflare Dashboard.
