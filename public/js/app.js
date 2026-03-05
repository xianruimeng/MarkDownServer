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
  let isRemoteChange = false; // Flag to prevent infinite loops

  // --- DOM References ---
  const fileList = document.getElementById('file-list');
  const preview = document.getElementById('preview');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const newFileBtn = document.getElementById('new-file-btn');
  const currentFileName = document.getElementById('current-file-name');
  const activeUsersEl = document.getElementById('active-users');
  const toggleCommentsBtn = document.getElementById('toggle-comments-btn');
  const commentsPanel = document.getElementById('comments-panel');
  const closeCommentsBtn = document.getElementById('close-comments-btn');
  const commentsList = document.getElementById('comments-list');
  const commentInput = document.getElementById('comment-input');
  const addCommentBtn = document.getElementById('add-comment-btn');

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
        return; // Don't broadcast remote changes
      }

      setDirty(true);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 150);

      // Broadcast changes to other users
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

      // If there's content from other users, use that
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

    // Event listeners
    saveBtn.addEventListener('click', saveFile);
    deleteBtn.addEventListener('click', deleteFile);
    newFileBtn.addEventListener('click', createNewFile);
    toggleCommentsBtn.addEventListener('click', toggleCommentsPanel);
    closeCommentsBtn.addEventListener('click', () => commentsPanel.classList.remove('open'));
    addCommentBtn.addEventListener('click', addComment);

    // Ctrl/Cmd+S to save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentFile && !saveBtn.disabled) saveFile();
      }
    });

    loadFileList();
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
      toggleCommentsBtn.disabled = false;
      updatePreview();
      highlightActiveFile();

      // Join collaborative session
      socket.emit('join-file', { filename: data.name });

      // Load comments
      loadComments();
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
      toggleCommentsBtn.disabled = true;
      preview.innerHTML = '';
      setDirty(false);
      loadFileList();
      commentsPanel.classList.remove('open');
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

  // --- Comments ---
  async function loadComments() {
    if (!currentFile) return;
    try {
      const { comments } = await api(`/api/files/${encodeURIComponent(currentFile)}/comments`);
      renderComments(comments);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }

  async function addComment() {
    if (!currentFile || !currentUser) return;
    const content = commentInput.value.trim();
    if (!content) return;

    try {
      await api(`/api/files/${encodeURIComponent(currentFile)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ author: currentUser.name, content }),
      });
      commentInput.value = '';
      loadComments();
    } catch (err) {
      alert('Failed to add comment: ' + err.message);
    }
  }

  async function deleteComment(commentId) {
    if (!currentFile) return;
    if (!confirm('Delete this comment?')) return;

    try {
      await api(`/api/files/${encodeURIComponent(currentFile)}/comments/${commentId}`, {
        method: 'DELETE',
      });
      loadComments();
    } catch (err) {
      alert('Failed to delete comment: ' + err.message);
    }
  }

  function renderComments(comments) {
    commentsList.innerHTML = '';
    if (comments.length === 0) {
      commentsList.innerHTML = '<p class="no-comments">No comments yet</p>';
      return;
    }

    comments.forEach((comment) => {
      const commentEl = document.createElement('div');
      commentEl.className = 'comment';
      commentEl.innerHTML = `
        <div class="comment-header">
          <strong>${escapeHtml(comment.author)}</strong>
          <span class="comment-time">${formatTime(comment.timestamp)}</span>
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
        <button class="delete-comment-btn" data-id="${comment.id}">Delete</button>
      `;
      commentEl.querySelector('.delete-comment-btn').addEventListener('click', () => {
        deleteComment(comment.id);
      });
      commentsList.appendChild(commentEl);
    });
  }

  function toggleCommentsPanel() {
    commentsPanel.classList.toggle('open');
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
