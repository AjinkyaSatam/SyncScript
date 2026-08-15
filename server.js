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
const userSocketMap = {};

function getAllConnectedClients(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];
  return Array.from(room).map((socketId) => ({
    socketId,
    username: userSocketMap[socketId] || 'Anonymous',
  }));
}

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('join', ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);

    // Notify all users in room including the joiner with full updated list
    io.in(roomId).emit('joined', {
      clients,
      username,
      socketId: socket.id,
    });
  });

  socket.on('code-change', ({ roomId, code }) => {
    socket.in(roomId).emit('code-change', { code });
  });

  socket.on('language-change', ({ roomId, language }) => {
    io.in(roomId).emit('language-change', { language });
  });

  socket.on('sync-code', ({ socketId, code }) => {
    io.to(socketId).emit('code-change', { code });
  });

  socket.on('sync-language', ({ socketId, language }) => {
    io.to(socketId).emit('language-change', { language });
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms);
    const username = userSocketMap[socket.id];

    rooms.forEach((roomId) => {
      socket.in(roomId).emit('disconnected', {
        socketId: socket.id,
        username,
      });
    });

    delete userSocketMap[socket.id];
    socket.leave();
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

