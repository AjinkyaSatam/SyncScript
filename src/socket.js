import { io } from 'socket.io-client';

export const initSocket = async () => {
  const options = {
    'force new connection': true,
    reconnectionAttempts: Infinity, // Fixed spelling and value type
    timeout: 30000, // Increased to 30 seconds to allow Render free tier to wake up
    transports: ['websocket'],
  };

  // Connect to backend server URL or current origin fallback, trimming trailing slashes
  const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
  return io(cleanUrl, options);
};
