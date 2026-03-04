const express = require('express');
const fs = require('fs/promises');
const config = require('../config');
const { sanitizeFilename } = require('../middleware/sanitize');

const router = express.Router();

// Validate :filename param on all routes that use it
router.param('filename', (req, res, next, filename) => {
  const result = sanitizeFilename(filename);
  if (!result) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  req.sanitizedFile = result;
  next();
});

// GET /api/files - List all markdown files
router.get('/', async (req, res) => {
  try {
    const entries = await fs.readdir(config.docsDir);
    const files = [];

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const stat = await fs.stat(`${config.docsDir}/${entry}`);
      if (stat.isFile()) {
        files.push({
          name: entry,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }

    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /api/files/:filename - Read a file
router.get('/:filename', async (req, res) => {
  try {
    const { filename, fullPath } = req.sanitizedFile;
    const content = await fs.readFile(fullPath, 'utf-8');
    const stat = await fs.stat(fullPath);
    res.json({ name: filename, content, modified: stat.mtime.toISOString() });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// POST /api/files - Create a new file
router.post('/', async (req, res) => {
  try {
    const { name, content } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const result = sanitizeFilename(name);
    if (!result) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check if file already exists
    try {
      await fs.access(result.fullPath);
      return res.status(409).json({ error: 'File already exists' });
    } catch {
      // File does not exist, proceed
    }

    await fs.writeFile(result.fullPath, content || '', 'utf-8');
    const stat = await fs.stat(result.fullPath);
    res.status(201).json({
      name: result.filename,
      content: content || '',
      modified: stat.mtime.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create file' });
  }
});

// PUT /api/files/:filename - Update a file
router.put('/:filename', async (req, res) => {
  try {
    const { filename, fullPath } = req.sanitizedFile;
    const { content } = req.body;

    // Verify file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    await fs.writeFile(fullPath, content ?? '', 'utf-8');
    const stat = await fs.stat(fullPath);
    res.json({ name: filename, content: content ?? '', modified: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// DELETE /api/files/:filename - Delete a file
router.delete('/:filename', async (req, res) => {
  try {
    const { fullPath } = req.sanitizedFile;

    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    await fs.unlink(fullPath);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
