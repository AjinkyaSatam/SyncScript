import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import vm from 'vm';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';

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
const userSocketMap = {};     // socketId -> { username, roomId, writeAccess, approved, color }
const roomAdminMap = {};      // roomId -> adminSocketId
const pendingUsersMap = {};   // roomId -> [ { socketId, username } ]
const roomSingleWriterMap = {}; // roomId -> { enabled: boolean, activeTypistSocketId: string }

const USER_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E74C3C', '#2ECC71', '#3498DB', '#E67E22',
  '#FD79A8', '#6C5CE7', '#00CEC9', '#00B894', '#E17055'
];

function getRandomUserColor(socketId) {
  let hash = 0;
  for (let i = 0; i < socketId.length; i++) {
    hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

function getSingleWriterInfo(roomId) {
  const state = roomSingleWriterMap[roomId] || { enabled: false, activeTypistSocketId: roomAdminMap[roomId] };
  const activeTypistUser = userSocketMap[state.activeTypistSocketId];
  return {
    enabled: !!state.enabled,
    activeTypistSocketId: state.activeTypistSocketId || roomAdminMap[roomId],
    activeTypistUsername: activeTypistUser ? activeTypistUser.username : 'Admin',
  };
}

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
        color: user.color || getRandomUserColor(socketId),
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
      roomSingleWriterMap[roomId] = { enabled: false, activeTypistSocketId: socket.id };
      const color = getRandomUserColor(socket.id);
      userSocketMap[socket.id] = { username, roomId, writeAccess: true, approved: true, color };
      socket.join(roomId);

      const clients = getAllConnectedClients(roomId);
      
      // Notify the joiner they are approved and Admin
      socket.emit('join-status', { approved: true, isAdmin: true, writeAccess: true, color });

      // Notify all users in room including the joiner with full updated list
      io.in(roomId).emit('joined', {
        clients,
        username,
        socketId: socket.id,
        singleWriterState: getSingleWriterInfo(roomId),
      });
      
      console.log(`[Socket] Room ${roomId} created. Admin: ${username} (${socket.id})`);
    } else {
      // Put in lobby pending approval
      const color = getRandomUserColor(socket.id);
      userSocketMap[socket.id] = { username, roomId, writeAccess: true, approved: false, color };
      
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

  socket.on('cursor-position', ({ roomId, cursor }) => {
    const user = userSocketMap[socket.id];
    if (user && user.approved) {
      socket.in(roomId).emit('cursor-position', {
        socketId: socket.id,
        username: user.username,
        color: user.color || getRandomUserColor(socket.id),
        cursor,
      });
    }
  });

  socket.on('language-change', ({ roomId, language }) => {
    const user = userSocketMap[socket.id];
    // Security check: only Admin can change programming language
    if (user && user.approved && roomAdminMap[roomId] === socket.id) {
      io.in(roomId).emit('language-change', { language });
    }
  });

  // Single-Writer Control Handlers
  socket.on('toggle-single-writer', ({ roomId, enabled }) => {
    const user = userSocketMap[socket.id];
    if (user && user.approved && roomAdminMap[roomId] === socket.id) {
      if (!roomSingleWriterMap[roomId]) {
        roomSingleWriterMap[roomId] = { enabled: false, activeTypistSocketId: socket.id };
      }
      roomSingleWriterMap[roomId].enabled = enabled;
      if (enabled && !roomSingleWriterMap[roomId].activeTypistSocketId) {
        roomSingleWriterMap[roomId].activeTypistSocketId = socket.id;
      }
      io.in(roomId).emit('single-writer-updated', getSingleWriterInfo(roomId));
    }
  });

  socket.on('set-active-typist', ({ roomId, targetSocketId }) => {
    const user = userSocketMap[socket.id];
    const adminId = roomAdminMap[roomId];
    const currentTypistId = roomSingleWriterMap[roomId]?.activeTypistSocketId;

    // Only admin or current active typist can transfer control
    if (user && user.approved && (socket.id === adminId || socket.id === currentTypistId)) {
      if (!roomSingleWriterMap[roomId]) {
        roomSingleWriterMap[roomId] = { enabled: true, activeTypistSocketId: targetSocketId };
      } else {
        roomSingleWriterMap[roomId].activeTypistSocketId = targetSocketId;
      }
      io.in(roomId).emit('single-writer-updated', getSingleWriterInfo(roomId));
    }
  });

  socket.on('request-typing-control', ({ roomId }) => {
    const user = userSocketMap[socket.id];
    if (!user || !user.approved) return;

    const currentTypistId = roomSingleWriterMap[roomId]?.activeTypistSocketId || roomAdminMap[roomId];
    if (currentTypistId && currentTypistId !== socket.id) {
      io.to(currentTypistId).emit('typing-control-requested', {
        requesterSocketId: socket.id,
        username: user.username,
      });
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

// Code Compiler Endpoint (JDoodle + Built-in Execution Engine)
const JDOODLE_LANG_MAP = {
  javascript: { language: 'nodejs', versionIndex: '4' },
  python: { language: 'python3', versionIndex: '4' },
  java: { language: 'java', versionIndex: '4' },
  c: { language: 'c', versionIndex: '5' },
  cpp: { language: 'cpp17', versionIndex: '1' },
};

const tempExecDir = path.join(os.tmpdir(), 'syncscript_exec');
if (!fs.existsSync(tempExecDir)) {
  try { fs.mkdirSync(tempExecDir, { recursive: true }); } catch (e) {}
}

function executeCodeLocally(language, code) {
  return new Promise((resolve) => {
    const id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const lang = (language || 'javascript').toLowerCase();

    if (lang === 'javascript') {
      try {
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
        script.runInContext(context, { timeout: 3000 });
        const output = logs.length > 0 ? logs.join('\n') : 'Code executed successfully (no output).';
        resolve({ output, statusCode: 200 });
      } catch (evalErr) {
        let errorMsg = evalErr.message;
        if (evalErr.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
          errorMsg = 'Execution Timed Out (3000ms limit exceeded).';
        }
        resolve({ output: `Runtime Error:\n${errorMsg}`, statusCode: 400 });
      }
      return;
    }

    if (lang === 'python') {
      const srcFile = path.join(tempExecDir, `script_${id}.py`);
      fs.writeFileSync(srcFile, code);
      exec(`python "${srcFile}"`, { timeout: 5000 }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') {
          exec(`python3 "${srcFile}"`, { timeout: 5000 }, (err2, stdout2, stderr2) => {
            try { if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile); } catch (e) {}
            if (err2 && err2.killed) return resolve({ output: 'Execution timed out (5s limit exceeded).', statusCode: 400 });
            const out = (stdout2 || '') + (stderr2 || '');
            resolve({ output: out.trim() || 'Code executed successfully (no output).', statusCode: err2 ? 400 : 200 });
          });
          return;
        }
        try { if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile); } catch (e) {}
        if (err && err.killed) return resolve({ output: 'Execution timed out (5s limit exceeded).', statusCode: 400 });
        const out = (stdout || '') + (stderr || '');
        resolve({ output: out.trim() || 'Code executed successfully (no output).', statusCode: err ? 400 : 200 });
      });
      return;
    }

    if (lang === 'c' || lang === 'cpp') {
      const ext = lang === 'cpp' ? 'cpp' : 'c';
      const compiler = lang === 'cpp' ? 'g++' : 'gcc';
      const srcFile = path.join(tempExecDir, `src_${id}.${ext}`);
      const exeFile = path.join(tempExecDir, `bin_${id}.exe`);
      fs.writeFileSync(srcFile, code);

      exec(`${compiler} "${srcFile}" -o "${exeFile}"`, { timeout: 8000 }, (compileErr, cStdout, cStderr) => {
        if (compileErr) {
          try { if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile); } catch (e) {}
          const errMsg = cStderr || cStdout || compileErr.message;
          return resolve({ output: `Compilation Error:\n${errMsg.trim()}`, statusCode: 400 });
        }
        exec(`"${exeFile}"`, { timeout: 5000 }, (runErr, rStdout, rStderr) => {
          try {
            if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile);
            if (fs.existsSync(exeFile)) fs.unlinkSync(exeFile);
          } catch (e) {}
          if (runErr && runErr.killed) return resolve({ output: 'Execution timed out (5s limit exceeded).', statusCode: 400 });
          const out = (rStdout || '') + (rStderr || '');
          resolve({ output: out.trim() || 'Code executed successfully (no output).', statusCode: runErr ? 400 : 200 });
        });
      });
      return;
    }

    if (lang === 'java') {
      const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      const className = classMatch ? classMatch[1] : 'Main';
      const javaFolder = path.join(tempExecDir, `java_${id}`);
      try { fs.mkdirSync(javaFolder, { recursive: true }); } catch (e) {}
      const javaFile = path.join(javaFolder, `${className}.java`);
      fs.writeFileSync(javaFile, code);

      exec(`javac "${javaFile}"`, { timeout: 8000 }, (compileErr, cStdout, cStderr) => {
        if (compileErr) {
          try { fs.rmSync(javaFolder, { recursive: true, force: true }); } catch (e) {}
          const errMsg = cStderr || cStdout || compileErr.message;
          return resolve({ output: `Compilation Error:\n${errMsg.trim()}`, statusCode: 400 });
        }
        exec(`java -cp "${javaFolder}" ${className}`, { timeout: 5000 }, (runErr, rStdout, rStderr) => {
          try { fs.rmSync(javaFolder, { recursive: true, force: true }); } catch (e) {}
          if (runErr && runErr.killed) return resolve({ output: 'Execution timed out (5s limit exceeded).', statusCode: 400 });
          const out = (rStdout || '') + (rStderr || '');
          resolve({ output: out.trim() || 'Code executed successfully (no output).', statusCode: runErr ? 400 : 200 });
        });
      });
      return;
    }

    resolve({ output: `Unsupported language: ${language}`, statusCode: 400 });
  });
}

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

  // Execute using built-in local execution engine
  const startTime = Date.now();
  const result = await executeCodeLocally(language, code);
  const duration = ((Date.now() - startTime) / 1000).toFixed(3);

  return res.json({
    output: result.output,
    statusCode: result.statusCode,
    memory: '12 MB',
    cpuTime: `${duration}s`,
  });
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

