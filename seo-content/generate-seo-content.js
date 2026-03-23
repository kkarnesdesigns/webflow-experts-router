#!/usr/bin/env node

/**
 * SEO Content Generator
 *
 * Fetches route manifest, generates SEO content via Claude API,
 * validates with QA checks, and outputs CSV for Webflow import.
 *
 * Usage:
 *   node seo-content/generate-seo-content.js [options]
 *
 * Options:
 *   --route-type <type>    Only generate for specific route type(s), comma-separated
 *                           Values: state, city, state-certification, city-certification
 *   --state <slug>         Only generate for a specific state slug
 *   --limit <n>            Limit total items generated (for testing)
 *   --dry-run              Show what would be generated without calling Claude API
 *   --output <path>        Output CSV file path (default: seo-content/seo-landing-content.csv)
 *   --concurrency <n>      Number of concurrent API calls (default: 5)
 *   --manifest-url <url>   Route manifest URL (default: https://seo.joingyde.com/api/route-manifest)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildPrompt, generateFingerprint, PROMPT_VERSION } = require('./prompts');
const { validateContent, parseResponse } = require('./qa');

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    routeTypes: null,
    state: null,
    limit: null,
    dryRun: false,
    output: path.join(__dirname, 'seo-landing-content.csv'),
    concurrency: 5,
    manifestUrl: 'https://seo.joingyde.com/api/route-manifest',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--route-type':
        opts.routeTypes = args[++i].split(',');
        break;
      case '--state':
        opts.state = args[++i];
        break;
      case '--limit':
        opts.limit = parseInt(args[++i]);
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--concurrency':
        opts.concurrency = parseInt(args[++i]);
        break;
      case '--manifest-url':
        opts.manifestUrl = args[++i];
        break;
    }
  }

  return opts;
}

/**
 * Fetch route manifest from the API
 */
async function fetchManifest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Filter manifest routes to only the 4 target types that need SEO content
 */
function filterTargetRoutes(manifest, opts) {
  const targetTypes = opts.routeTypes || ['state', 'city', 'state-certification', 'city-certification'];
  const routes = [];

  for (const [routePath, routeData] of Object.entries(manifest.routes)) {
    if (!targetTypes.includes(routeData.type)) continue;
    if (opts.state && routeData.state !== opts.state) continue;

    routes.push({
      path: routePath,
      ...routeData
    });
  }

  if (opts.limit) {
    return routes.slice(0, opts.limit);
  }

  return routes;
}

/**
 * Call Claude API to generate SEO content for a single route
 */
async function generateContent(route, apiKey) {
  const params = {
    skillName: route.skillName || null,
    certificationName: route.certificationName || null,
    stateName: route.stateName || null,
    cityName: route.cityName || null,
    routeType: route.type,
    expertCount: route.expertCount
  };

  const prompt = buildPrompt(params);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '';
  return text;
}

/**
 * Process a batch of routes concurrently
 */
async function processBatch(routes, apiKey, concurrency) {
  const results = [];
  let completed = 0;
  const total = routes.length;

  for (let i = 0; i < routes.length; i += concurrency) {
    const batch = routes.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (route) => {
        const params = {
          skillName: route.skillName || null,
          certificationName: route.certificationName || null,
          stateName: route.stateName || null,
          cityName: route.cityName || null,
          routeType: route.type,
          expertCount: route.expertCount
        };

        try {
          const responseText = await generateContent(route, apiKey);
          const { data, error } = parseResponse(responseText);

          if (error) {
            return {
              route,
              status: 'failed_api',
              error: error,
              content: null
            };
          }

          const qa = validateContent(data, params);

          return {
            route,
            status: qa.valid ? 'success' : 'failed_qa',
            content: data,
            qa
          };
        } catch (err) {
          return {
            route,
            status: 'failed_api',
            error: err.message,
            content: null
          };
        }
      })
    );

    for (const result of batchResults) {
      completed++;
      const value = result.status === 'fulfilled' ? result.value : {
        route: batch[results.length % batch.length],
        status: 'failed_api',
        error: result.reason?.message || 'Unknown error',
        content: null
      };
      results.push(value);

      const statusIcon = value.status === 'success' ? '+' : value.status === 'failed_qa' ? '~' : 'X';
      const entityName = value.route.skillName || value.route.certificationName;
      const location = [value.route.cityName, value.route.stateName].filter(Boolean).join(', ');
      process.stdout.write(`\r[${completed}/${total}] ${statusIcon} ${entityName} - ${location}`.padEnd(80));
    }

    // Rate limit: small delay between batches
    if (i + concurrency < routes.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(); // newline after progress
  return results;
}

/**
 * Escape a CSV field value
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Always quote fields that contain commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Build a CSV row from a generation result
 */
