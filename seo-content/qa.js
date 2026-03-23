/**
 * SEO Content Generation - QA Validation
 */

const { BANNED_PHRASES } = require('./prompts');

/**
 * Validate generated SEO content against quality rules.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
function validateContent(content, params) {
  const errors = [];
  const warnings = [];

  // Check required fields exist
  const requiredFields = ['meta_title', 'meta_description', 'h1', 'hero_subhead', 'seo_body'];
  for (const field of requiredFields) {
    if (!content[field] || typeof content[field] !== 'string' || content[field].trim().length === 0) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Length checks
  if (content.meta_title.length > 70) {
    errors.push(`meta_title too long: ${content.meta_title.length}/70 chars`);
  }
  if (content.meta_title.length < 20) {
    warnings.push(`meta_title very short: ${content.meta_title.length} chars`);
  }

  if (content.meta_description.length > 160) {
    errors.push(`meta_description too long: ${content.meta_description.length}/160 chars`);
  }
  if (content.meta_description.length < 50) {
    warnings.push(`meta_description very short: ${content.meta_description.length} chars`);
  }

  // seo_body word count
  const bodyText = content.seo_body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(/\s+/).length;
  if (wordCount < 150) {
    warnings.push(`seo_body too short: ${wordCount} words (target: 200-350)`);
  }
  if (wordCount > 500) {
    warnings.push(`seo_body too long: ${wordCount} words (target: 200-350)`);
  }

  // seo_body must contain HTML tags
  if (!content.seo_body.includes('<p>')) {
    errors.push('seo_body missing <p> paragraph tags');
  }
  if (!content.seo_body.includes('<ul>') && !content.seo_body.includes('<li>')) {
    warnings.push('seo_body missing bullet list (<ul><li>)');
  }

  // Check for banned phrases
  const allText = [
    content.meta_title,
    content.meta_description,
    content.h1,
    content.hero_subhead,
    content.seo_body
  ].join(' ').toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    const regex = new RegExp(phrase, 'i');
    if (regex.test(allText)) {
      warnings.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // Check entity name is mentioned
  const entityName = (params.skillName || params.certificationName || '').toLowerCase();
  if (entityName && !allText.includes(entityName.toLowerCase())) {
    errors.push(`Content does not mention the ${params.skillName ? 'skill' : 'certification'} name: "${entityName}"`);
  }

  // Check location is mentioned (if applicable)
  if (params.stateName && !allText.includes(params.stateName.toLowerCase())) {
    warnings.push(`Content does not mention state: "${params.stateName}"`);
  }
  if (params.cityName && !allText.includes(params.cityName.toLowerCase())) {
    warnings.push(`Content does not mention city: "${params.cityName}"`);
  }

  // Check "Gyde" branding
  if (!allText.includes('gyde')) {
    warnings.push('Content does not mention "Gyde" brand name');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Try to parse Claude's response as JSON.
 * Handles common issues like markdown fencing.
 */
function parseResponse(responseText) {
  let text = responseText.trim();

  // Remove markdown code fences if present
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  text = text.trim();

  try {
    return { data: JSON.parse(text), error: null };
  } catch (e) {
    return { data: null, error: `JSON parse error: ${e.message}` };
  }
}

module.exports = {
  validateContent,
  parseResponse
};
