const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/files', apiRoutes);

async function start() {
  await fs.mkdir(config.docsDir, { recursive: true });

  app.listen(config.port, () => {
    console.log(`Markdown Editor running at http://localhost:${config.port}`);
    console.log(`Serving files from: ${config.docsDir}`);
  });
}

start().catch(console.error);
