/**
 * Local Testing Script
 * Run this to test route generation locally before deploying
 *
 * Usage: node test-local.js
 */

require('dotenv').config();
const WebflowAPI = require('./lib/webflow-api');
const RouteGenerator = require('./lib/route-generator');
const SitemapGenerator = require('./lib/sitemap-generator');
const fs = require('fs');
const path = require('path');

async function testRouteGeneration() {
  console.log('🚀 Testing Webflow Experts Router\n');

  // Validate environment variables
  const requiredVars = [
    'WEBFLOW_API_TOKEN',
    'WEBFLOW_EXPERTS_COLLECTION_ID',
    'WEBFLOW_CITIES_COLLECTION_ID',
    'WEBFLOW_STATES_COLLECTION_ID',
    'WEBFLOW_SKILLS_COLLECTION_ID'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease update your .env file with these values.\n');
    process.exit(1);
  }

  try {
    // Initialize Webflow API
    console.log('📡 Connecting to Webflow API...');
    const webflow = new WebflowAPI(process.env.WEBFLOW_API_TOKEN);

    // Fetch CMS data
    console.log('📥 Fetching CMS collections...\n');
    const data = await webflow.fetchAllData({
      expertsCollectionId: process.env.WEBFLOW_EXPERTS_COLLECTION_ID,
      citiesCollectionId: process.env.WEBFLOW_CITIES_COLLECTION_ID,
      statesCollectionId: process.env.WEBFLOW_STATES_COLLECTION_ID,
      skillsCollectionId: process.env.WEBFLOW_SKILLS_COLLECTION_ID
    });

    console.log('✅ CMS Data fetched successfully:');
    console.log(`   - ${data.experts.length} experts`);
    console.log(`   - ${data.cities.length} cities`);
    console.log(`   - ${data.states.length} states`);
    console.log(`   - ${data.skills.length} skills\n`);

    // Show sample data
    if (data.states.length > 0) {
      console.log('📋 Sample State:', data.states[0].fieldData?.name || data.states[0].name);
    }
    if (data.cities.length > 0) {
      console.log('📋 Sample City:', data.cities[0].fieldData?.name || data.cities[0].name);
    }
    if (data.skills.length > 0) {
      console.log('📋 Sample Skill:', data.skills[0].fieldData?.name || data.skills[0].name);
    }
    console.log('');

    // Generate routes
    console.log('🔄 Generating routes...\n');
    const basePath = process.env.EXPERTS_BASE_PATH || '/experts';
    const { allRoutes, stats } = RouteGenerator.generateAllRoutes(data, basePath);

    // Show sample routes
    console.log('📍 Sample Routes:');
    if (allRoutes.length > 0) {
      allRoutes.slice(0, 5).forEach(route => {
        console.log(`   ${route.path} (${route.type})`);
      });
      if (allRoutes.length > 5) {
        console.log(`   ... and ${allRoutes.length - 5} more`);
      }
    }
    console.log('');

    // Create manifest
    console.log('📦 Creating route manifest...');
    const manifest = RouteGenerator.createRouteManifest(allRoutes);
    manifest.stats = stats;

    // Generate sitemap
    console.log('🗺️  Generating sitemap...');
    const baseURL = process.env.SITE_BASE_URL || 'https://yourdomain.com';
    const sitemap = SitemapGenerator.generateSitemap(allRoutes, baseURL);

    // Save output files
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const manifestPath = path.join(outputDir, 'route-manifest.json');
    const sitemapPath = path.join(outputDir, 'sitemap.xml');
    const routesPath = path.join(outputDir, 'all-routes.json');

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(sitemapPath, sitemap);
    fs.writeFileSync(routesPath, JSON.stringify(allRoutes, null, 2));

    console.log('\n✅ Files generated successfully:');
    console.log(`   - ${manifestPath}`);
    console.log(`   - ${sitemapPath}`);
    console.log(`   - ${routesPath}`);

    console.log('\n📊 Final Statistics:');
    console.log(`   - Total routes: ${stats.total}`);
    console.log(`   - State-level routes: ${stats.stateLevel}`);
    console.log(`   - City-level routes: ${stats.cityLevel}`);

    console.log('\n✅ Test completed successfully!\n');
    console.log('Next steps:');
    console.log('1. Review the generated files in the output/ directory');
    console.log('2. Deploy to Vercel: npm run deploy');
    console.log('3. Update the client script URL in Webflow');
    console.log('4. Add the router script to your Webflow template page\n');

  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testRouteGeneration();
