(function () {
  'use strict';

  // --- State ---
  let editor;
  let currentFile = null;
  let isDirty = false;
  let previewTimer;

  // --- DOM References ---
  const fileList = document.getElementById('file-list');
  const preview = document.getElementById('preview');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const newFileBtn = document.getElementById('new-file-btn');
  const currentFileName = document.getElementById('current-file-name');

  // --- Initialize ---
  function init() {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
      mode: 'markdown',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
      styleActiveLine: true,
    });

    editor.on('change', () => {
      setDirty(true);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 150);
    });

    // Configure marked with highlight.js
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Set up highlight.js renderer
    const renderer = new marked.Renderer();
    marked.use({
      renderer,
      hooks: {
        postprocess(html) {
          // After marked renders, highlight code blocks via DOM
          return html;
        },
      },
    });

    // Event listeners
    saveBtn.addEventListener('click', saveFile);
    deleteBtn.addEventListener('click', deleteFile);
    newFileBtn.addEventListener('click', createNewFile);

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
      editor.setValue(data.content);
      setDirty(false);
      saveBtn.disabled = false;
      deleteBtn.disabled = false;
      updatePreview();
      highlightActiveFile();
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
      preview.innerHTML = '';
      setDirty(false);
      loadFileList();
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

    // Apply syntax highlighting to code blocks
    preview.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  function setDirty(dirty) {
    isDirty = dirty;
    const title = currentFile || 'Markdown Editor';
    document.title = dirty ? `* ${title}` : title;
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
