const path = require('path');
const config = require('../config');

const VALID_FILENAME = /^[a-zA-Z0-9_\-][a-zA-Z0-9_\-. ]*\.md$/;

function sanitizeFilename(name) {
  const basename = path.basename(name);
  const filename = basename.endsWith('.md') ? basename : basename + '.md';

  if (!VALID_FILENAME.test(filename)) {
    return null;
  }

  const fullPath = path.resolve(config.docsDir, filename);
  if (!fullPath.startsWith(config.docsDir + path.sep) && fullPath !== config.docsDir) {
    return null;
  }

  return { filename, fullPath };
}

function validateFilenameParam(req, res, next) {
  if (req.params.filename) {
    const result = sanitizeFilename(req.params.filename);
    if (!result) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    req.sanitizedFile = result;
  }
  next();
}

module.exports = { sanitizeFilename, validateFilenameParam };
