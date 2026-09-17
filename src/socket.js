import { io } from 'socket.io-client';

export const initSocket = async () => {
  const options = {
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,        // Start retrying after 1s (default is 1s)
    reconnectionDelayMax: 5000,     // Cap retry delay at 5s (default is 5s)
    timeout: 20000,                 // 20s connection timeout
    transports: ['polling', 'websocket'], // Start with polling (works immediately during cold start), then upgrade to websocket
    upgrade: true,                  // Auto-upgrade from polling to websocket once available
    rememberUpgrade: true,          // Remember that websocket works, skip polling on reconnects
    forceNew: false,                // Reuse existing connection if available
  };

  // Connect to backend server URL or current origin fallback, trimming trailing slashes
  const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
  return io(cleanUrl, options);
};