function buildCsvRow(result) {
  const route = result.route;
  const content = result.content || {};
  const fingerprint = generateFingerprint({
    skillName: route.skillName,
    certificationName: route.certificationName,
    stateName: route.stateName,
    cityName: route.cityName,
    routeType: route.type
  });

  // Build the name field
  const entityName = route.skillName || route.certificationName;
  const locationParts = [route.cityName, route.stateName].filter(Boolean);
  const name = `${entityName} - ${locationParts.join(', ')}`;

  // Map route type to CMS option values
  const routeTypeMap = {
    'state': 'skill-state',
    'city': 'skill-city',
    'state-certification': 'cert-state',
    'city-certification': 'cert-city'
  };

  // Get slugs for reference fields
  const skillSlug = route.skill || '';
  const certSlug = route.certification || '';
  const stateSlug = route.state || '';
  const citySlug = route.city || '';

  // QA notes
  const notes = [];
  if (result.qa?.warnings?.length > 0) {
    notes.push(...result.qa.warnings);
  }
  if (result.qa?.errors?.length > 0) {
    notes.push(...result.qa.errors);
  }
  if (result.error) {
    notes.push(result.error);
  }

  return [
    name,
    skillSlug,
    certSlug,
    stateSlug,
    citySlug,
    routeTypeMap[route.type] || route.type,
    content.meta_title || '',
    content.meta_description || '',
    content.h1 || '',
    content.hero_subhead || '',
    content.seo_body || '',
    fingerprint,
    PROMPT_VERSION,
    new Date().toISOString(),
    'false', // ai_lock
    notes.join('; '),
    result.status
  ].map(csvEscape).join(',');
}

/**
 * Write results to CSV file
 */
function writeCsv(results, outputPath) {
  const headers = [
    'name',
    'skill-ref',
    'certification-ref',
    'state-ref',
    'city-ref',
    'route-type',
    'meta-title',
    'meta-description',
    'h1',
    'hero-subhead',
    'seo-body',
    'ai-fingerprint',
    'ai-version',
    'last-ai-refresh',
    'ai-lock',
    'ai-notes',
    'generation-status'
  ].join(',');

  const rows = results.map(buildCsvRow);
  const csv = [headers, ...rows].join('\n');

  fs.writeFileSync(outputPath, csv, 'utf8');
  return csv;
}

/**
 * Main entry point
 */
async function main() {
  const opts = parseArgs();

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY not set in .env');
    console.error('Add ANTHROPIC_API_KEY=sk-ant-... to your .env file');
    process.exit(1);
  }

  console.log('SEO Content Generator');
  console.log('=====================');
  console.log(`Prompt version: ${PROMPT_VERSION}`);
  console.log(`Manifest URL: ${opts.manifestUrl}`);
  console.log(`Output: ${opts.output}`);
  console.log(`Concurrency: ${opts.concurrency}`);
  if (opts.routeTypes) console.log(`Route types: ${opts.routeTypes.join(', ')}`);
  if (opts.state) console.log(`State filter: ${opts.state}`);
  if (opts.limit) console.log(`Limit: ${opts.limit}`);
  if (opts.dryRun) console.log('DRY RUN - no API calls will be made');
  console.log();

  // Fetch manifest
  console.log('Fetching route manifest...');
  const manifest = await fetchManifest(opts.manifestUrl);
  console.log(`Manifest has ${manifest.count} total routes`);

  // Filter to target routes
  const targetRoutes = filterTargetRoutes(manifest, opts);
  console.log(`Target routes to generate: ${targetRoutes.length}`);

  // Count by type
  const typeCounts = {};
  for (const route of targetRoutes) {
    typeCounts[route.type] = (typeCounts[route.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  - ${type}: ${count}`);
  }
  console.log();

  if (opts.dryRun) {
    console.log('Dry run complete. First 5 routes:');
    for (const route of targetRoutes.slice(0, 5)) {
      const entity = route.skillName || route.certificationName;
      const location = [route.cityName, route.stateName].filter(Boolean).join(', ');
      console.log(`  ${route.type}: ${entity} in ${location} (${route.expertCount} experts)`);
    }
    return;
  }

  // Generate content
  console.log('Generating SEO content...');
  const startTime = Date.now();
  const results = await processBatch(targetRoutes, apiKey, opts.concurrency);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  const successCount = results.filter(r => r.status === 'success').length;
  const qaFailCount = results.filter(r => r.status === 'failed_qa').length;
  const apiFailCount = results.filter(r => r.status === 'failed_api').length;

  console.log();
  console.log('Generation Summary');
  console.log('==================');
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed QA: ${qaFailCount}`);
  console.log(`Failed API: ${apiFailCount}`);
  console.log(`Time: ${elapsed}s`);
  console.log();

  // Write CSV (include all results, even failed ones, for tracking)
  writeCsv(results, opts.output);
  console.log(`CSV written to: ${opts.output}`);

  // Write a separate failures log if any
  const failures = results.filter(r => r.status !== 'success');
  if (failures.length > 0) {
    const failuresPath = opts.output.replace('.csv', '-failures.json');
    fs.writeFileSync(failuresPath, JSON.stringify(failures.map(f => ({
      path: f.route.path,
      type: f.route.type,
      status: f.status,
      error: f.error || null,
      qa: f.qa || null
    })), null, 2), 'utf8');
    console.log(`Failures log: ${failuresPath}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
