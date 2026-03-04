# Markdown Server

A lightweight, web-based markdown editor with live preview. Create, edit, and manage markdown files through an intuitive browser interface.

## Features

- **Live Preview**: See your markdown rendered in real-time as you type
- **Syntax Highlighting**: Code blocks are highlighted using highlight.js
- **File Management**: Create, edit, and delete markdown files
- **Auto-save**: Save your work with Ctrl/Cmd+S
- **Clean Interface**: Split-pane editor with sidebar file browser

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The editor will be available at `http://localhost:3000`

## Development

```bash
# Run with auto-reload on file changes
npm run dev
```

## Configuration

Configure the server using environment variables:

- `PORT` - Server port (default: 3000)
- `DOCS_DIR` - Directory for storing markdown files (default: `./docs`)

Example:
```bash
PORT=8080 DOCS_DIR=/path/to/my/docs npm start
```

## Technology Stack

- **Backend**: Node.js + Express
- **Editor**: CodeMirror 5
- **Markdown Parser**: marked.js
- **Syntax Highlighting**: highlight.js
- **Security**: Custom filename sanitization middleware

## API Endpoints

- `GET /api/files` - List all markdown files
- `GET /api/files/:filename` - Read a specific file
- `POST /api/files` - Create a new file
- `PUT /api/files/:filename` - Update a file
- `DELETE /api/files/:filename` - Delete a file

## Security

All filenames are validated and sanitized to prevent path traversal attacks. Only markdown files (`.md` extension) within the configured `DOCS_DIR` can be accessed.

## License

Apache-2.0
