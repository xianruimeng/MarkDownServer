const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { Server } = require('socket.io');
const config = require('./config');
const apiRoutes = require('./routes/api');
const collaborationHandler = require('./services/collaboration');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/files', apiRoutes);

// Initialize collaboration handler
collaborationHandler(io);

async function start() {
  await fs.mkdir(config.docsDir, { recursive: true });

  server.listen(config.port, () => {
    console.log(`Markdown Editor running at http://localhost:${config.port}`);
    console.log(`Serving files from: ${config.docsDir}`);
  });
}

start().catch(console.error);
