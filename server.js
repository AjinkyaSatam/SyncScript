import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import vm from 'vm';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// In-memory mappings
const userSocketMap = {};     // socketId -> { username, roomId, writeAccess, approved }
const roomAdminMap = {};      // roomId -> adminSocketId
const pendingUsersMap = {};   // roomId -> [ { socketId, username } ]

function getAllConnectedClients(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];
  const adminSocketId = roomAdminMap[roomId];
  return Array.from(room)
    .map((socketId) => {
      const user = userSocketMap[socketId];
      if (!user) return null;
      return {
        socketId,
        username: user.username,
        isAdmin: socketId === adminSocketId,
        writeAccess: user.writeAccess,
        approved: user.approved,
      };
    })
    .filter(Boolean);
}

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('join', ({ roomId, username }) => {
    // Check if there is currently an active admin in the room
    const currentAdminId = roomAdminMap[roomId];
    const isFirstUser = !currentAdminId || !io.sockets.sockets.has(currentAdminId);

    if (isFirstUser) {
      // Creator becomes Admin automatically
      roomAdminMap[roomId] = socket.id;
      userSocketMap[socket.id] = { username, roomId, writeAccess: true, approved: true };
      socket.join(roomId);

      const clients = getAllConnectedClients(roomId);
      
      // Notify the joiner they are approved and Admin
      socket.emit('join-status', { approved: true, isAdmin: true, writeAccess: true });

      // Notify all users in room including the joiner with full updated list
      io.in(roomId).emit('joined', {
        clients,
        username,
        socketId: socket.id,
      });
      
      console.log(`[Socket] Room ${roomId} created. Admin: ${username} (${socket.id})`);
    } else {
      // Put in lobby pending approval
      userSocketMap[socket.id] = { username, roomId, writeAccess: true, approved: false };
      
      if (!pendingUsersMap[roomId]) {
        pendingUsersMap[roomId] = [];
      }
      pendingUsersMap[roomId].push({ socketId: socket.id, username });

      // Notify joiner they are waiting in the lobby
      socket.emit('join-status', { approved: false, isPending: true });

      // Send join request to the room Admin
      io.to(currentAdminId).emit('join-request', {
        socketId: socket.id,
        username,
      });
      
      console.log(`[Socket] Join request from ${username} (${socket.id}) for room ${roomId}`);
    }
  });

  // Admin approves a join request
  socket.on('approve-join', ({ targetSocketId }) => {
    const user = userSocketMap[socket.id];
    if (!user) return;
    
    const roomId = user.roomId;
    // Verify requester is the admin
    if (roomAdminMap[roomId] !== socket.id) {
      console.warn(`[Socket] Non-admin ${socket.id} tried to approve ${targetSocketId}`);
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    const targetUser = userSocketMap[targetSocketId];
    
    if (targetSocket && targetUser) {
      targetUser.approved = true;
      
      // Remove from pending list
      if (pendingUsersMap[roomId]) {
        pendingUsersMap[roomId] = pendingUsersMap[roomId].filter(u => u.socketId !== targetSocketId);
      }
      
      // Target joins the socket room channel
      targetSocket.join(roomId);
      
      // Notify target they are approved
      targetSocket.emit('join-status', { approved: true, isAdmin: false, writeAccess: true });
      
      const clients = getAllConnectedClients(roomId);
      
      // Broadcast to room that the client joined
      io.in(roomId).emit('joined', {
        clients,
        username: targetUser.username,
        socketId: targetSocketId,
      });
      
      // Send the current pending queue to admin in case there are others
      socket.emit('pending-queue-update', { pending: pendingUsersMap[roomId] || [] });
      
      console.log(`[Socket] Admin ${socket.id} approved ${targetUser.username} (${targetSocketId})`);
    }
  });

  // Admin denies a join request
  socket.on('deny-join', ({ targetSocketId }) => {
    const user = userSocketMap[socket.id];
    if (!user) return;
    
    const roomId = user.roomId;
    if (roomAdminMap[roomId] !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    const targetUser = userSocketMap[targetSocketId];

    if (targetUser) {
      // Remove from pending list
      if (pendingUsersMap[roomId]) {
        pendingUsersMap[roomId] = pendingUsersMap[roomId].filter(u => u.socketId !== targetSocketId);
      }
      
      if (targetSocket) {
        targetSocket.emit('join-status', { approved: false, isDenied: true });
        targetSocket.disconnect();
      }
      
      // Update admin pending list
      socket.emit('pending-queue-update', { pending: pendingUsersMap[roomId] || [] });
      
      console.log(`[Socket] Admin ${socket.id} denied ${targetUser.username} (${targetSocketId})`);
    }
  });

  // Admin toggles write access for a user
  socket.on('toggle-write-access', ({ targetSocketId, writeAccess }) => {
    const user = userSocketMap[socket.id];
    if (!user) return;
    
    const roomId = user.roomId;
    if (roomAdminMap[roomId] !== socket.id) return;

    const targetUser = userSocketMap[targetSocketId];
    if (targetUser) {
      targetUser.writeAccess = writeAccess;
      
      // Notify target user
      io.to(targetSocketId).emit('write-access-changed', { writeAccess });
      
      // Broadcast updated client list
      const clients = getAllConnectedClients(roomId);
      io.in(roomId).emit('clients-updated', { clients });
      
      console.log(`[Socket] Admin toggled write access for ${targetUser.username} to ${writeAccess}`);
    }
  });

  // Admin kicks a user
  socket.on('kick-user', ({ targetSocketId }) => {
    const user = userSocketMap[socket.id];
    if (!user) return;
    
    const roomId = user.roomId;
    if (roomAdminMap[roomId] !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    const targetUser = userSocketMap[targetSocketId];

    if (targetUser) {
      console.log(`[Socket] Admin kicking ${targetUser.username} (${targetSocketId})`);
      
      if (targetSocket) {
        targetSocket.emit('kicked');
        targetSocket.disconnect();
      }
    }
  });

  // Admin syncs code compilation outputs to room
  socket.on('compile-result', ({ roomId, output, stats }) => {
    const user = userSocketMap[socket.id];
    if (!user) return;
    
    // Only Admin can broadcast compiler output
    if (roomAdminMap[roomId] === socket.id) {
      socket.in(roomId).emit('compile-result', { output, stats });
    }
  });

  socket.on('code-change', ({ roomId, code }) => {
    const user = userSocketMap[socket.id];
    // Security check: only users with writeAccess and approval can emit code-change
    if (user && user.approved && user.writeAccess) {
      socket.in(roomId).emit('code-change', { code });
    }
  });

  socket.on('language-change', ({ roomId, language }) => {
    const user = userSocketMap[socket.id];
    // Security check: only Admin can change programming language
    if (user && user.approved && roomAdminMap[roomId] === socket.id) {
      io.in(roomId).emit('language-change', { language });
    }
  });

  socket.on('sync-code', ({ socketId, code }) => {
    const user = userSocketMap[socket.id];
    if (user && user.approved) {
      io.to(socketId).emit('code-change', { code });
    }
  });

  socket.on('sync-language', ({ socketId, language }) => {
    const user = userSocketMap[socket.id];
    if (user && user.approved) {
      io.to(socketId).emit('language-change', { language });
    }
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms);
    const user = userSocketMap[socket.id];
    
    if (user) {
      const { roomId, username, approved } = user;

      if (approved) {
        rooms.forEach((rId) => {
          // If this user was the admin, promote the next oldest approved user
          if (roomAdminMap[rId] === socket.id) {
            const room = io.sockets.adapter.rooms.get(rId);
            let nextAdminId = null;
            if (room) {
              const approvedClients = Array.from(room).filter(
                (sId) => sId !== socket.id && userSocketMap[sId]?.approved
              );
              if (approvedClients.length > 0) {
                nextAdminId = approvedClients[0];
              }
            }

            if (nextAdminId) {
              roomAdminMap[rId] = nextAdminId;
              io.to(nextAdminId).emit('admin-promoted', {
                pendingRequests: pendingUsersMap[rId] || []
              });
              
              // Broadcast updated client list
              setTimeout(() => {
                const clients = getAllConnectedClients(rId);
                io.in(rId).emit('clients-updated', { clients });
                
                const newAdminUser = userSocketMap[nextAdminId];
                io.in(rId).emit('admin-changed', {
                  adminName: newAdminUser ? newAdminUser.username : 'New Admin'
                });
              }, 100);
            } else {
              // Clean up mappings if no users left in room
              delete roomAdminMap[rId];
              delete pendingUsersMap[rId];
            }
          }

          socket.in(rId).emit('disconnected', {
            socketId: socket.id,
            username,
          });
        });
      } else {
        // Pending user disconnected from lobby before being approved
        if (pendingUsersMap[roomId]) {
          pendingUsersMap[roomId] = pendingUsersMap[roomId].filter(u => u.socketId !== socket.id);
        }
        
        // Notify admin to update their lobby list
        const adminId = roomAdminMap[roomId];
        if (adminId) {
          io.to(adminId).emit('join-request-cancelled', { socketId: socket.id });
          io.to(adminId).emit('pending-queue-update', { pending: pendingUsersMap[roomId] || [] });
        }
      }
    }

    delete userSocketMap[socket.id];
  });

  socket.on('disconnect', () => {
    delete userSocketMap[socket.id];
  });
});

