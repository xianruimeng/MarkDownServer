(function () {
  'use strict';

  // --- State ---
  let editor;
  let socket;
  let currentFile = null;
  let currentUser = null;
  let activeUsers = [];
  let isDirty = false;
  let previewTimer;
  let isRemoteChange = false;
  let remoteCursors = new Map(); // Track remote cursor widgets
  let comments = []; // All comments for current file
  let selectedTextRange = null; // For adding comments

  // --- DOM References ---
  const fileList = document.getElementById('file-list');
  const preview = document.getElementById('preview');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const newFileBtn = document.getElementById('new-file-btn');
  const currentFileName = document.getElementById('current-file-name');
  const activeUsersEl = document.getElementById('active-users');
  // Document toolbar
  const docNewBtn = document.getElementById('doc-new-btn');
  const docSaveBtn = document.getElementById('doc-save-btn');
  const docDeleteBtn = document.getElementById('doc-delete-btn');
  const toggleCommentModeBtn = document.getElementById('toggle-comment-mode-btn');

  let commentModeEnabled = true; // Comment mode enabled by default

  // --- Initialize ---
  function init() {
    // Initialize CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
      mode: 'markdown',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
      styleActiveLine: true,
    });

    editor.on('change', (cm, change) => {
      if (isRemoteChange) {
        return;
      }

      setDirty(true);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 150);

      if (socket && currentFile) {
        const content = editor.getValue();
        const cursorPos = editor.getCursor();
        socket.emit('content-change', { filename: currentFile, content, cursorPos });
      }
    });

    editor.on('cursorActivity', () => {
      if (socket && currentFile && !isRemoteChange) {
        const cursorPos = editor.getCursor();
        socket.emit('cursor-move', { filename: currentFile, cursorPos });
      }
    });

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Initialize Socket.io
    socket = io();

    // Socket event listeners
    socket.on('join-success', ({ user, users, content }) => {
      currentUser = user;
      activeUsers = users;
      updateActiveUsers();
      console.log(`Joined as ${user.name} (${user.color})`);

      if (content && !editor.getValue()) {
        isRemoteChange = true;
        editor.setValue(content);
        isRemoteChange = false;
      }
    });

    socket.on('join-error', ({ message }) => {
      alert(`Cannot join file: ${message}`);
    });

    socket.on('user-joined', ({ user, users }) => {
      activeUsers = users;
      updateActiveUsers();
      showNotification(`${user.name} joined`, user.color);
    });

    socket.on('user-left', ({ userId, users }) => {
      const user = activeUsers.find(u => u.id === userId);
      activeUsers = users;
      updateActiveUsers();

      // Remove cursor for user who left
      removeRemoteCursor(userId);

      if (user) {
        showNotification(`${user.name} left`, user.color);
      }
    });

    socket.on('remote-content-change', ({ userId, content }) => {
      const cursorPos = editor.getCursor();
      const scrollInfo = editor.getScrollInfo();

      isRemoteChange = true;
      editor.setValue(content);
      editor.setCursor(cursorPos);
      editor.scrollTo(scrollInfo.left, scrollInfo.top);
      isRemoteChange = false;

      updatePreview();
      setDirty(true);
    });

    // Handle remote cursor movements
    socket.on('remote-cursor-move', ({ userId, userName, userColor, cursorPos }) => {
      updateRemoteCursor(userId, userName, userColor, cursorPos);
    });

    // Event listeners
    saveBtn.addEventListener('click', saveFile);
    deleteBtn.addEventListener('click', deleteFile);
    newFileBtn.addEventListener('click', createNewFile);

    // Document toolbar listeners
    docNewBtn.addEventListener('click', createNewFile);
    docSaveBtn.addEventListener('click', saveFile);
    docDeleteBtn.addEventListener('click', deleteFile);
    toggleCommentModeBtn.addEventListener('click', toggleCommentMode);

    // Ctrl/Cmd+S to save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentFile && !saveBtn.disabled) saveFile();
      }
    });

    // Handle text selection in preview for commenting
    setupPreviewCommentHandlers();

    loadFileList();
  }

  function toggleCommentMode() {
    commentModeEnabled = !commentModeEnabled;
    const icon = document.getElementById('comment-mode-icon');
    const text = document.getElementById('comment-mode-text');

    if (commentModeEnabled) {
      icon.textContent = '💬';
      text.textContent = 'Add Comments';
      toggleCommentModeBtn.style.background = 'var(--accent-glow)';
      toggleCommentModeBtn.style.color = 'var(--accent)';
    } else {
      icon.textContent = '✓';
      text.textContent = 'Comments Off';
      toggleCommentModeBtn.style.background = 'transparent';
      toggleCommentModeBtn.style.color = 'var(--text-secondary)';
    }
  }

  // --- Remote Cursor Management ---
  function updateRemoteCursor(userId, userName, userColor, cursorPos) {
    // Remove old cursor if exists
    removeRemoteCursor(userId);

    // Create cursor widget
    const cursorEl = document.createElement('span');
    cursorEl.className = 'remote-cursor';
    cursorEl.style.borderLeftColor = userColor;

    // Create label for cursor
    const label = document.createElement('span');
    label.className = 'remote-cursor-label';
    label.style.backgroundColor = userColor;
    label.textContent = userName;
    cursorEl.appendChild(label);

    // Add cursor to editor
    const widget = editor.setBookmark(cursorPos, { widget: cursorEl, insertLeft: true });
    remoteCursors.set(userId, widget);
  }

  function removeRemoteCursor(userId) {
    const widget = remoteCursors.get(userId);
    if (widget) {
      widget.clear();
      remoteCursors.delete(userId);
    }
  }

  function clearAllRemoteCursors() {
    remoteCursors.forEach((widget) => widget.clear());
    remoteCursors.clear();
  }

  // --- Comments System (Google Docs style) ---
  function setupPreviewCommentHandlers() {
    // Allow user to select text and add comment
    document.addEventListener('mouseup', handleTextSelection);
  }

  function handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || !currentFile || !commentModeEnabled) {
      hideCommentButton();
      return;
    }

    // Check if selection is within preview pane
    const range = selection.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) {
      hideCommentButton();
      return;
    }

    // Show comment button near selection
    showCommentButton(range, selectedText);
  }

  function showCommentButton(range, selectedText) {
    // Remove existing button
    hideCommentButton();

    const rect = range.getBoundingClientRect();
    const button = document.createElement('button');
    button.id = 'add-comment-floating-btn';
    button.className = 'floating-comment-btn show';
    button.textContent = '+ Add Comment';
    button.style.left = `${rect.right + 10}px`;
    button.style.top = `${rect.top}px`;

    button.addEventListener('click', () => {
      showCommentDialog(selectedText, range);
    });

    document.body.appendChild(button);
  }

  function hideCommentButton() {
    const existingBtn = document.getElementById('add-comment-floating-btn');
    if (existingBtn) {
      existingBtn.remove();
    }
  }

  function showCommentDialog(selectedText, range) {
    hideCommentButton();

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'comment-dialog show';
    dialog.innerHTML = `
      <div class="comment-dialog-header">
        <h4>Add Comment</h4>
        <button class="comment-dialog-close">&times;</button>
      </div>
      <div class="comment-dialog-selected">"${escapeHtml(selectedText.substring(0, 100))}${selectedText.length > 100 ? '...' : ''}"</div>
      <div class="comment-dialog-body">
        <textarea class="comment-dialog-input" placeholder="Add your comment..." autofocus></textarea>
        <div class="comment-dialog-actions">
          <button class="comment-dialog-btn secondary">Cancel</button>
          <button class="comment-dialog-btn primary">Post</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Event listeners
    dialog.querySelector('.comment-dialog-close').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.comment-dialog-btn.secondary').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.comment-dialog-btn.primary').addEventListener('click', async () => {
      const commentText = dialog.querySelector('.comment-dialog-input').value.trim();
      if (commentText && currentUser) {
        await addComment(selectedText, commentText, range);
        dialog.remove();
      }
    });

    // Auto-focus textarea
    setTimeout(() => dialog.querySelector('.comment-dialog-input').focus(), 100);
  }

  async function addComment(selectedText, commentText, range) {
    if (!currentFile || !currentUser) return;

    try {
      // Get position information
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      // Create comment with selection info
      await api(`/api/files/${encodeURIComponent(currentFile)}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          author: currentUser.name,
          authorColor: currentUser.color,
          content: commentText,
          selectedText: selectedText,
          timestamp: new Date().toISOString()
        }),
      });

      // Reload comments and update preview
      await loadComments();
      updatePreview();
    } catch (err) {
      alert('Failed to add comment: ' + err.message);
    }
  }

  async function loadComments() {
    if (!currentFile) return;
    try {
      const { comments: loadedComments } = await api(`/api/files/${encodeURIComponent(currentFile)}/comments`);
      comments = loadedComments || [];
      renderCommentsInPreview();
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }

  function renderCommentsInPreview() {
    // Remove existing comment highlights
    preview.querySelectorAll('.comment-highlight').forEach(el => el.classList.remove('comment-highlight'));
    preview.querySelectorAll('.comment-thread').forEach(el => el.remove());

    if (comments.length === 0) return;

    // Group comments by selected text
    const commentsByText = new Map();
    comments.forEach(comment => {
      const key = comment.selectedText || '';
      if (!commentsByText.has(key)) {
        commentsByText.set(key, []);
      }
      commentsByText.get(key).push(comment);
    });

    // Highlight text and add comment indicators
    commentsByText.forEach((threadComments, selectedText) => {
      if (!selectedText) return;

      // Find and highlight the text in preview
      highlightTextInPreview(selectedText, threadComments);
    });
  }

  function highlightTextInPreview(searchText, threadComments) {
    const walker = document.createTreeWalker(
      preview,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.nodeValue;
      const index = text.indexOf(searchText);

      if (index !== -1) {
        // Found the text, wrap it with highlight
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + searchText.length);

        const highlight = document.createElement('span');
        highlight.className = 'comment-highlight';
        highlight.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
        highlight.style.cursor = 'pointer';
        highlight.style.borderRadius = '2px';

        range.surroundContents(highlight);

        // Add click handler to show thread
        highlight.addEventListener('click', (e) => {
          e.stopPropagation();
          showCommentThread(threadComments, highlight);
        });

        // Only highlight first occurrence
        break;
      }
    }
  }

  function showCommentThread(threadComments, highlightElement) {
    // Remove any existing threads
    document.querySelectorAll('.comment-thread').forEach(el => el.remove());

    const rect = highlightElement.getBoundingClientRect();
    const thread = document.createElement('div');
    thread.className = 'comment-thread show';

    let html = `
      <div class="comment-thread-header">
        <h4>Comments</h4>
        <button class="comment-thread-close">&times;</button>
      </div>
      <div class="comment-thread-selected">"${escapeHtml(threadComments[0].selectedText)}"</div>
      <div class="comment-thread-body">
    `;

    threadComments.forEach(comment => {
      const color = comment.authorColor || '#6366f1';
      html += `
        <div class="comment-thread-item">
          <div class="comment-thread-item-header">
            <span class="comment-author-badge" style="background-color: ${color}">${comment.author.charAt(0)}</span>
            <span class="comment-thread-item-author">${escapeHtml(comment.author)}</span>
            <span class="comment-thread-item-time">${formatTime(comment.timestamp)}</span>
          </div>
          <div class="comment-thread-item-content">${escapeHtml(comment.content)}</div>
          <button class="reply-btn danger" data-id="${comment.id}">Delete</button>
        </div>
      `;
    });

    html += `
      </div>
      <div class="comment-thread-reply">
        <textarea class="reply-input" placeholder="Reply..."></textarea>
        <div class="reply-actions">
          <button class="reply-btn primary">Reply</button>
        </div>
      </div>
    `;

    thread.innerHTML = html;
    document.body.appendChild(thread);

    // Add event listeners
    thread.querySelector('.comment-thread-close').addEventListener('click', () => thread.remove());

    thread.querySelectorAll('.reply-btn.danger').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deleteComment(btn.dataset.id);
        thread.remove();
      });
    });

    thread.querySelector('.reply-btn.primary').addEventListener('click', async () => {
      const replyText = thread.querySelector('.reply-input').value.trim();
      if (replyText && currentUser) {
        await addComment(threadComments[0].selectedText, replyText, null);
        thread.remove();
      }
    });

    // Close thread when clicking outside
    setTimeout(() => {
      document.addEventListener('click', function closeThread(e) {
        if (!thread.contains(e.target) && !highlightElement.contains(e.target)) {
          thread.remove();
          document.removeEventListener('click', closeThread);
        }
      });
    }, 100);
  }

  async function deleteComment(commentId) {
    if (!currentFile) return;

    try {
      await api(`/api/files/${encodeURIComponent(currentFile)}/comments/${commentId}`, {
        method: 'DELETE',
      });
      await loadComments();
      updatePreview();
    } catch (err) {
      alert('Failed to delete comment: ' + err.message);
    }
  }

  // --- API helper ---
  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  // --- File operations ---
  async function loadFileList() {
    try {
      const { files } = await api('/api/files');
      renderFileList(files);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }

  async function openFile(filename) {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;
    try {
      const data = await api(`/api/files/${encodeURIComponent(filename)}`);
      currentFile = data.name;
      currentFileName.textContent = data.name;

      isRemoteChange = true;
      editor.setValue(data.content);
      isRemoteChange = false;

      setDirty(false);
      saveBtn.disabled = false;
      deleteBtn.disabled = false;
      docSaveBtn.disabled = false;
      docDeleteBtn.disabled = false;
      toggleCommentModeBtn.disabled = false;
      updatePreview();
      highlightActiveFile();

      // Clear old cursors
      clearAllRemoteCursors();

      // Join collaborative session
      socket.emit('join-file', { filename: data.name });

      // Load comments
      await loadComments();
    } catch (err) {
      alert('Failed to open file: ' + err.message);
    }
  }

  async function saveFile() {
    if (!currentFile) return;
    try {
      await api(`/api/files/${encodeURIComponent(currentFile)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editor.getValue() }),
      });
      setDirty(false);
      loadFileList();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function deleteFile() {
    if (!currentFile) return;
    if (!confirm(`Delete "${currentFile}"?`)) return;
    try {
      await api(`/api/files/${encodeURIComponent(currentFile)}`, {
        method: 'DELETE',
      });
      currentFile = null;
      editor.setValue('');
      currentFileName.textContent = 'No file selected';
      saveBtn.disabled = true;
      deleteBtn.disabled = true;
      docSaveBtn.disabled = true;
      docDeleteBtn.disabled = true;
      toggleCommentModeBtn.disabled = true;
      preview.innerHTML = '';
      setDirty(false);
      loadFileList();
      clearAllRemoteCursors();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  async function createNewFile() {
    const name = prompt('Enter filename (without .md extension):');
    if (!name || !name.trim()) return;
    try {
      const filename = name.trim().endsWith('.md') ? name.trim() : name.trim() + '.md';
      await api('/api/files', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), content: '' }),
      });
      await loadFileList();
      await openFile(filename);
    } catch (err) {
      alert('Failed to create file: ' + err.message);
    }
  }

  // --- UI ---
  function renderFileList(files) {
    fileList.innerHTML = '';
    files.forEach((file) => {
      const li = document.createElement('li');
      li.textContent = file.name;
      if (file.name === currentFile) li.classList.add('active');
      li.addEventListener('click', () => openFile(file.name));
      fileList.appendChild(li);
    });
  }

  function highlightActiveFile() {
    const items = fileList.querySelectorAll('li');
    items.forEach((li) => {
      li.classList.toggle('active', li.textContent === currentFile);
    });
  }

  function updatePreview() {
    const markdown = editor.getValue();
    preview.innerHTML = marked.parse(markdown);

    preview.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });

    // Re-render comments after preview updates
    renderCommentsInPreview();
  }

  function updateActiveUsers() {
    activeUsersEl.innerHTML = '';
    activeUsers.forEach((user) => {
      const badge = document.createElement('span');
      badge.className = 'user-badge';
      badge.style.backgroundColor = user.color;
      badge.textContent = user.name.charAt(0);
      badge.title = user.name;
      activeUsersEl.appendChild(badge);
    });
  }

  function showNotification(message, color) {
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = message;
    notif.style.borderLeftColor = color;
    document.body.appendChild(notif);

    setTimeout(() => notif.classList.add('show'), 10);
    setTimeout(() => {
      notif.classList.remove('show');
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }

  function setDirty(dirty) {
    isDirty = dirty;
    const title = currentFile || 'Markdown Editor';
    document.title = dirty ? `* ${title}` : title;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
