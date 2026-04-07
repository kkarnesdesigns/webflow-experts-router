/**
 * Google Search Console client.
 *
 * Auth: service account JSON placed in the GSC_SERVICE_ACCOUNT_JSON env var
 *       (the full JSON blob you download from GCP). The service account
 *       email must be added as a user on the Search Console property.
 *
 * Site: GSC_SITE_URL env var, either a URL-prefix property
 *       (e.g. "https://joingyde.com/") or a domain property
 *       (e.g. "sc-domain:joingyde.com").
 *
 * This module talks to the Search Console REST API directly with a
 * hand-signed service-account JWT so we don't need the `googleapis` package.
 */

const crypto = require('crypto');

let cachedToken = null;
let cachedTokenExp = 0;

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function loadServiceAccount() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_JSON not set');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Also accept base64-encoded JSON in case the platform strips quotes.
    try {
      parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (_) {
      throw new Error('GSC_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON missing client_email or private_key');
  }
  // Some env stores escape newlines in the private key as literal "\n"
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExp - 60 > now) return cachedToken;

  const sa = loadServiceAccount();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const toSign = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${toSign}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' +
      encodeURIComponent(assertion),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `GSC token exchange failed: ${json.error_description || json.error || res.status}`
    );
  }
  cachedToken = json.access_token;
  cachedTokenExp = now + (json.expires_in || 3600);
  return cachedToken;
}

function getSiteUrl() {
  const site = process.env.GSC_SITE_URL;
  if (!site) throw new Error('GSC_SITE_URL not set');
  return site;
}

/**
 * Query Search Console for page-level performance.
 *
 * @param {object} opts
 * @param {number} opts.days         Look-back window in days (default 28)
 * @param {number} opts.rowLimit     Max rows returned (default 1000, max 25000)
 * @param {string[]} opts.dimensions Default ['page']
 * @param {object[]} opts.filters    Optional dimensionFilterGroups
 */
async function queryAnalytics({ days = 28, rowLimit = 1000, dimensions = ['page'], filters } = {}) {
  const token = await getAccessToken();
  const siteUrl = getSiteUrl();

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const body = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    dimensions,
    rowLimit: Math.min(rowLimit, 25000),
    dataState: 'final',
  };
  if (filters) body.dimensionFilterGroups = filters;

  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl
  )}/searchAnalytics/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `GSC query failed (${res.status})`);
  }
  return {
    siteUrl,
    startDate: body.startDate,
    endDate: body.endDate,
    rows: json.rows || [],
  };
}

function isConfigured() {
  return !!(process.env.GSC_SERVICE_ACCOUNT_JSON && process.env.GSC_SITE_URL);
}

module.exports = { queryAnalytics, isConfigured, getSiteUrl };
