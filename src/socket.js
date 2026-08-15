import { io } from 'socket.io-client';

export const initSocket = async () => {
  const options = {
    'force new connection': true,
    reconnectionAttempt: 'Infinities',
    timeout: 10000,
    transports: ['websocket'],
  };

  // Connect to backend server URL or current origin fallback
  const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  return io(backendUrl, options);
};
