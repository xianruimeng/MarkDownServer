const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  docsDir: path.resolve(process.env.DOCS_DIR || path.join(__dirname, 'docs')),
};
