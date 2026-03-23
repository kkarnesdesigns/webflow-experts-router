/**
 * SEO Content Generation - Prompt Templates & Angle Selection
 */

const crypto = require('crypto');

// Prompt version - bump this when changing prompts to trigger re-generation
const PROMPT_VERSION = 'v1.0';

// Banned phrases that make content feel generic/AI-generated
const BANNED_PHRASES = [
  'in today\'s fast-paced',
  'in today\'s digital',
  'in today\'s world',
  'look no further',
  'are you looking for',
  'whether you\'re',
  'in conclusion',
  'without further ado',
  'it\'s no secret',
  'at the end of the day',
  'game-changer',
  'game changer',
  'unlock your',
  'unlock the power',
  'take your .* to the next level',
  'elevate your',
  'dive into',
  'dive deeper',
  'navigating the',
  'landscape of',
  'ever-evolving',
  'ever-changing',
  'cutting-edge',
  'world-class',
  'top-notch',
  'best-in-class',
  'second to none',
  'bustling city',
  'thriving city',
  'vibrant city',
  'dynamic city',
  'bustling metropolis',
];

// Content angles to rotate through deterministically
const ANGLES = [
  {
    id: 'problem-solution',
    label: 'Problem → Solution',
    instruction: 'Open with a specific challenge businesses face with this skill/certification in this location, then position Gyde experts as the solution.'
  },
  {
    id: 'local-expertise',
    label: 'Local Expertise Value',
    instruction: 'Emphasize the value of working with experts who understand the local market and business environment. Focus on proximity, timezone alignment, and regional knowledge.'
  },
  {
    id: 'roi-focused',
    label: 'ROI & Business Impact',
    instruction: 'Focus on the business outcomes and ROI of hiring qualified experts. Use concrete benefit statements about time saved, revenue impact, or risk reduction.'
  },
  {
    id: 'skill-depth',
    label: 'Skill Deep-Dive',
    instruction: 'Lead with what makes this particular skill/certification valuable and how it applies to real business needs. Show depth of expertise available through Gyde.'
  },
  {
    id: 'hiring-guide',
    label: 'Hiring Guidance',
    instruction: 'Frame the content as practical guidance for finding and evaluating experts. Include what to look for when hiring for this skill/certification.'
  },
  {
    id: 'industry-context',
    label: 'Industry Context',
    instruction: 'Connect this skill/certification to broader industry trends and demand. Explain why businesses are increasingly seeking this expertise.'
  },
];

/**
 * Deterministically select a content angle based on route inputs.
 * Uses a hash of the inputs to pick consistently but vary across pages.
 */
function selectAngle(skillOrCertName, stateName, cityName) {
  const input = `${skillOrCertName}|${stateName || ''}|${cityName || ''}|${PROMPT_VERSION}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const index = parseInt(hash.substring(0, 8), 16) % ANGLES.length;
  return ANGLES[index];
}

/**
 * Generate a fingerprint for a route's content inputs.
 * Used to detect when regeneration is needed.
 */
function generateFingerprint(params) {
  const input = [
    params.skillName || params.certificationName || '',
    params.stateName || '',
    params.cityName || '',
    params.routeType || '',
    PROMPT_VERSION
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Build the Claude API prompt for generating SEO content.
 */
function buildPrompt(params) {
  const {
    skillName,
    certificationName,
    stateName,
    cityName,
    routeType,
    expertCount
  } = params;

  const entityName = skillName || certificationName;
  const entityType = skillName ? 'skill' : 'certification';
  const locationParts = [cityName, stateName].filter(Boolean);
  const locationStr = locationParts.join(', ');
  const angle = selectAngle(entityName, stateName, cityName);

  const prompt = `You are writing SEO landing page content for Gyde (joingyde.com), a platform that connects businesses with vetted freelance experts.

PAGE CONTEXT:
- ${entityType === 'skill' ? 'Skill' : 'Certification'}: ${entityName}
- Location: ${locationStr || 'National (no location filter)'}
- Route type: ${routeType}
- Approximate expert count: ${expertCount || 'several'}

CONTENT ANGLE: ${angle.label}
${angle.instruction}

Generate the following fields as a JSON object. Be specific to this exact ${entityType} and location combination. Never use generic filler that could apply to any page.

REQUIREMENTS:
1. "meta_title": Max 70 characters. Format: "${entityName} ${entityType === 'certification' ? 'Certified ' : ''}Experts${locationStr ? ' in ' + locationStr : ''} | Gyde" — but make it compelling, not just templated. Must include the ${entityType} name and location.
2. "meta_description": Max 160 characters. A compelling reason to click. Must mention ${entityName} and ${locationStr || 'Gyde'}.
3. "h1": The main page heading. Natural, not keyword-stuffed. Include ${entityType} and location naturally.
4. "hero_subhead": 1-2 sentences below the H1. Expand on the value proposition.
5. "seo_body": HTML-formatted rich text (200-350 words). Use <p> tags for paragraphs and <ul><li> for bullet lists. Include 2-3 paragraphs and at least one bullet list. Content must be specific to ${entityName}${locationStr ? ' in ' + locationStr : ''}.

RULES:
- Do NOT start with "Are you looking for" or "In today's..." or any cliche opener.
- Do NOT use filler phrases like "look no further", "game-changer", "cutting-edge", "world-class", "elevate your", "unlock the power".
- Do NOT describe the city/state with generic adjectives like "bustling", "thriving", "vibrant", "dynamic".
- Write in a professional but approachable tone.
- The brand name is "Gyde" (not Guide).
- Focus on the specific expertise (${entityName}) and why it matters in this context.
- The bullet list should highlight concrete benefits or what experts can help with.
- Every piece of content must feel unique to this specific page — avoid templates.

Respond ONLY with a valid JSON object, no markdown fencing:`;

  return prompt;
}

module.exports = {
  PROMPT_VERSION,
  BANNED_PHRASES,
  ANGLES,
  selectAngle,
  generateFingerprint,
  buildPrompt
};