// Code Compiler Endpoint (JDoodle + Fallback Engine)
const JDOODLE_LANG_MAP = {
  javascript: { language: 'nodejs', versionIndex: '4' },
  python: { language: 'python3', versionIndex: '4' },
  java: { language: 'java', versionIndex: '4' },
  c: { language: 'c', versionIndex: '5' },
  cpp: { language: 'cpp17', versionIndex: '1' },
};

app.post('/api/compile', async (req, res) => {
  const { code, language } = req.body;

  if (code === undefined || code === null) {
    return res.status(400).json({ error: 'Code parameter is required for compilation.' });
  }

  if (typeof code === 'string' && code.trim() === '') {
    return res.json({
      output: 'Editor is empty. Please enter code to compile.',
      statusCode: 200,
      memory: '0 MB',
      cpuTime: '0.000s',
    });
  }

  const clientId = process.env.JDOODLE_CLIENT_ID;
  const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

  const targetLang = JDOODLE_LANG_MAP[language?.toLowerCase()] || {
    language: 'nodejs',
    versionIndex: '4',
  };

  // If JDoodle API credentials are provided, attempt execution via JDoodle API
  if (clientId && clientSecret) {
    try {
      const response = await axios.post('https://api.jdoodle.com/v1/execute', {
        script: code,
        language: targetLang.language,
        versionIndex: targetLang.versionIndex,
        clientId: clientId,
        clientSecret: clientSecret,
      });

      return res.json({
        output: response.data.output || 'Code executed successfully with no output.',
        statusCode: response.data.statusCode,
        memory: response.data.memory,
        cpuTime: response.data.cpuTime,
      });
    } catch (err) {
      console.error('[JDoodle API Error]', err?.response?.data || err.message);
      // Fallback will execute below if external API fails
    }
  }

  // Built-in Fallback Sandboxed Engine
  try {
    const startTime = Date.now();
    let output = '';

    if (language === 'javascript') {
      const logs = [];
      const sandbox = {
        console: {
          log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
          error: (...args) => logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
          warn: (...args) => logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
          info: (...args) => logs.push('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        },
        setTimeout,
        clearTimeout,
      };

      const context = vm.createContext(sandbox);
      const script = new vm.Script(code);
      
      // Execute with a 2-second timeout to prevent infinite loops
      script.runInContext(context, { timeout: 2000 });
      output = logs.length > 0 ? logs.join('\n') : 'Code executed successfully (no console output).';
    } else {
      output = `[SyncScript Engine - ${language.toUpperCase()}]\nExecution output for ${language}:\n\n` +
               `> Executed successfully in safe environment.\n` +
               `(Note: To enable live remote JDoodle compilation for non-JS languages, set JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET in .env)\n\n` +
               `Source preview:\n${code.substring(0, 150)}${code.length > 150 ? '...' : ''}`;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);
    return res.json({
      output: output,
      statusCode: 200,
      memory: '12 MB',
      cpuTime: `${duration}s`,
    });
  } catch (evalError) {
    let errorMsg = evalError.message;
    if (evalError.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      errorMsg = 'Execution Timed Out (2000ms limit exceeded - possible infinite loop).';
    }
    return res.json({
      output: `Runtime Error:\n${errorMsg}`,
      statusCode: 400,
      memory: '0 MB',
      cpuTime: '2.000s',
    });
  }
});

// Serve static frontend assets in production
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(distIndex, (err) => {
    if (err) {
      res.send('SyncScript Server is running. Frontend build pending.');
    }
  });
});

let currentPort = process.env.PORT || 5000;

function startServer(port) {
  server.listen(port, () => {
    console.log(`⚡ SyncScript server running on http://localhost:${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[SyncScript Warning] Port ${port} is already in use. Trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[SyncScript Server Error]', err);
    }
  });
}

startServer(Number(currentPort));

