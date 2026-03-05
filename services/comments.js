const fs = require('fs/promises');
const path = require('path');
const config = require('../config');

// Get comments file path for a given markdown file
function getCommentsFilePath(filename) {
  const basename = path.basename(filename, '.md');
  return path.join(config.docsDir, `${basename}.comments.json`);
}

// Load comments for a file
async function loadComments(filename) {
  try {
    const commentsPath = getCommentsFilePath(filename);
    const data = await fs.readFile(commentsPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // No comments file exists yet
    }
    throw err;
  }
}

// Save comments for a file
async function saveComments(filename, comments) {
  const commentsPath = getCommentsFilePath(filename);
  await fs.writeFile(commentsPath, JSON.stringify(comments, null, 2), 'utf-8');
}

// Add a new comment
async function addComment(filename, author, content, authorColor = null, selectedText = null) {
  const comments = await loadComments(filename);
  const newComment = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    author,
    content,
    timestamp: new Date().toISOString(),
    authorColor,
    selectedText,
    replies: []
  };
  comments.push(newComment);
  await saveComments(filename, comments);
  return newComment;
}

// Delete a comment
async function deleteComment(filename, commentId) {
  const comments = await loadComments(filename);
  const filtered = comments.filter(c => c.id !== commentId);

  if (filtered.length === comments.length) {
    return false; // Comment not found
  }

  await saveComments(filename, filtered);
  return true;
}

// Delete all comments for a file
async function deleteAllComments(filename) {
  try {
    const commentsPath = getCommentsFilePath(filename);
    await fs.unlink(commentsPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

module.exports = {
  loadComments,
  addComment,
  deleteComment,
  deleteAllComments
};
