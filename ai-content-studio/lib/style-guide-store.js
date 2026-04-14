/**
 * Style guide persistence.
 *
 * Primary store: an in-memory cache (module-level) so it survives within a
 * single serverless instance. Secondary store: on writable filesystems,
 * persists to `ai-content-studio/style-guide.md` so local dev and any
 * writable host keep it across restarts.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'style-guide.md');
let cached = null;

function read() {
  if (cached != null) return cached;
  try {
    if (fs.existsSync(FILE)) {
      cached = fs.readFileSync(FILE, 'utf8');
      return cached;
    }
  } catch (_) {}
  cached = '';
  return cached;
}

function write(content) {
  cached = content || '';
  try {
    fs.writeFileSync(FILE, cached, 'utf8');
  } catch (e) {
    // read-only filesystem (e.g. Vercel) - memory cache is the fallback.
  }
  return cached;
}

module.exports = { read, write };
