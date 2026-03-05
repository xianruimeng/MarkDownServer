const MAX_USERS_PER_FILE = 10;

// Store active sessions per file
// Structure: { filename: { users: Map(socketId -> userData), content: string } }
const fileSessions = new Map();

// User colors for visual distinction
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#ABEBC6'
];

// Generate random user name
function generateUsername() {
  const adjectives = ['Quick', 'Happy', 'Clever', 'Brave', 'Calm', 'Wise', 'Swift', 'Kind'];
  const nouns = ['Panda', 'Eagle', 'Tiger', 'Dolphin', 'Fox', 'Bear', 'Wolf', 'Owl'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
}

function collaborationHandler(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let currentFile = null;
    let userData = null;

    // Join a file session
    socket.on('join-file', ({ filename }) => {
      // Leave current file if any
      if (currentFile) {
        socket.leave(currentFile);
        const session = fileSessions.get(currentFile);
        if (session) {
          session.users.delete(socket.id);
          io.to(currentFile).emit('user-left', { userId: socket.id, users: getUserList(session) });

          // Clean up empty sessions
          if (session.users.size === 0) {
            fileSessions.delete(currentFile);
          }
        }
      }

      // Initialize session if needed
      if (!fileSessions.has(filename)) {
        fileSessions.set(filename, { users: new Map(), content: '' });
      }

      const session = fileSessions.get(filename);

      // Check user limit
      if (session.users.size >= MAX_USERS_PER_FILE) {
        socket.emit('join-error', { message: 'File has reached maximum capacity (10 users)' });
        return;
      }

      // Create user data
      const colorIndex = session.users.size % USER_COLORS.length;
      userData = {
        id: socket.id,
        name: generateUsername(),
        color: USER_COLORS[colorIndex]
      };

      // Add user to session
      session.users.set(socket.id, userData);
      currentFile = filename;
      socket.join(filename);

      // Notify user and others
      socket.emit('join-success', {
        user: userData,
        users: getUserList(session),
        content: session.content
      });

      socket.to(filename).emit('user-joined', {
        user: userData,
        users: getUserList(session)
      });

      console.log(`${userData.name} joined ${filename} (${session.users.size}/${MAX_USERS_PER_FILE})`);
    });

    // Handle content changes
    socket.on('content-change', ({ filename, content, cursorPos }) => {
      const session = fileSessions.get(filename);
      if (!session || !session.users.has(socket.id)) {
        return;
      }

      // Update session content
      session.content = content;

      // Broadcast to other users in the same file
      socket.to(filename).emit('remote-content-change', {
        userId: socket.id,
        content,
        cursorPos
      });
    });

    // Handle cursor position updates
    socket.on('cursor-move', ({ filename, cursorPos }) => {
      const session = fileSessions.get(filename);
      if (!session || !session.users.has(socket.id)) {
        return;
      }

      socket.to(filename).emit('remote-cursor-move', {
        userId: socket.id,
        userName: userData.name,
        userColor: userData.color,
        cursorPos
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);

      if (currentFile) {
        const session = fileSessions.get(currentFile);
        if (session) {
          session.users.delete(socket.id);
          io.to(currentFile).emit('user-left', {
            userId: socket.id,
            users: getUserList(session)
          });

          // Clean up empty sessions
          if (session.users.size === 0) {
            fileSessions.delete(currentFile);
          }
        }
      }
    });
  });
}

// Helper to get user list for a session
function getUserList(session) {
  return Array.from(session.users.values()).map(u => ({
    id: u.id,
    name: u.name,
    color: u.color
  }));
}

module.exports = collaborationHandler;
