import React, { useState, useRef, useEffect, useContext } from 'react';
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';

import Logo from '../components/Logo';
import Client from '../components/Client';
import Editor from '../components/Editor';
import OutputPanel from '../components/OutputPanel';
import { initSocket } from '../socket';
import { AppThemeContext } from '../App';

const DEFAULT_TEMPLATES = {
  javascript: `// Welcome to SyncScript Real-Time Code Editor!
function greet(name) {
    console.log("Hello, " + name + "!");
}

greet("Developer");
`,
  python: `# Welcome to SyncScript Real-Time Code Editor!
def greet(name):
    print(f"Hello, {name}!")

greet("Developer")
`,
  java: `// Welcome to SyncScript Real-Time Code Editor!
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Developer!");
    }
}
`,
  c: `// Welcome to SyncScript Real-Time Code Editor!
#include <stdio.h>

int main() {
    printf("Hello, Developer!\\n");
    return 0;
}
`,
  cpp: `// Welcome to SyncScript Real-Time Code Editor!
#include <iostream>

int main() {
    std::cout << "Hello, Developer!" << std::endl;
    return 0;
}
`,
};

const EditorPage = () => {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const languageRef = useRef('javascript');
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  const [socket, setSocket] = useState(null);
  const [clients, setClients] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [consoleOutput, setConsoleOutput] = useState('');
  const [consoleStats, setConsoleStats] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(true);
  const [mySocketId, setMySocketId] = useState('');
  const { appTheme, toggleTheme } = useContext(AppThemeContext);

  // Admin & permissions states
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinStatus, setJoinStatus] = useState('pending'); // 'pending' | 'approved'
  const [writeAccess, setWriteAccess] = useState(true);
  const [joinRequests, setJoinRequests] = useState([]);
  const [singleWriterState, setSingleWriterState] = useState({
    enabled: false,
    activeTypistSocketId: '',
    activeTypistUsername: '',
  });

  // Sync language ref to prevent closure staleness in socket listener
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Guard: If username not provided, redirect home
  if (!location.state || !location.state.username) {
    return <Navigate to="/" />;
  }

  const username = location.state.username;

  useEffect(() => {
    let isSubscribed = true;
    let socketInstance = null;

    const init = async () => {
      socketInstance = await initSocket();

      if (!isSubscribed) {
        if (socketInstance) {
          socketInstance.disconnect();
        }
        return;
      }

      socketRef.current = socketInstance;
      setSocket(socketInstance);

      const handleErrors = (e) => {
        console.error('Socket error', e);
        toast.error('Socket connection failed, try again later.');
        reactNavigator('/');
      };

      socketInstance.on('connect_error', handleErrors);
      socketInstance.on('connect_failed', handleErrors);
      
      if (socketInstance.id) {
        setMySocketId(socketInstance.id);
      }
      
      socketInstance.on('connect', () => {
        setMySocketId(socketInstance.id);
      });

      // Emit Join Room event
      socketInstance.emit('join', {
        roomId,
        username,
      });

      // Handle join approval / lobby states
      socketInstance.on('join-status', ({ approved, isAdmin: isRoomAdmin, writeAccess: canWrite, isPending, isDenied }) => {
        if (isDenied) {
          toast.error('Your request to join this room was denied by the Admin.', { duration: 5000 });
          reactNavigator('/');
          return;
        }

        if (approved) {
          setJoinStatus('approved');
          setIsAdmin(isRoomAdmin);
          setWriteAccess(canWrite);
        } else if (isPending) {
          setJoinStatus('pending');
        }
      });

      // Listen for approved joined events
      socketInstance.on('joined', ({ clients: roomClients, username: joinedUser, socketId, singleWriterState: swState }) => {
        if (joinedUser !== username) {
          toast.success(`${joinedUser} joined the room.`, {
            icon: '👤',
          });
        }
        setClients(roomClients);
        if (swState) {
          setSingleWriterState(swState);
        }

        // Sync latest code and language to newly joined client (only if we are the admin)
        const myClientInfo = roomClients.find(c => c.socketId === socketInstance.id);
        if (myClientInfo?.isAdmin) {
          if (codeRef.current) {
            socketInstance.emit('sync-code', {
              code: codeRef.current,
              socketId,
            });
          }
          socketInstance.emit('sync-language', {
            language: languageRef.current,
            socketId,
          });
        }
      });

      // Listen for socket events to update active clients array
      socketInstance.on('clients-updated', ({ clients: updatedClients }) => {
        setClients(updatedClients);
      });

      // Lobby Join Requests (Admin only)
      socketInstance.on('join-request', ({ socketId, username: reqUser }) => {
        setJoinRequests((prev) => {
          if (prev.some((req) => req.socketId === socketId)) return prev;
          return [...prev, { socketId, username: reqUser }];
        });
        toast(`User ${reqUser} is requesting to join the room.`, { icon: '⏳' });
      });

      socketInstance.on('join-request-cancelled', ({ socketId }) => {
        setJoinRequests((prev) => prev.filter((req) => req.socketId !== socketId));
      });

      socketInstance.on('pending-queue-update', ({ pending }) => {
        setJoinRequests(pending);
      });

      // Write permission updates
      socketInstance.on('write-access-changed', ({ writeAccess: hasWrite }) => {
        setWriteAccess(hasWrite);
        if (hasWrite) {
          toast.success('Your write access has been restored! You can edit code now.', { icon: '✏️' });
        } else {
          toast.error('Your write access has been revoked. You are now in Read-Only mode.', { icon: '🔒' });
        }
      });

      // Handle kicks
      socketInstance.on('kicked', () => {
        toast.error('You have been removed from the room by the Admin.', { icon: '🚪', duration: 5000 });
        reactNavigator('/');
      });

      // Receive Admin compilation output sync
      socketInstance.on('compile-result', ({ output, stats }) => {
        setConsoleOutput(output || 'No output returned.');
        setConsoleStats(stats);
        setIsConsoleExpanded(true);
        toast.info('Admin executed code. Execution console updated.', { icon: '💻' });
      });

      // Promotion & admin ownership switches
      socketInstance.on('admin-promoted', ({ pendingRequests }) => {
        setIsAdmin(true);
        setJoinRequests(pendingRequests || []);
        toast.success('You have been promoted to Room Admin!', { icon: '👑', duration: 6000 });
      });

      socketInstance.on('admin-changed', ({ adminName }) => {
        toast.success(`${adminName} is now the Admin of this room.`, { icon: '👑' });
      });

      // Listen for language change sync from other users
      socketInstance.on('language-change', ({ language: newLang }) => {
        setLanguage(newLang);
      });

      // Single-Writer socket event listeners
      socketInstance.on('single-writer-updated', (newState) => {
        setSingleWriterState(newState);
      });

      socketInstance.on('typing-control-requested', ({ requesterSocketId, username: requesterName }) => {
        toast((t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span>✋ <strong>{requesterName}</strong> requested typing control.</span>
            <button
              className="btn btn-compile"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => {
                socketRef.current.emit('set-active-typist', { roomId, targetSocketId: requesterSocketId });
                toast.dismiss(t.id);
              }}
            >
              Grant Control
            </button>
          </div>
        ), { duration: 8000, icon: '✋' });
      });

      // Listen for user leaving room
      socketInstance.on('disconnected', ({ socketId, username: leftUser }) => {
        if (leftUser) {
          toast(`${leftUser} left the room.`, {
            icon: '👋',
          });
        }
        setClients((prev) => prev.filter((client) => client.socketId !== socketId));
      });
    };

    init();

    return () => {
      isSubscribed = false;
      const currentSocket = socketInstance || socketRef.current;
      if (currentSocket) {
        currentSocket.disconnect();
        currentSocket.off('joined');
        currentSocket.off('disconnected');
        currentSocket.off('language-change');
        currentSocket.off('connect_error');
        currentSocket.off('connect_failed');
        currentSocket.off('join-status');
        currentSocket.off('join-request');
        currentSocket.off('join-request-cancelled');
        currentSocket.off('pending-queue-update');
        currentSocket.off('write-access-changed');
        currentSocket.off('clients-updated');
        currentSocket.off('kicked');
        currentSocket.off('compile-result');
        currentSocket.off('admin-promoted');
        currentSocket.off('admin-changed');
      }
    };
  }, []);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    if (socketRef.current) {
      socketRef.current.emit('language-change', {
        roomId,
        language: newLang,
      });
    }

    // Set default code template if editor is empty or on default template
    if (!codeRef.current || Object.values(DEFAULT_TEMPLATES).includes(codeRef.current)) {
      const template = DEFAULT_TEMPLATES[newLang] || '';
      codeRef.current = template;
      if (socketRef.current) {
        socketRef.current.emit('code-change', {
          roomId,
          code: template,
        });
      }
    }
  };

  const copyRoomId = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = roomId;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success('Room ID copied to clipboard!');
    } catch (err) {
      toast.error('Could not copy Room ID');
    }
  };

  const leaveRoom = () => {
    reactNavigator('/');
  };

  // Lobby actions (Admin)
  const handleApproveJoin = (targetSocketId) => {
    if (socketRef.current) {
      socketRef.current.emit('approve-join', { targetSocketId });
      setJoinRequests((prev) => prev.filter((r) => r.socketId !== targetSocketId));
    }
  };

  const handleDenyJoin = (targetSocketId) => {
    if (socketRef.current) {
      socketRef.current.emit('deny-join', { targetSocketId });
      setJoinRequests((prev) => prev.filter((r) => r.socketId !== targetSocketId));
    }
  };

  // User permission/action managers (Admin)
  const handleToggleWriteAccess = (targetSocketId, currentAccess) => {
    if (socketRef.current) {
      socketRef.current.emit('toggle-write-access', {
        targetSocketId,
        writeAccess: !currentAccess,
      });
    }
  };

  const handleKickUser = (targetSocketId) => {
    const confirmKick = window.confirm('Are you sure you want to remove this user from the room?');
    if (confirmKick && socketRef.current) {
      socketRef.current.emit('kick-user', { targetSocketId });
    }
  };

  const handleToggleSingleWriterMode = () => {
    const nextEnabled = !singleWriterState.enabled;
    if (socketRef.current) {
      socketRef.current.emit('toggle-single-writer', { roomId, enabled: nextEnabled });
    }
  };

  const handleRequestTypingControl = () => {
    if (socketRef.current) {
      socketRef.current.emit('request-typing-control', { roomId });
      toast.success('Requested typing control from active typist!', { icon: '✋' });
    }
  };

  const handleSetActiveTypist = (targetSocketId) => {
    if (socketRef.current) {
      socketRef.current.emit('set-active-typist', { roomId, targetSocketId });
    }
  };

  const compileCode = async () => {
    setIsCompiling(true);
    setIsConsoleExpanded(true);
    setConsoleOutput('Compiling code...');
    setConsoleStats(null);

    const currentCode = codeRef.current || DEFAULT_TEMPLATES[language] || '';

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const cleanBackendUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const res = await axios.post(`${cleanBackendUrl}/api/compile`, {
        code: currentCode,
        language,
      });

      const finalOutput = res.data.output || 'No output returned.';
      const finalStats = {
        statusCode: res.data.statusCode || 200,
        memory: res.data.memory,
        cpuTime: res.data.cpuTime,
      };

      setConsoleOutput(finalOutput);
      setConsoleStats(finalStats);

      // If we are the admin, broadcast compilation results to the whole room
      if (isAdmin && socketRef.current) {
        socketRef.current.emit('compile-result', {
          roomId,
          output: finalOutput,
          stats: finalStats,
        });
      }

      if (res.data.statusCode === 200) {
        toast.success('Code executed successfully!');
      } else {
        toast.error('Execution finished with errors.');
      }
    } catch (err) {
      console.error('Compilation error', err);
      const errOutput = `Error executing code:\n${err.response?.data?.error || err.message}`;
      const errStats = { statusCode: 500 };
      
      setConsoleOutput(errOutput);
      setConsoleStats(errStats);
      
      if (isAdmin && socketRef.current) {
        socketRef.current.emit('compile-result', {
          roomId,
          output: errOutput,
          stats: errStats,
        });
      }
      
      toast.error('Compilation request failed.');
    } finally {
      setIsCompiling(false);
    }
  };

  // Render pending lobby overlay if user is waiting for approval
  if (joinStatus === 'pending') {
    return (
      <div className="lobby-overlay">
        <div className="lobby-container">
          <div className="lobby-logo-wrapper">
            <Logo size="large" />
          </div>
          <div className="lobby-spinner-wrapper">
            <div className="lobby-spinner"></div>
          </div>
          <h2 className="lobby-title">Entry Request Pending</h2>
          <p className="lobby-desc">
            Your request to join this room has been sent. Please wait for the Room Admin to grant access.
          </p>
          <div className="lobby-details">
            <div className="detail-item">
              <span className="detail-label">Room ID</span>
              <span className="detail-val font-mono">{roomId}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Your Username</span>
              <span className="detail-val">{username}</span>
            </div>
          </div>
          <button className="btn btn-danger btn-cancel-lobby" onClick={leaveRoom}>
            Cancel Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-page-wrapper">
      {/* Left Sidebar */}
      <aside className="editor-sidebar">
        <div className="sidebar-header">
          <Logo size="normal" onClick={leaveRoom} />
          <span className="room-badge" title={`Room ID: ${roomId}`}>
            Room: {roomId.length > 8 ? `${roomId.substring(0, 8)}...` : roomId}
          </span>
        </div>

        {/* Language Selector (Disabled for non-admin users) */}
        <div className="sidebar-section">
          <label className="sidebar-label" htmlFor="languageSelect">
            <span>🌐</span> Programming Language
          </label>
          <div className={`select-wrapper ${!isAdmin ? 'disabled' : ''}`}>
            <select
              id="languageSelect"
              className="language-dropdown"
              value={language}
              onChange={handleLanguageChange}
              disabled={!isAdmin}
              title={!isAdmin ? 'Only the Room Admin can change the language' : ''}
            >
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="python">Python 3</option>
              <option value="java">Java</option>
              <option value="c">C</option>
              <option value="cpp">C++ (C++17)</option>
            </select>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <div className="sidebar-section">
          <button 
            className="btn btn-secondary" 
            onClick={toggleTheme}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {appTheme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode'}
          </button>
        </div>

        {/* Lobby Pending Join Queue (Admin Only) */}
        {isAdmin && joinRequests.length > 0 && (
          <div className="sidebar-section lobby-section">
            <div className="sidebar-label">
              <span className="ping-dot"></span> Join Requests ({joinRequests.length})
            </div>
            <div className="requests-list">
              {joinRequests.map((req) => (
                <div className="request-card" key={req.socketId}>
                  <div className="request-info">
                    <span className="request-name" title={req.username}>{req.username}</span>
                  </div>
                  <div className="request-actions">
                    <button
                      className="btn-req approve"
                      onClick={() => handleApproveJoin(req.socketId)}
                      title="Approve"
                    >
                      ✔
                    </button>
                    <button
                      className="btn-req deny"
                      onClick={() => handleDenyJoin(req.socketId)}
                      title="Deny"
                    >
                      ✖
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Active Users */}
        <div className="sidebar-section clients-section">
          <div className="sidebar-label">
            <span>👥</span> Connected Users ({clients.length})
          </div>
          <div className="clients-list">
            {clients.map((client) => (
              <Client
                key={client.socketId}
                username={client.username}
                socketId={client.socketId}
                isCurrent={client.username === username}
                isAdmin={client.isAdmin}
                isCurrentUserAdmin={isAdmin}
                writeAccess={client.writeAccess}
                isActiveTypist={singleWriterState.activeTypistSocketId === client.socketId}
                isSingleWriterMode={singleWriterState.enabled}
                onToggleWrite={handleToggleWriteAccess}
                onMakeActiveTypist={handleSetActiveTypist}
                onKick={handleKickUser}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sidebar-footer">
          <button className="btn btn-compile" onClick={compileCode} disabled={isCompiling}>
            {isCompiling ? '⏳ Compiling...' : '▶ Run Code'}
          </button>

          <div className="room-actions">
            <button className="btn btn-secondary btn-copy" onClick={copyRoomId}>
              📋 Copy Room ID
            </button>
            <button className="btn btn-danger btn-leave" onClick={leaveRoom}>
              🚪 Leave Room
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="editor-main">
        {(() => {
          const canWriteEffective = writeAccess && (!singleWriterState.enabled || singleWriterState.activeTypistSocketId === mySocketId);
          return (
            <>
              <div className="editor-header-bar">
                <div className="editor-mode-indicator">
                  <span className={`mode-dot ${!canWriteEffective ? 'mode-dot-readonly' : ''}`}></span>
                  <span>
                    Editing in <strong>{language.toUpperCase()}</strong> 
                    {!canWriteEffective && <span className="readonly-status-tag"> (Read-Only)</span>}
                    {isAdmin && <span className="admin-status-tag"> (Admin)</span>}
                  </span>
                </div>

                {/* Single-Writer Controls */}
                <div className="single-writer-controls">
                  {isAdmin && (
                    <button
                      className={`btn-single-writer-toggle ${singleWriterState.enabled ? 'active' : ''}`}
                      onClick={handleToggleSingleWriterMode}
                      title="Enforce 1 person typing at a time"
                    >
                      {singleWriterState.enabled ? '🔒 Single-Writer: ON' : '🔓 Single-Writer: OFF'}
                    </button>
                  )}

                  {singleWriterState.enabled && (
                    <div className="active-typist-pill">
                      <span>✏️ Typist: <strong>{singleWriterState.activeTypistUsername || 'Admin'}</strong></span>
                      {singleWriterState.activeTypistSocketId !== mySocketId && (
                        <button className="btn-request-control" onClick={handleRequestTypingControl}>
                          ✋ Request Control
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="room-id-display">
                  <span>ROOM: {roomId}</span>
                </div>
              </div>

              {/* CodeMirror 5 Editor */}
              <div className="editor-workspace">
                <Editor
                  socketRef={socketRef}
                  socket={socket}
                  roomId={roomId}
                  language={language}
                  theme={appTheme === 'light' ? 'idea' : 'dracula'}
                  writeAccess={canWriteEffective}
                  onCodeChange={(code) => {
                    codeRef.current = code;
                  }}
                />
              </div>
            </>
          );
        })()}

        {/* Bottom Console Panel */}
        <OutputPanel
          output={consoleOutput}
          isCompiling={isCompiling}
          stats={consoleStats}
          onClear={() => {
            setConsoleOutput('');
            setConsoleStats(null);
          }}
          isExpanded={isConsoleExpanded}
          onToggleExpand={() => setIsConsoleExpanded(!isConsoleExpanded)}
        />
      </main>
    </div>
  );
};

export default EditorPage;
