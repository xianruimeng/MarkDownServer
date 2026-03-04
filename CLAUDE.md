# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based markdown editor with live preview. Users can create, edit, and delete markdown files through a browser interface with real-time rendering.

## Development Commands

```bash
# Start the server
npm start

# Start with auto-reload on file changes
npm run dev

# Install dependencies
npm install
```

The server runs on port 3000 by default (configurable via `PORT` environment variable).

## Architecture

### Server-side (Node.js + Express)

**Entry Point**: `server.js`
- Initializes Express app
- Serves static files from `public/`
- Mounts API routes at `/api/files`
- Creates `docs/` directory on startup (location configurable via `DOCS_DIR` env var)

**API Routes**: `routes/api.js`
- `GET /api/files` - List all markdown files
- `GET /api/files/:filename` - Read a specific file
- `POST /api/files` - Create a new file (requires `name` and optional `content` in body)
- `PUT /api/files/:filename` - Update a file (requires `content` in body)
- `DELETE /api/files/:filename` - Delete a file
- All routes use the filename sanitization middleware via `router.param('filename')`

**Security**: `middleware/sanitize.js`
- `sanitizeFilename()` validates filenames against regex `/^[a-zA-Z0-9_\-][a-zA-Z0-9_\-. ]*\.md$/`
- Prevents path traversal by ensuring resolved paths stay within `docsDir`
- Auto-appends `.md` extension if missing
- Returns `{ filename, fullPath }` or `null` if invalid

**Configuration**: `config.js`
- `port`: Server port (default: 3000)
- `docsDir`: Directory for markdown files (default: `./docs`)

### Client-side (Vanilla JS)

**Main App**: `public/js/app.js`
- Self-executing function with strict mode
- Uses CodeMirror 5 for markdown editing
- Uses marked.js for markdown-to-HTML conversion
- Uses highlight.js for syntax highlighting in code blocks
- Implements debounced preview updates (150ms delay)
- Auto-saves on Ctrl/Cmd+S
- Tracks dirty state (shows `*` in title when unsaved)

**State Management**:
- `currentFile`: Currently open file name
- `isDirty`: Whether editor has unsaved changes
- Editor instance stored in `editor` variable

**UI Structure** (`public/index.html`):
- Sidebar with file list and "New file" button
- Main editor area with CodeMirror instance
- Live preview pane rendering HTML from marked.js
- Toolbar with save/delete buttons

## Key Implementation Details

1. **File Operations**: All file paths are sanitized server-side to prevent directory traversal attacks. The client sends filenames, never full paths.

2. **Dirty State Handling**: When switching files, the app prompts the user if there are unsaved changes.

3. **Preview Rendering**: Markdown preview updates are debounced to avoid excessive re-renders. Code blocks are highlighted using highlight.js after marked.js conversion.

4. **File List Sorting**: Files are sorted by modification time (most recent first) in the API response.

5. **External Dependencies**: The app loads CodeMirror, marked.js, and highlight.js from CDNs. No build step required.
